/**
 * TpPricesCache — Trading Post price cache.
 *
 * Sync get() reads from the tp_prices table.
 * Async refresh() fetches from /v2/commerce/prices/{id} and upserts.
 */

export class TpPricesCache {
  #db = null;
  #apiClient = null;

  #stmtGet = null;
  #stmtUpsert = null;

  /**
   * @param {import("better-sqlite3").Database} db
   * @param {import("../gw2-api-client.js").GW2ApiClient} apiClient
   */
  constructor(db, apiClient) {
    this.#db = db;
    this.#apiClient = apiClient;

    this.#stmtGet = db.prepare(
      "SELECT buy_price, sell_price, buy_quantity, sell_quantity, fetched_at FROM tp_prices WHERE item_id = ?"
    );
    this.#stmtUpsert = db.prepare(
      "INSERT OR REPLACE INTO tp_prices (item_id, buy_price, sell_price, buy_quantity, sell_quantity, fetched_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
  }

  /**
   * Get cached price for an item. Returns null if not cached.
   * @param {number} itemId
   * @returns {{buyPrice: number, sellPrice: number, buyQuantity: number, sellQuantity: number, fetchedAt: number}|null}
   */
  get(itemId) {
    const row = this.#stmtGet.get(itemId);
    if (!row) return null;
    return {
      buyPrice: row.buy_price,
      sellPrice: row.sell_price,
      buyQuantity: row.buy_quantity,
      sellQuantity: row.sell_quantity,
      fetchedAt: row.fetched_at,
    };
  }

  /**
   * Fetch fresh price from the API and store it.
   * @param {number} itemId
   * @returns {Promise<{buyPrice: number, sellPrice: number}|null>}
   */
  async refresh(itemId) {
    const data = await this.#apiClient.getItemPrice(itemId);
    if (!data) return null;

    const now = Math.floor(Date.now() / 1000);
    this.#stmtUpsert.run(
      itemId,
      data.buys.unit_price,
      data.sells.unit_price,
      data.buys.quantity,
      data.sells.quantity,
      now
    );

    return {
      buyPrice: data.buys.unit_price,
      sellPrice: data.sells.unit_price,
    };
  }
}
