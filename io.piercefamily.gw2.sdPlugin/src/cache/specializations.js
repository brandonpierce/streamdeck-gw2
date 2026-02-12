/**
 * SpecializationsCache — typed accessor for the specializations table.
 *
 * Elite specializations are what make this interesting — MumbleLink gives us
 * a spec ID in the identity JSON's `spec` field. This is the third specialization
 * slot, which is either 0 (no elite) or the ID of the equipped elite spec.
 *
 * We resolve these via /v2/specializations/<id> from the GW2 API.
 */

import streamDeck from "@elgato/streamdeck";

const logger = streamDeck.logger.createScope("SpecializationsCache");

const STALE_AFTER_DAYS = 90;

export class SpecializationsCache {
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
      "SELECT id, name, profession_id, elite, fetched_at FROM specializations WHERE id = ?"
    );
    this.#stmtUpsert = this.#db.prepare(
      "INSERT OR REPLACE INTO specializations (id, name, profession_id, elite, fetched_at) VALUES (?, ?, ?, ?, ?)"
    );
  }

  /**
   * Get a specialization name by ID.
   * @param {number} specId — 0 means no elite spec equipped.
   * @returns {{ name: string, elite: boolean, fromCache: boolean }}
   */
  get(specId) {
    if (specId === 0) {
      return { name: "Core", elite: false, fromCache: true };
    }

    const row = this.#stmtGet.get(specId);

    if (row) {
      if (this.#isStale(row.fetched_at)) {
        this.#fetchAndStore(specId);
      }
      return { name: row.name, elite: !!row.elite, fromCache: true };
    }

    // Cache miss
    this.#fetchAndStore(specId);
    return { name: `Spec ${specId}`, elite: false, fromCache: false };
  }

  async #fetchAndStore(specId) {
    try {
      const data = await this.#apiClient.getSpecialization(specId);
      if (data) {
        const now = Math.floor(Date.now() / 1000);
        this.#stmtUpsert.run(
          data.id,
          data.name,
          data.profession_id,
          data.elite ? 1 : 0,
          now
        );
      }
    } catch (err) {
      logger.error(
        `Failed to fetch spec ${specId}:`,
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
