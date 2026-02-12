/**
 * GW2ApiClient — thin wrapper around the Guild Wars 2 REST API.
 *
 * Handles rate limiting and provides typed fetch methods for each endpoint
 * we care about. All methods return parsed JSON or null on failure.
 *
 * API docs: https://wiki.guildwars2.com/wiki/API:Main
 * Base URL: https://api.guildwars2.com/v2
 */

const BASE_URL = "https://api.guildwars2.com/v2";

// GW2 API is generous but let's not abuse it.
// Minimum ms between requests.
const MIN_REQUEST_INTERVAL_MS = 100;

export class GW2ApiClient {
  #lastRequestTime = 0;
  #apiKey = null;

  /**
   * @param {string|null} apiKey — optional API key for authenticated endpoints.
   *   Not needed for our current use cases (maps, specializations, etc. are public).
   */
  constructor(apiKey = null) {
    this.#apiKey = apiKey;
  }

  /**
   * Fetch a single map by ID.
   * @param {number} mapId
   * @returns {Promise<{id: number, name: string}|null>}
   */
  async getMap(mapId) {
    const data = await this.#fetch(`/maps/${mapId}`);
    if (!data) return null;
    return { id: data.id, name: data.name };
  }

  /**
   * Fetch a single profession by ID.
   * @param {number} professionId — note: GW2 API uses profession *names* as keys,
   *   so we fetch all and filter. This is cached, so it only happens once.
   * @returns {Promise<{id: number, name: string}|null>}
   */
  async getProfession(professionId) {
    // The GW2 API indexes professions by name, not by the numeric ID
    // that MumbleLink provides. We need a lookup.
    const PROFESSION_NAMES = {
      1: "Guardian",
      2: "Warrior",
      3: "Engineer",
      4: "Ranger",
      5: "Thief",
      6: "Elementalist",
      7: "Mesmer",
      8: "Necromancer",
      9: "Revenant",
    };

    const name = PROFESSION_NAMES[professionId];
    if (!name) return null;

    return { id: professionId, name };
  }

  /**
   * Fetch a single specialization by ID.
   * @param {number} specId
   * @returns {Promise<{id: number, name: string, profession_id: number, elite: boolean}|null>}
   */
  async getSpecialization(specId) {
    const data = await this.#fetch(`/specializations/${specId}`);
    if (!data) return null;

    // Resolve profession name → numeric ID
    const professionId = this.#professionNameToId(data.profession);

    return {
      id: data.id,
      name: data.name,
      profession_id: professionId,
      elite: data.elite || false,
    };
  }

  /**
   * Fetch a single currency by ID.
   * @param {number} currencyId
   * @returns {Promise<{id: number, name: string, icon_url: string|null}|null>}
   */
  async getCurrency(currencyId) {
    const data = await this.#fetch(`/currencies/${currencyId}`);
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      icon_url: data.icon || null,
    };
  }

  /**
   * Fetch all WvW objectives (these are the camps/towers/keeps/castles on WvW maps).
   * Returns the full list since individual fetching isn't practical.
   * @returns {Promise<Array<{id: string, name: string, type: string, map_id: number}>|null>}
   */
  async getAllWvWObjectives() {
    // First get the list of IDs
    const ids = await this.#fetch("/wvw/objectives");
    if (!ids || !Array.isArray(ids)) return null;

    // Fetch in batches of 200 (API limit)
    const results = [];
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const data = await this.#fetch(
        `/wvw/objectives?ids=${batch.join(",")}`
      );
      if (data && Array.isArray(data)) {
        for (const obj of data) {
          results.push({
            id: obj.id,
            name: obj.name || "Unknown",
            type: obj.type || null,
            map_id: obj.map_id || null,
          });
        }
      }
    }

    return results;
  }

  /**
   * Fetch all tradeable item IDs from the Trading Post.
   * @returns {Promise<number[]|null>}
   */
  async getAllTradeableItemIds() {
    const data = await this.#fetch("/commerce/prices");
    if (!data || !Array.isArray(data)) return null;
    return data;
  }

  /**
   * Fetch items by IDs (batch, max 200 per call).
   * @param {number[]} ids
   * @returns {Promise<Array<{id: number, name: string, rarity: string, icon: string|null}>|null>}
   */
  async getItems(ids) {
    if (!ids || ids.length === 0) return [];
    const data = await this.#fetch(`/items?ids=${ids.join(",")}`);
    if (!data || !Array.isArray(data)) return null;
    return data.map((item) => ({
      id: item.id,
      name: item.name,
      rarity: item.rarity || "Basic",
      icon: item.icon || null,
    }));
  }

  /**
   * Fetch Trading Post price for a single item.
   * @param {number} itemId
   * @returns {Promise<{id: number, buys: {unit_price: number, quantity: number}, sells: {unit_price: number, quantity: number}}|null>}
   */
  async getItemPrice(itemId) {
    const data = await this.#fetch(`/commerce/prices/${itemId}`);
    if (!data) return null;
    return {
      id: data.id,
      buys: data.buys || { unit_price: 0, quantity: 0 },
      sells: data.sells || { unit_price: 0, quantity: 0 },
    };
  }

  /**
   * Core fetch with rate limiting and error handling.
   */
  async #fetch(endpoint) {
    // Simple rate limiting
    const now = Date.now();
    const elapsed = now - this.#lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((r) =>
        setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed)
      );
    }
    this.#lastRequestTime = Date.now();

    const url = `${BASE_URL}${endpoint}`;
    const headers = { "Accept": "application/json" };

    if (this.#apiKey) {
      headers["Authorization"] = `Bearer ${this.#apiKey}`;
    }

    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.error(
          `[GW2Api] ${response.status} ${response.statusText} — ${url}`
        );
        return null;
      }

      return await response.json();
    } catch (err) {
      console.error(`[GW2Api] Fetch error for ${url}:`, err.message);
      return null;
    }
  }

  /**
   * Map profession name (from API) to numeric ID (from MumbleLink).
   */
  #professionNameToId(name) {
    const map = {
      Guardian: 1,
      Warrior: 2,
      Engineer: 3,
      Ranger: 4,
      Thief: 5,
      Elementalist: 6,
      Mesmer: 7,
      Necromancer: 8,
      Revenant: 9,
    };
    return map[name] || 0;
  }
}
