/**
 * TpItemIndex — builds and searches a local index of tradeable items.
 *
 * The GW2 API has no item name search endpoint, so we maintain a local
 * SQLite table of all ~27k tradeable items. On first run (or if stale
 * >7 days), fetches all tradeable IDs from /v2/commerce/prices, then
 * batch-fetches names from /v2/items (200 per request).
 *
 * Progress is tracked in schema_meta so partial builds can resume.
 */

import streamDeck from "@elgato/streamdeck";

const logger = streamDeck.logger.createScope("TpItemIndex");

const STALE_AFTER_DAYS = 7;
const BATCH_SIZE = 200;

export class TpItemIndex {
  #db = null;
  #apiClient = null;
  #building = false;
  #ready = false;

  // Prepared statements
  #stmtSearch = null;
  #stmtUpsert = null;
  #stmtCount = null;
  #stmtGetMeta = null;
  #stmtSetMeta = null;

  /**
   * @param {import("better-sqlite3").Database} db
   * @param {import("../gw2-api-client.js").GW2ApiClient} apiClient
   */
  constructor(db, apiClient) {
    this.#db = db;
    this.#apiClient = apiClient;

    this.#stmtSearch = db.prepare(
      "SELECT id, name, rarity FROM tp_items WHERE name LIKE ? LIMIT 20"
    );
    this.#stmtUpsert = db.prepare(
      "INSERT OR REPLACE INTO tp_items (id, name, rarity, icon_url, fetched_at) VALUES (?, ?, ?, ?, ?)"
    );
    this.#stmtCount = db.prepare("SELECT COUNT(*) AS cnt FROM tp_items");
    this.#stmtGetMeta = db.prepare(
      "SELECT value FROM schema_meta WHERE key = ?"
    );
    this.#stmtSetMeta = db.prepare(
      "INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)"
    );

    // Check if index already has data (stale data is still searchable)
    const { cnt } = this.#stmtCount.get();
    if (cnt > 0) {
      this.#ready = true;
    }
  }

  /** Whether the index is built and searchable. */
  get isReady() {
    return this.#ready;
  }

  /** Whether a build is currently in progress. */
  get isBuilding() {
    return this.#building;
  }

  /**
   * Search items by name (case-insensitive LIKE match).
   * @param {string} query
   * @returns {Array<{id: number, name: string, rarity: string}>}
   */
  search(query) {
    if (!query || query.length < 2) return [];
    return this.#stmtSearch.all(`%${query}%`);
  }

  /**
   * Start building/rebuilding the index in the background.
   * Safe to call multiple times — only one build runs at a time.
   */
  async build() {
    if (this.#building) return;
    logger.info("build() called, ready=" + this.#ready + ", stale=" + this.#isStale());

    // Skip if index is fresh and has no partial build pending
    const progressMeta = this.#stmtGetMeta.get("tp_index_progress");
    const hasPartialBuild = progressMeta && Number(progressMeta.value) > 0;
    if (this.#ready && !this.#isStale() && !hasPartialBuild) {
      logger.info("Index is fresh, skipping build");
      return;
    }

    this.#building = true;

    try {
      logger.info("Starting index build...");

      let processedOffset = hasPartialBuild ? Number(progressMeta.value) : 0;

      // Fetch all tradeable item IDs
      const allIds = await this.#apiClient.getAllTradeableItemIds();
      if (!allIds || allIds.length === 0) {
        logger.error("Failed to fetch tradeable item IDs");
        this.#building = false;
        return;
      }

      logger.info(`${allIds.length} tradeable items, resuming from offset ${processedOffset}`);

      // Batch-fetch item details
      const now = Math.floor(Date.now() / 1000);
      const insertMany = this.#db.transaction((items) => {
        for (const item of items) {
          this.#stmtUpsert.run(item.id, item.name, item.rarity, item.icon, now);
        }
      });

      for (let i = processedOffset; i < allIds.length; i += BATCH_SIZE) {
        const batch = allIds.slice(i, i + BATCH_SIZE);
        const items = await this.#apiClient.getItems(batch);

        if (items && items.length > 0) {
          insertMany(items);
        }

        // Save progress
        this.#stmtSetMeta.run("tp_index_progress", String(i + BATCH_SIZE));

        if ((i / BATCH_SIZE) % 20 === 0) {
          logger.info(`Progress: ${Math.min(i + BATCH_SIZE, allIds.length)}/${allIds.length}`);
        }
      }

      // Mark build complete
      this.#stmtSetMeta.run("tp_index_built_at", String(now));
      this.#stmtSetMeta.run("tp_index_progress", "0");
      this.#ready = true;

      const { cnt } = this.#stmtCount.get();
      logger.info(`Build complete — ${cnt} items indexed`);
    } catch (err) {
      logger.error("Build error:", err.message);
    } finally {
      this.#building = false;
    }
  }

  /**
   * Check if the index data is older than STALE_AFTER_DAYS.
   */
  #isStale() {
    const meta = this.#stmtGetMeta.get("tp_index_built_at");
    if (!meta) return true;

    const builtAt = Number(meta.value);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = STALE_AFTER_DAYS * 24 * 60 * 60;
    return now - builtAt > maxAge;
  }
}
