/**
 * Database — SQLite connection, schema creation, and seeding.
 *
 * Uses better-sqlite3 for synchronous access (fine for our use case —
 * cache lookups should be fast and we're not doing them on a hot path).
 *
 * The DB file lives in the plugin's data directory provided by the
 * Stream Deck SDK at runtime.
 */

import Database from "better-sqlite3";
import path from "path";
import { MAP_TYPES_SEED } from "../seed/map-types.js";
import { WVW_TEAM_COLORS_SEED } from "../seed/wvw-team-colors.js";
import { MOUNTS_SEED } from "../seed/mounts.js";
import { PROFESSIONS_SEED } from "../seed/professions.js";

const SCHEMA_VERSION = 1;

export class CacheDatabase {
  #db = null;

  /**
   * @param {string} dataDir — directory to store the SQLite file.
   *   In production this comes from the Stream Deck SDK's plugin data path.
   *   For testing, pass any writable directory.
   */
  constructor(dataDir) {
    const dbPath = path.join(dataDir, "cache.db");
    this.#db = new Database(dbPath);

    // WAL mode for better concurrent read performance
    this.#db.pragma("journal_mode = WAL");

    this.#initSchema();
    this.#seedStaticData();
  }

  /**
   * Get the raw better-sqlite3 instance (for cache accessors).
   */
  get db() {
    return this.#db;
  }

  #initSchema() {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS maps (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        fetched_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS professions (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        fetched_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS specializations (
        id              INTEGER PRIMARY KEY,
        name            TEXT NOT NULL,
        profession_id   INTEGER NOT NULL,
        elite           INTEGER NOT NULL DEFAULT 0,
        fetched_at      INTEGER NOT NULL,
        FOREIGN KEY (profession_id) REFERENCES professions(id)
      );

      CREATE TABLE IF NOT EXISTS mounts (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        fetched_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS wvw_objectives (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        type        TEXT,
        map_id      INTEGER,
        fetched_at  INTEGER NOT NULL,
        FOREIGN KEY (map_id) REFERENCES maps(id)
      );

      CREATE TABLE IF NOT EXISTS currencies (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        icon_url    TEXT,
        fetched_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS map_types (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS wvw_team_colors (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schema_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Track schema version for future migrations
    const existing = this.#db
      .prepare("SELECT value FROM schema_meta WHERE key = 'version'")
      .get();

    if (!existing) {
      this.#db
        .prepare("INSERT INTO schema_meta (key, value) VALUES ('version', ?)")
        .run(String(SCHEMA_VERSION));
    }
  }

  /**
   * Seed static enum tables. Uses INSERT OR IGNORE so re-running is safe.
   */
  #seedStaticData() {
    const seedMapType = this.#db.prepare(
      "INSERT OR IGNORE INTO map_types (id, name) VALUES (?, ?)"
    );
    const seedTeamColor = this.#db.prepare(
      "INSERT OR IGNORE INTO wvw_team_colors (id, name) VALUES (?, ?)"
    );
    const seedMount = this.#db.prepare(
      "INSERT OR REPLACE INTO mounts (id, name, fetched_at) VALUES (?, ?, ?)"
    );
    const seedProfession = this.#db.prepare(
      "INSERT OR REPLACE INTO professions (id, name, fetched_at) VALUES (?, ?, ?)"
    );

    const now = Math.floor(Date.now() / 1000);

    this.#db.transaction(() => {
      for (const [id, name] of Object.entries(MAP_TYPES_SEED)) {
        seedMapType.run(Number(id), name);
      }
      for (const [id, name] of Object.entries(WVW_TEAM_COLORS_SEED)) {
        seedTeamColor.run(Number(id), name);
      }
      for (const [id, name] of Object.entries(MOUNTS_SEED)) {
        seedMount.run(Number(id), name, now);
      }
      for (const [id, name] of Object.entries(PROFESSIONS_SEED)) {
        seedProfession.run(Number(id), name, now);
      }
    })();

    console.log("[CacheDB] Static data seeded");
  }

  /**
   * Close the database connection.
   */
  close() {
    if (this.#db) {
      this.#db.close();
      this.#db = null;
      console.log("[CacheDB] Database closed");
    }
  }
}
