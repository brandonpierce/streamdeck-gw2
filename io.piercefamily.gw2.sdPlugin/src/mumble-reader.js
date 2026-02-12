/**
 * MumbleLinkReader — reads GW2 MumbleLink shared memory via koffi FFI.
 *
 * GW2 writes the full LinkedMem struct (~5460 bytes) to a Windows shared memory
 * object named "MumbleLink" every frame. We read it on a polling interval and
 * parse out the identity JSON + context struct.
 *
 * Important caveats (for whoever debugs this first):
 * - GW2 does NOT create the shared memory. The consumer must create it first.
 *   We use CreateFileMappingW (not OpenFileMappingW) to ensure it exists.
 * - When GW2 closes, the shared memory is NOT cleared. We detect staleness
 *   by watching uiTick — if it stops incrementing, GW2 is offline.
 * - The identity field is a UTF-16LE encoded JSON string (wchar_t[256]).
 * - Coordinates are in meters; GW2 uses inches internally (1 inch = 0.0254m).
 */

import koffi from "koffi";
import streamDeck from "@elgato/streamdeck";

const logger = streamDeck.logger.createScope("MumbleReader");

// --- Windows API constants ---
const FILE_MAP_ALL_ACCESS = 0x000f001f;
const PAGE_READWRITE = 0x04;
const INVALID_HANDLE_VALUE = -1n; // BigInt for HANDLE comparison

// --- MumbleLink struct layout ---
// Total size of LinkedMem: 5460 bytes
// See https://wiki.guildwars2.com/wiki/API:MumbleLink
const LINKED_MEM_SIZE = 5460;

// Field offsets (manually computed from struct definition)
const OFFSETS = {
  uiVersion: 0, // uint32_t         — 4 bytes
  uiTick: 4, // uint32_t         — 4 bytes
  fAvatarPosition: 8, // float[3]         — 12 bytes
  fAvatarFront: 20, // float[3]         — 12 bytes
  fAvatarTop: 32, // float[3]         — 12 bytes
  name: 44, // wchar_t[256]     — 512 bytes
  fCameraPosition: 556, // float[3]         — 12 bytes
  fCameraFront: 568, // float[3]         — 12 bytes
  fCameraTop: 580, // float[3]         — 12 bytes
  identity: 592, // wchar_t[256]     — 512 bytes
  context_len: 1104, // uint32_t         — 4 bytes
  context: 1108, // unsigned char[256] — 256 bytes
  description: 1364, // wchar_t[2048]    — 4096 bytes
};

// Context struct offsets (relative to context field start)
const CTX_OFFSETS = {
  serverAddress: 0, // unsigned char[28] — 28 bytes
  mapId: 28, // uint32_t          — 4 bytes
  mapType: 32, // uint32_t          — 4 bytes
  shardId: 36, // uint32_t          — 4 bytes
  instance: 40, // uint32_t          — 4 bytes
  buildId: 44, // uint32_t          — 4 bytes
  uiState: 48, // uint32_t          — 4 bytes (bitmask)
  compassWidth: 52, // uint16_t          — 2 bytes
  compassHeight: 54, // uint16_t          — 2 bytes
  compassRotation: 56, // float             — 4 bytes
  playerX: 60, // float             — 4 bytes
  playerY: 64, // float             — 4 bytes
  mapCenterX: 68, // float             — 4 bytes
  mapCenterY: 72, // float             — 4 bytes
  mapScale: 76, // float             — 4 bytes
  processId: 80, // uint32_t          — 4 bytes
  mountIndex: 84, // uint8_t           — 1 byte
};

// uiState bitmask flags
const UI_STATE_FLAGS = {
  isMapOpen: 1 << 0, // Bit 1
  isCompassTopRight: 1 << 1, // Bit 2
  isCompassRotating: 1 << 2, // Bit 3
  gameHasFocus: 1 << 3, // Bit 4
  isCompetitive: 1 << 4, // Bit 5
  textboxHasFocus: 1 << 5, // Bit 6
  isInCombat: 1 << 6, // Bit 7
};

export class MumbleLinkReader {
  #kernel32 = null;
  #CreateFileMappingW = null;
  #MapViewOfFile = null;
  #UnmapViewOfFile = null;
  #CloseHandle = null;
  #hMapFile = null;
  #pView = null;
  #lastTick = 0;
  #staleCycles = 0;
  #maxStaleCycles = 3; // 3 cycles @ 500ms = 1.5s before marking offline

  constructor() {
    this.#initFFI();
  }

  #initFFI() {
    this.#kernel32 = koffi.load("kernel32.dll");

    // HANDLE CreateFileMappingW(HANDLE, SECURITY_ATTRIBUTES*, DWORD, DWORD, DWORD, LPCWSTR)
    this.#CreateFileMappingW = this.#kernel32.func(
      "CreateFileMappingW",
      "void*",
      ["void*", "void*", "uint32_t", "uint32_t", "uint32_t", "str16"]
    );

    // LPVOID MapViewOfFile(HANDLE, DWORD, DWORD, DWORD, SIZE_T)
    this.#MapViewOfFile = this.#kernel32.func(
      "MapViewOfFile",
      "void*",
      ["void*", "uint32_t", "uint32_t", "uint32_t", "uintptr_t"]
    );

    // BOOL UnmapViewOfFile(LPCVOID)
    this.#UnmapViewOfFile = this.#kernel32.func(
      "UnmapViewOfFile",
      "int",
      ["void*"]
    );

    // BOOL CloseHandle(HANDLE)
    this.#CloseHandle = this.#kernel32.func(
      "CloseHandle",
      "int",
      ["void*"]
    );
  }

  /**
   * Open the MumbleLink shared memory. Must be called before read().
   * Creates the shared memory if it doesn't exist (required — GW2 won't create it).
   * Returns true if successful.
   */
  open() {
    try {
      // CreateFileMappingW with INVALID_HANDLE_VALUE creates or opens a named mapping
      this.#hMapFile = this.#CreateFileMappingW(
        -1, // INVALID_HANDLE_VALUE — backed by page file
        null, // Default security
        PAGE_READWRITE, // Read/write so GW2 can write to it
        0, // High-order DWORD of size
        LINKED_MEM_SIZE, // Low-order DWORD of size
        "MumbleLink" // Name of the mapping object
      );

      if (!this.#hMapFile) {
        logger.error("CreateFileMappingW returned null");
        return false;
      }

      this.#pView = this.#MapViewOfFile(
        this.#hMapFile,
        FILE_MAP_ALL_ACCESS,
        0,
        0,
        LINKED_MEM_SIZE
      );

      if (!this.#pView) {
        logger.error("MapViewOfFile returned null");
        this.#CloseHandle(this.#hMapFile);
        this.#hMapFile = null;
        return false;
      }

      logger.info("Shared memory opened successfully");
      return true;
    } catch (err) {
      logger.error("Failed to open shared memory:", err.message);
      return false;
    }
  }

  /**
   * Read the current MumbleLink state. Returns a parsed state object,
   * or null if the shared memory isn't open.
   */
  read() {
    if (!this.#pView) {
      return null;
    }

    try {
      // Read the entire struct into a Node.js Buffer
      const buf = Buffer.from(
        koffi.decode(this.#pView, "uint8_t", LINKED_MEM_SIZE)
      );

      // Parse top-level fields
      const uiVersion = buf.readUInt32LE(OFFSETS.uiVersion);
      const uiTick = buf.readUInt32LE(OFFSETS.uiTick);

      // Stale detection: is GW2 still writing?
      if (uiTick === this.#lastTick) {
        this.#staleCycles++;
      } else {
        this.#staleCycles = 0;
        this.#lastTick = uiTick;
      }

      const connected = this.#staleCycles < this.#maxStaleCycles;

      // Parse identity JSON (UTF-16LE encoded wchar_t[256])
      const identity = this.#parseIdentity(buf);

      // Parse context struct
      const context = this.#parseContext(buf);

      // Parse position data
      const avatarPosition = this.#readFloat3(buf, OFFSETS.fAvatarPosition);
      const avatarFront = this.#readFloat3(buf, OFFSETS.fAvatarFront);
      const cameraPosition = this.#readFloat3(buf, OFFSETS.fCameraPosition);
      const cameraFront = this.#readFloat3(buf, OFFSETS.fCameraFront);

      return {
        connected,
        uiVersion,
        uiTick,
        identity,
        context,
        avatarPosition,
        avatarFront,
        cameraPosition,
        cameraFront,
      };
    } catch (err) {
      logger.error("Read error:", err.message);
      return null;
    }
  }

  /**
   * Parse the identity field — a UTF-16LE JSON string.
   */
  #parseIdentity(buf) {
    try {
      // Extract the wchar_t[256] field (512 bytes of UTF-16LE)
      const identityBuf = buf.subarray(
        OFFSETS.identity,
        OFFSETS.identity + 512
      );

      // Decode UTF-16LE, trim null characters
      const identityStr = identityBuf
        .toString("utf16le")
        .replace(/\0+$/, "")
        .trim();

      if (!identityStr) {
        return null;
      }

      return JSON.parse(identityStr);
    } catch (err) {
      logger.error("Identity parse error:", err.message);
      return null;
    }
  }

  /**
   * Parse the context struct and extract uiState flags.
   */
  #parseContext(buf) {
    const ctxBase = OFFSETS.context;

    const uiState = buf.readUInt32LE(ctxBase + CTX_OFFSETS.uiState);

    return {
      mapId: buf.readUInt32LE(ctxBase + CTX_OFFSETS.mapId),
      mapType: buf.readUInt32LE(ctxBase + CTX_OFFSETS.mapType),
      shardId: buf.readUInt32LE(ctxBase + CTX_OFFSETS.shardId),
      instance: buf.readUInt32LE(ctxBase + CTX_OFFSETS.instance),
      buildId: buf.readUInt32LE(ctxBase + CTX_OFFSETS.buildId),
      processId: buf.readUInt32LE(ctxBase + CTX_OFFSETS.processId),
      mountIndex: buf.readUInt8(ctxBase + CTX_OFFSETS.mountIndex),
      playerX: buf.readFloatLE(ctxBase + CTX_OFFSETS.playerX),
      playerY: buf.readFloatLE(ctxBase + CTX_OFFSETS.playerY),
      mapScale: buf.readFloatLE(ctxBase + CTX_OFFSETS.mapScale),

      // Decoded uiState bitmask
      uiState: {
        raw: uiState,
        isMapOpen: !!(uiState & UI_STATE_FLAGS.isMapOpen),
        isCompassTopRight: !!(uiState & UI_STATE_FLAGS.isCompassTopRight),
        isCompassRotating: !!(uiState & UI_STATE_FLAGS.isCompassRotating),
        gameHasFocus: !!(uiState & UI_STATE_FLAGS.gameHasFocus),
        isCompetitive: !!(uiState & UI_STATE_FLAGS.isCompetitive),
        textboxHasFocus: !!(uiState & UI_STATE_FLAGS.textboxHasFocus),
        isInCombat: !!(uiState & UI_STATE_FLAGS.isInCombat),
      },
    };
  }

  /**
   * Read 3 consecutive floats from a buffer offset.
   */
  #readFloat3(buf, offset) {
    return [
      buf.readFloatLE(offset),
      buf.readFloatLE(offset + 4),
      buf.readFloatLE(offset + 8),
    ];
  }

  /**
   * Clean up shared memory handles.
   */
  close() {
    if (this.#pView) {
      this.#UnmapViewOfFile(this.#pView);
      this.#pView = null;
    }
    if (this.#hMapFile) {
      this.#CloseHandle(this.#hMapFile);
      this.#hMapFile = null;
    }
    logger.info("Shared memory closed");
  }
}
