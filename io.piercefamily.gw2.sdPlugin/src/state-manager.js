/**
 * StateManager — core orchestrator.
 *
 * Polls MumbleLinkReader on an interval, resolves raw IDs to names via
 * the cache layer, diffs against previous state, and emits changes to
 * registered listeners (Stream Deck action instances).
 *
 * Design decisions:
 * - Polling at 500ms is plenty for UI updates on Stream Deck buttons.
 * - State diffing prevents unnecessary setTitle/setImage calls (which
 *   are not free — each one is a message over the SDK websocket).
 * - Cache lookups are synchronous (better-sqlite3). API fetches for
 *   cache misses are async and fire-and-forget — the button shows a
 *   fallback until the next poll cycle picks up the cached value.
 */

import streamDeck from "@elgato/streamdeck";
import { MumbleLinkReader } from "./mumble-reader.js";
import { GW2ApiClient } from "./gw2-api-client.js";
import { CacheDatabase } from "./cache/db.js";
import { MapsCache } from "./cache/maps.js";
import { ProfessionsCache } from "./cache/professions.js";
import { SpecializationsCache } from "./cache/specializations.js";
import { MountsCache } from "./cache/mounts.js";
import { MapTypesCache } from "./cache/map-types.js";
import { WvWTeamColorsCache } from "./cache/wvw-team-colors.js";

const logger = streamDeck.logger.createScope("StateManager");

const POLL_INTERVAL_MS = 500;

export class StateManager {
  #reader = null;
  #cacheDb = null;
  #apiClient = null;

  // Cache accessors
  #maps = null;
  #professions = null;
  #specializations = null;
  #mounts = null;
  #mapTypes = null;
  #wvwTeamColors = null;

  // Polling
  #pollTimer = null;
  #previousState = null;

  // Listeners: Map<string, Set<Function>>
  // Keys are field names, values are sets of callbacks.
  #listeners = new Map();

  /**
   * @param {string} dataDir — directory for SQLite database storage.
   */
  constructor(dataDir) {
    this.#reader = new MumbleLinkReader();
    this.#apiClient = new GW2ApiClient();
    this.#cacheDb = new CacheDatabase(dataDir);

    const db = this.#cacheDb.db;
    this.#maps = new MapsCache(db, this.#apiClient);
    this.#professions = new ProfessionsCache(db, this.#apiClient);
    this.#specializations = new SpecializationsCache(db, this.#apiClient);
    this.#mounts = new MountsCache(db);
    this.#mapTypes = new MapTypesCache(db);
    this.#wvwTeamColors = new WvWTeamColorsCache(db);
  }

  /**
   * Get the raw better-sqlite3 database handle.
   * Used by the TP subsystem which manages its own tables.
   */
  getDb() {
    return this.#cacheDb.db;
  }

  /**
   * Get the shared API client instance.
   */
  getApiClient() {
    return this.#apiClient;
  }

  /**
   * Start polling MumbleLink.
   */
  start() {
    const opened = this.#reader.open();
    if (!opened) {
      logger.error("Failed to open MumbleLink — will retry on next poll");
    }

    this.#pollTimer = setInterval(() => this.#poll(), POLL_INTERVAL_MS);
    logger.info(`Polling started (${POLL_INTERVAL_MS}ms interval)`);

    // Run first poll immediately
    this.#poll();
  }

  /**
   * Stop polling and clean up.
   */
  stop() {
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = null;
    }
    this.#reader.close();
    this.#cacheDb.close();
    logger.info("Stopped");
  }

  /**
   * Restart polling after a system wake event.
   * Closes and reopens the MumbleLink shared memory handle (which may
   * have gone stale during sleep), resets previous state so all listeners
   * get a fresh update, and restarts the poll timer. Does NOT close the
   * database — SQLite handles sleep/wake fine.
   */
  restart() {
    logger.info("Restarting after system wake...");

    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = null;
    }

    this.#reader.close();
    this.#previousState = null;

    const opened = this.#reader.open();
    if (!opened) {
      logger.error("Failed to reopen MumbleLink after wake — will retry on next poll");
    }

    this.#pollTimer = setInterval(() => this.#poll(), POLL_INTERVAL_MS);
    logger.info("Restart complete — polling resumed");

    this.#poll();
  }

  /**
   * Register a listener for state changes.
   *
   * @param {string} field — which state field to watch. Use '*' for all changes.
   * @param {Function} callback — called with (newValue, fullState) on change.
   * @returns {Function} unsubscribe function.
   */
  on(field, callback) {
    if (!this.#listeners.has(field)) {
      this.#listeners.set(field, new Set());
    }
    this.#listeners.get(field).add(callback);

    return () => {
      const set = this.#listeners.get(field);
      if (set) set.delete(callback);
    };
  }

  /**
   * Get the current resolved state. Useful for actions that need the full
   * state on initialization (e.g., when a button first appears).
   */
  getCurrentState() {
    return this.#previousState;
  }

  /**
   * Core poll loop. Reads MumbleLink, resolves names, diffs, and notifies.
   */
  #poll() {
    const raw = this.#reader.read();

    // Build resolved state
    const state = this.#resolveState(raw);

    // Diff and notify
    this.#diffAndNotify(state);

    // Store for next diff
    this.#previousState = state;
  }

  /**
   * Transform raw MumbleLink data into a resolved state object with
   * human-readable names.
   */
  #resolveState(raw) {
    if (!raw || !raw.connected) {
      return {
        connected: false,
        profession: { id: 0, name: "Unknown" },
        specialization: { id: 0, name: "None", elite: false },
        mapName: { id: 0, name: "Unknown" },
        gameMode: { id: 0, name: "Unknown" },
        inCombat: false,
        textboxFocused: false,
        gameHasFocus: false,
        commander: false,
        mount: { id: 0, name: "None" },
        wvwTeam: { id: 0, name: "None" },
        characterName: "",
      };
    }

    const identity = raw.identity || {};
    const context = raw.context || {};
    const uiState = context.uiState || {};

    const professionId = identity.profession || 0;
    const specId = identity.spec || 0;
    const mapId = identity.map_id || context.mapId || 0;
    const mapType = context.mapType || 0;
    const mountIndex = context.mountIndex || 0;
    const teamColorId = identity.team_color_id || 0;

    return {
      connected: true,
      profession: {
        id: professionId,
        name: this.#professions.get(professionId).name,
      },
      specialization: {
        id: specId,
        ...this.#specializations.get(specId),
      },
      mapName: {
        id: mapId,
        name: this.#maps.get(mapId).name,
      },
      gameMode: {
        id: mapType,
        name: this.#mapTypes.get(mapType).name,
      },
      inCombat: uiState.isInCombat || false,
      textboxFocused: uiState.textboxHasFocus || false,
      gameHasFocus: uiState.gameHasFocus || false,
      commander: identity.commander || false,
      mount: {
        id: mountIndex,
        name: this.#mounts.get(mountIndex).name,
      },
      wvwTeam: {
        id: teamColorId,
        name: this.#wvwTeamColors.get(teamColorId).name,
      },
      characterName: identity.name || "",
    };
  }

  /**
   * Compare new state to previous and notify listeners of changed fields.
   */
  #diffAndNotify(newState) {
    const prev = this.#previousState;
    const changedFields = [];

    // On first poll (no previous state), everything is "changed"
    if (!prev) {
      changedFields.push(...Object.keys(newState));
    } else {
      for (const key of Object.keys(newState)) {
        if (!this.#isEqual(prev[key], newState[key])) {
          changedFields.push(key);
        }
      }
    }

    if (changedFields.length === 0) return;

    // Notify field-specific listeners
    for (const field of changedFields) {
      const listeners = this.#listeners.get(field);
      if (listeners) {
        for (const cb of listeners) {
          try {
            cb(newState[field], newState);
          } catch (err) {
            logger.error(`Listener error for '${field}':`, err.message);
          }
        }
      }
    }

    // Notify wildcard listeners
    const wildcardListeners = this.#listeners.get("*");
    if (wildcardListeners) {
      for (const cb of wildcardListeners) {
        try {
          cb(changedFields, newState);
        } catch (err) {
          logger.error("Wildcard listener error:", err.message);
        }
      }
    }
  }

  /**
   * Deep-ish equality check for state values.
   * Handles primitives and simple objects (our state values are either
   * primitives or {id, name} pairs).
   */
  #isEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object" || a === null || b === null) return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (a[key] !== b[key]) return false;
    }
    return true;
  }
}
