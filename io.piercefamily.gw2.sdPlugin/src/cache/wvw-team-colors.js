/**
 * WvWTeamColorsCache — typed accessor for the wvw_team_colors table.
 *
 * Static enum from MumbleLink identity.team_color_id.
 * 0 = not in WvW / no team.
 */

export class WvWTeamColorsCache {
  #stmtGet = null;

  /**
   * @param {import('better-sqlite3').Database} db
   */
  constructor(db) {
    this.#stmtGet = db.prepare(
      "SELECT id, name FROM wvw_team_colors WHERE id = ?"
    );
  }

  /**
   * Get a WvW team name from the team_color_id.
   * @param {number} teamColorId
   * @returns {{ name: string, fromCache: boolean }}
   */
  get(teamColorId) {
    if (teamColorId === 0) {
      return { name: "None", fromCache: true };
    }

    const row = this.#stmtGet.get(teamColorId);

    if (row) {
      return { name: row.name, fromCache: true };
    }

    // Unknown team color — might be a color ID we haven't mapped
    return { name: `Team ${teamColorId}`, fromCache: false };
  }
}
