/**
 * MapTypesCache — typed accessor for the map_types table.
 *
 * Static enum from MumbleLink context.mapType. Seeded on init,
 * only changes if ANet adds a new map type to MumbleLink (very rare).
 */

export class MapTypesCache {
  #stmtGet = null;

  /**
   * @param {import('better-sqlite3').Database} db
   */
  constructor(db) {
    this.#stmtGet = db.prepare(
      "SELECT id, name FROM map_types WHERE id = ?"
    );
  }

  /**
   * Get a human-readable game mode name from the mapType enum.
   * @param {number} mapType
   * @returns {{ name: string, fromCache: boolean }}
   */
  get(mapType) {
    const row = this.#stmtGet.get(mapType);

    if (row) {
      return { name: row.name, fromCache: true };
    }

    return { name: `Mode ${mapType}`, fromCache: false };
  }
}
