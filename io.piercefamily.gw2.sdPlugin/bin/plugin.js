/**
 * Plugin entry point — wires together Stream Deck SDK, StateManager,
 * and all action registrations.
 *
 * The Stream Deck SDK v6 runs plugins as Node.js processes. This file
 * is the main entry point specified in manifest.json → Nodejs.
 */

import streamDeck from "@elgato/streamdeck";
import path from "path";
import { fileURLToPath } from "url";
import { StateManager } from "../src/state-manager.js";

// Action classes
import { ProfessionAction } from "../src/actions/profession.js";
import { GameModeAction } from "../src/actions/game-mode.js";
import { MapNameAction } from "../src/actions/map-name.js";
import { CombatAction } from "../src/actions/combat.js";
import { ChatFocusAction } from "../src/actions/chat-focus.js";
import { CommanderAction } from "../src/actions/commander.js";
import { MountAction } from "../src/actions/mount.js";
import { WvWTeamAction } from "../src/actions/wvw-team.js";
import { GameFocusAction } from "../src/actions/game-focus.js";

// --- Resolve data directory ---
// The Stream Deck SDK provides a data directory for persistent storage.
// During development/testing, fall back to a local directory.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.GW2_SD_DATA_DIR || path.join(__dirname, "..", "data");

// --- Initialize ---
console.log("[Plugin] Starting GW2 MumbleLink plugin...");
console.log(`[Plugin] Data directory: ${DATA_DIR}`);

// Ensure data directory exists
import { mkdirSync } from "fs";
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch (err) {
  // Directory already exists, that's fine
}

// Create the state manager (opens MumbleLink + SQLite)
const stateManager = new StateManager(DATA_DIR);

// --- Register all actions ---
streamDeck.actions.registerAction(new ProfessionAction(stateManager));
streamDeck.actions.registerAction(new GameModeAction(stateManager));
streamDeck.actions.registerAction(new MapNameAction(stateManager));
streamDeck.actions.registerAction(new CombatAction(stateManager));
streamDeck.actions.registerAction(new ChatFocusAction(stateManager));
streamDeck.actions.registerAction(new CommanderAction(stateManager));
streamDeck.actions.registerAction(new MountAction(stateManager));
streamDeck.actions.registerAction(new WvWTeamAction(stateManager));
streamDeck.actions.registerAction(new GameFocusAction(stateManager));

// --- Connect to Stream Deck and start ---
streamDeck.connect().then(() => {
  console.log("[Plugin] Connected to Stream Deck");
  stateManager.start();
}).catch((err) => {
  console.error("[Plugin] Failed to connect to Stream Deck:", err.message);
});

// --- Graceful shutdown ---
process.on("SIGINT", () => {
  console.log("[Plugin] Shutting down...");
  stateManager.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[Plugin] Shutting down...");
  stateManager.stop();
  process.exit(0);
});

// Handle uncaught errors gracefully
process.on("uncaughtException", (err) => {
  console.error("[Plugin] Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Plugin] Unhandled rejection:", reason);
});
