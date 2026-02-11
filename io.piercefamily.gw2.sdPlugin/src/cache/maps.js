/**
 * MapsCache — typed accessor for the maps table.
 * Lazy-fetches from the GW2 API on cache miss.
 */

const STALE_AFTER_DAYS = 30;

export class MapsCache {
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
      "SELECT id, name, fetched_at FROM maps WHERE id = ?"
    );
    this.#stmtUpsert = this.#db.prepare(
      "INSERT OR REPLACE INTO maps (id, name, fetched_at) VALUES (?, ?, ?)"
    );
  }

  /**
   * Get a map name by ID. Returns immediately from cache if available.
   * If missing or stale, triggers a background fetch and returns what we have
   * (or a fallback string).
   *
   * @param {number} mapId
   * @returns {{ name: string, fromCache: boolean }}
   */
  get(mapId) {
    const row = this.#stmtGet.get(mapId);

    if (row) {
      // Check staleness — refresh in background if old, but still return cached value
      if (this.#isStale(row.fetched_at)) {
        this.#fetchAndStore(mapId); // fire-and-forget
      }
      return { name: row.name, fromCache: true };
    }

    // Cache miss — trigger fetch, return fallback
    this.#fetchAndStore(mapId); // fire-and-forget
    return { name: `Map ${mapId}`, fromCache: false };
  }

  /**
   * Fetch from API and store in cache. Async, meant to be fire-and-forget
   * from synchronous get() calls.
   */
  async #fetchAndStore(mapId) {
    try {
      const data = await this.#apiClient.getMap(mapId);
      if (data) {
        const now = Math.floor(Date.now() / 1000);
        this.#stmtUpsert.run(data.id, data.name, now);
      }
    } catch (err) {
      console.error(`[MapsCache] Failed to fetch map ${mapId}:`, err.message);
    }
  }

  /**
   * Check if a fetched_at timestamp is older than the staleness threshold.
   */
  #isStale(fetchedAt) {
    const now = Math.floor(Date.now() / 1000);
    const maxAge = STALE_AFTER_DAYS * 24 * 60 * 60;
    return now - fetchedAt > maxAge;
  }
}
