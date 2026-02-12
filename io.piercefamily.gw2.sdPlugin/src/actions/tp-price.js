/**
 * TpPriceAction — Trading Post price display button.
 *
 * Unlike other actions, this does NOT extend GW2Action or use StateManager
 * for data. It has its own data source (TP API) and polling loop.
 * Extends SingletonAction directly but reuses wrapTitle() for display.
 *
 * Per-button configuration via Property Inspector: each button tracks
 * a different item selected by the user.
 */

import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import { wrapTitle } from "./gw2-action.js";

const logger = streamDeck.logger.createScope("TpPrice");

const POLL_INTERVAL_MS = 60_000;

/**
 * Format a copper price into the GW2 gold/silver/copper string.
 * 10000 copper = 1 gold, 100 copper = 1 silver.
 * @param {number} copper
 * @returns {string}
 */
function formatPrice(copper) {
  if (copper <= 0) return "0c";

  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const cop = copper % 100;

  if (gold > 0) return `${gold}g ${silver}s`;
  if (silver > 0) return `${silver}s ${cop}c`;
  return `${cop}c`;
}

export class TpPriceAction extends SingletonAction {
  #itemIndex = null;
  #pricesCache = null;
  #pollTimer = null;

  /**
   * @param {import("../cache/tp-item-index.js").TpItemIndex} itemIndex
   * @param {import("../cache/tp-prices.js").TpPricesCache} pricesCache
   */
  constructor(itemIndex, pricesCache) {
    super();
    this.manifestId = "io.piercefamily.gw2.tpprice";
    this.#itemIndex = itemIndex;
    this.#pricesCache = pricesCache;
  }

  /**
   * Called when a button appears on the Stream Deck.
   */
  async onWillAppear(ev) {
    const settings = ev.payload.settings || {};
    this.#renderButton(ev.action, settings);

    // Start polling if not already running
    this.#ensurePolling();

    // If we have an item configured, do an immediate price fetch
    if (settings.itemId) {
      await this.#pricesCache.refresh(settings.itemId);
      this.#renderButton(ev.action, settings);
    }
  }

  /**
   * Called when a button disappears from the Stream Deck.
   */
  onWillDisappear(_ev) {
    // Stop polling if no buttons are visible
    if (this.actions.size === 0) {
      this.#stopPolling();
    }
  }

  /**
   * Called when settings change (user selected an item in the PI).
   */
  async onDidReceiveSettings(ev) {
    const settings = ev.payload.settings || {};
    this.#renderButton(ev.action, settings);

    if (settings.itemId) {
      await this.#pricesCache.refresh(settings.itemId);
      this.#renderButton(ev.action, settings);
    }
  }

  /**
   * Handle messages from the Property Inspector.
   */
  onSendToPlugin(ev) {
    const payload = ev.payload || {};

    if (payload.event === "searchItems") {
      const query = payload.query || "";
      try {
        const results = this.#itemIndex.search(query);
        ev.action.sendToPropertyInspector({
          event: "searchResults",
          results,
          indexReady: this.#itemIndex.isReady,
          indexBuilding: this.#itemIndex.isBuilding,
        });
      } catch (err) {
        logger.error("Search error:", err.message);
        ev.action.sendToPropertyInspector({
          event: "searchResults",
          results: [],
          indexReady: this.#itemIndex.isReady,
          indexBuilding: this.#itemIndex.isBuilding,
        });
      }
    }

    if (payload.event === "getIndexStatus") {
      ev.action.sendToPropertyInspector({
        event: "indexStatus",
        indexReady: this.#itemIndex.isReady,
        indexBuilding: this.#itemIndex.isBuilding,
      });
    }
  }

  /**
   * Render a button with the current price or placeholder.
   */
  #renderButton(action, settings) {
    if (!settings.itemId) {
      action.setTitle("TP Price\n---");
      return;
    }

    const itemName = settings.itemName || `Item ${settings.itemId}`;
    const cached = this.#pricesCache.get(settings.itemId);

    if (!cached) {
      action.setTitle(`${wrapTitle(itemName)}\n...`);
      return;
    }

    // Show sell price (what you'd buy it for)
    const price = formatPrice(cached.sellPrice);
    action.setTitle(`${wrapTitle(itemName)}\n${price}`);
  }

  /**
   * Start the polling interval if it's not already running.
   */
  #ensurePolling() {
    if (this.#pollTimer) return;

    this.#pollTimer = setInterval(() => this.#pollAll(), POLL_INTERVAL_MS);
    logger.info("Polling started (60s interval)");
  }

  /**
   * Stop the polling interval.
   */
  #stopPolling() {
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = null;
      logger.info("Polling stopped");
    }
  }

  /**
   * Refresh prices for all visible buttons.
   */
  async #pollAll() {
    for (const action of this.actions) {
      try {
        const settings = (await action.getSettings()) || {};
        if (!settings.itemId) continue;

        await this.#pricesCache.refresh(settings.itemId);
        this.#renderButton(action, settings);
      } catch (err) {
        logger.error("Poll error:", err.message);
      }
    }
  }
}
