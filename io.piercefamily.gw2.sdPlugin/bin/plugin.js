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

// Trading Post modules
import { TpItemIndex } from "../src/cache/tp-item-index.js";
import { TpPricesCache } from "../src/cache/tp-prices.js";
import { TpPriceAction } from "../src/actions/tp-price.js";

// --- Resolve data directory ---
// The Stream Deck SDK provides a data directory for persistent storage.
// During development/testing, fall back to a local directory.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.GW2_SD_DATA_DIR || path.join(__dirname, "..", "data");

const logger = streamDeck.logger.createScope("Plugin");

// --- Initialize ---
logger.info("Starting GW2 MumbleLink plugin...");
logger.info(`Data directory: ${DATA_DIR}`);

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

// --- Trading Post subsystem ---
const tpItemIndex = new TpItemIndex(stateManager.getDb(), stateManager.getApiClient());
const tpPricesCache = new TpPricesCache(stateManager.getDb(), stateManager.getApiClient());
streamDeck.actions.registerAction(new TpPriceAction(tpItemIndex, tpPricesCache));

// --- Connect to Stream Deck and start ---
streamDeck.connect().then(() => {
  logger.info("Connected to Stream Deck");
  stateManager.start();

  // Build TP item index in background (no-op if already fresh)
  tpItemIndex.build().catch((err) => {
    logger.error("TP item index build failed:", err.message);
  });
}).catch((err) => {
  logger.error("Failed to connect to Stream Deck:", err.message);
});

// --- Graceful shutdown ---
process.on("SIGINT", () => {
  logger.info("Shutting down...");
  stateManager.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Shutting down...");
  stateManager.stop();
  process.exit(0);
});

// Handle uncaught errors gracefully
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection:", reason);
});
