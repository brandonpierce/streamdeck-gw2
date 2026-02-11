/**
 * Test harness for MumbleLinkReader.
 *
 * Run this alongside GW2 to verify the shared memory read is working.
 * No Stream Deck required — just prints state to console every second.
 *
 * Usage:
 *   npm run test:mumble
 *   (or: node src/test-mumble.js)
 */

import { MumbleLinkReader } from "./mumble-reader.js";

const reader = new MumbleLinkReader();

if (!reader.open()) {
  console.error("Failed to open MumbleLink shared memory.");
  console.error("Make sure you're running this on Windows.");
  process.exit(1);
}

console.log("MumbleLink reader opened. Polling every 1s...");
console.log("Start GW2 if it isn't running. Press Ctrl+C to stop.\n");

let lastTick = 0;

const interval = setInterval(() => {
  const data = reader.read();

  if (!data) {
    console.log("[No data]");
    return;
  }

  if (!data.connected) {
    console.log("[GW2 not connected — uiTick stale]");
    return;
  }

  // Only print when something changes (based on uiTick)
  if (data.uiTick === lastTick) return;
  lastTick = data.uiTick;

  const id = data.identity || {};
  const ctx = data.context || {};
  const ui = ctx.uiState || {};

  console.log("─".repeat(60));
  console.log(`  uiTick:      ${data.uiTick}`);
  console.log(`  Character:   ${id.name || "?"} (${id.race ?? "?"})`);
  console.log(`  Profession:  ${id.profession || "?"} | Spec: ${id.spec || "none"}`);
  console.log(`  Map ID:      ${id.map_id || ctx.mapId || "?"}`);
  console.log(`  Map Type:    ${ctx.mapType ?? "?"}`);
  console.log(`  Mount:       ${ctx.mountIndex ?? "?"}`);
  console.log(`  Commander:   ${id.commander ?? false}`);
  console.log(`  Team Color:  ${id.team_color_id ?? 0}`);
  console.log(`  In Combat:   ${ui.isInCombat ?? false}`);
  console.log(`  Chat Focus:  ${ui.textboxHasFocus ?? false}`);
  console.log(`  Game Focus:  ${ui.gameHasFocus ?? false}`);
  console.log(`  Position:    [${data.avatarPosition?.map((v) => v.toFixed(2)).join(", ")}]`);
}, 1000);

process.on("SIGINT", () => {
  clearInterval(interval);
  reader.close();
  console.log("\nDone.");
  process.exit(0);
});
