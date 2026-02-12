/**
 * ProfessionsCache — typed accessor for the professions table.
 *
 * Professions are effectively static (9 professions, hasn't changed since
 * Revenant was added with Heart of Thorns in 2015). The API client resolves
 * the numeric ID → name mapping directly, so this is mostly about consistency
 * with the cache pattern.
 */

import streamDeck from "@elgato/streamdeck";

const logger = streamDeck.logger.createScope("ProfessionsCache");

const STALE_AFTER_DAYS = 90;

export class ProfessionsCache {
  #db = null;
  #apiClient = null;
  #stmtGet = null;
  #stmtUpsert = null;

  /**
   * @param {import('better-sqlite3').Database} db
   * @param {import('../gw2-api-client.js').GW2ApiClient} apiClient
   */
  constructor(db, apiClient) {
    this.#db = db;
    this.#apiClient = apiClient;

    this.#stmtGet = this.#db.prepare(
      "SELECT id, name, fetched_at FROM professions WHERE id = ?"
    );
    this.#stmtUpsert = this.#db.prepare(
      "INSERT OR REPLACE INTO professions (id, name, fetched_at) VALUES (?, ?, ?)"
    );
  }

  /**
   * Get a profession name by numeric ID (1-9).
   * @param {number} professionId
   * @returns {{ name: string, fromCache: boolean }}
   */
  get(professionId) {
    if (professionId === 0) {
      return { name: "None", fromCache: true };
    }

    const row = this.#stmtGet.get(professionId);

    if (row) {
      if (this.#isStale(row.fetched_at)) {
        this.#fetchAndStore(professionId);
      }
      return { name: row.name, fromCache: true };
    }

    // Cache miss — fetch and store
    this.#fetchAndStore(professionId);
    return { name: `Profession ${professionId}`, fromCache: false };
  }

  async #fetchAndStore(professionId) {
    try {
      const data = await this.#apiClient.getProfession(professionId);
      if (data) {
        const now = Math.floor(Date.now() / 1000);
        this.#stmtUpsert.run(data.id, data.name, now);
      }
    } catch (err) {
      logger.error(
        `Failed to fetch profession ${professionId}:`,
        err.message
      );
    }
  }

  #isStale(fetchedAt) {
    const now = Math.floor(Date.now() / 1000);
    const maxAge = STALE_AFTER_DAYS * 24 * 60 * 60;
    return now - fetchedAt > maxAge;
  }
}
