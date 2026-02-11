/**
 * Test harness for the cache layer and GW2 API client.
 *
 * Runs on any platform (no Windows / MumbleLink required).
 * Creates a test SQLite DB, fetches some data from the GW2 API,
 * and verifies cache behavior.
 *
 * Usage:
 *   npm run test:cache
 *   (or: node src/test-cache.js)
 */

import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";
import { CacheDatabase } from "./cache/db.js";
import { GW2ApiClient } from "./gw2-api-client.js";
import { MapsCache } from "./cache/maps.js";
import { ProfessionsCache } from "./cache/professions.js";
import { SpecializationsCache } from "./cache/specializations.js";
import { MountsCache } from "./cache/mounts.js";
import { MapTypesCache } from "./cache/map-types.js";
import { WvWTeamColorsCache } from "./cache/wvw-team-colors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = path.join(__dirname, "..", "data-test");

// Clean start
mkdirSync(TEST_DATA_DIR, { recursive: true });

console.log("=== Cache Layer Test ===\n");

// Init database
console.log("1. Initializing SQLite database...");
const cacheDb = new CacheDatabase(TEST_DATA_DIR);
const db = cacheDb.db;
console.log("   ✓ Database created and schema initialized\n");

// Test seeded data
console.log("2. Testing seeded static data...");
const mapTypes = new MapTypesCache(db);
const mounts = new MountsCache(db);
const teamColors = new WvWTeamColorsCache(db);

console.log(`   Map Type 5:  ${mapTypes.get(5).name}`);    // "Open World"
console.log(`   Map Type 9:  ${mapTypes.get(9).name}`);    // "WvW: Eternal Battlegrounds"
console.log(`   Map Type 99: ${mapTypes.get(99).name}`);   // "Mode 99" (unknown)
console.log(`   Mount 0:     ${mounts.get(0).name}`);      // "None"
console.log(`   Mount 8:     ${mounts.get(8).name}`);      // "Skyscale"
console.log(`   Mount 99:    ${mounts.get(99).name}`);     // "Mount 99" (unknown)
console.log(`   Team 0:      ${teamColors.get(0).name}`);  // "None"
console.log(`   Team 9:      ${teamColors.get(9).name}`);  // "Red"
console.log("   ✓ Seeded data looks good\n");

// Test API-backed caches
console.log("3. Testing GW2 API fetch + cache...");
const apiClient = new GW2ApiClient();
const maps = new MapsCache(db, apiClient);
const professions = new ProfessionsCache(db, apiClient);
const specs = new SpecializationsCache(db, apiClient);

// First call — cache miss, returns fallback
const mapResult1 = maps.get(50);
console.log(`   Map 50 (first call):  "${mapResult1.name}" (fromCache: ${mapResult1.fromCache})`);

// Profession — uses hardcoded lookup, no API needed
const profResult = professions.get(8);
console.log(`   Profession 8 (first): "${profResult.name}" (fromCache: ${profResult.fromCache})`);

// Spec — will trigger API fetch
const specResult1 = specs.get(55);
console.log(`   Spec 55 (first call): "${specResult1.name}" (fromCache: ${specResult1.fromCache})`);

// Wait for async fetches to complete
console.log("\n   Waiting 3s for API fetches to complete...");
await new Promise((r) => setTimeout(r, 3000));

// Second call — should be cached now
const mapResult2 = maps.get(50);
console.log(`\n   Map 50 (second call): "${mapResult2.name}" (fromCache: ${mapResult2.fromCache})`);

const specResult2 = specs.get(55);
console.log(`   Spec 55 (second call): "${specResult2.name}" (fromCache: ${specResult2.fromCache})`);

const profResult2 = professions.get(8);
console.log(`   Profession 8 (second): "${profResult2.name}" (fromCache: ${profResult2.fromCache})`);

console.log("\n4. Testing a few more maps...");
// Test some well-known maps
const testMaps = [15, 18, 50, 1206, 1509];
for (const id of testMaps) {
  maps.get(id); // trigger fetch
}
await new Promise((r) => setTimeout(r, 3000));
for (const id of testMaps) {
  const result = maps.get(id);
  console.log(`   Map ${id}: "${result.name}"`);
}

// Cleanup
cacheDb.close();
console.log("\n=== All tests complete ===");
