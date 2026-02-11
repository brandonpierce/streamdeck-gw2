/**
 * MountsCache — typed accessor for the mounts table.
 *
 * Mounts are seeded from static enum data on init. The mount index
 * comes from context.mountIndex in MumbleLink (0 = not mounted).
 */

export class MountsCache {
  #stmtGet = null;

  /**
   * @param {import('better-sqlite3').Database} db
   */
  constructor(db) {
    this.#stmtGet = db.prepare(
      "SELECT id, name FROM mounts WHERE id = ?"
    );
  }

  /**
   * Get a mount name by index.
   * @param {number} mountIndex
   * @returns {{ name: string, fromCache: boolean }}
   */
  get(mountIndex) {
    const row = this.#stmtGet.get(mountIndex);

    if (row) {
      return { name: row.name, fromCache: true };
    }

    // Unknown mount index — probably a new mount added after our seed data
    return { name: `Mount ${mountIndex}`, fromCache: false };
  }
}
