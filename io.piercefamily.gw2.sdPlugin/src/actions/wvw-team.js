/**
 * WvW Team action — shows WvW team color assignment.
 * Reads from identity.team_color_id in MumbleLink.
 * Shows "None" when not in WvW.
 */

import { GW2Action } from "./gw2-action.js";

const TEAM_EMOJI = {
  Red: "🔴",
  Blue: "🔵",
  Green: "🟢",
};

export class WvWTeamAction extends GW2Action {
  constructor(stateManager) {
    super(stateManager, {
      manifestId: "io.piercefamily.gw2.wvwteam",
      fields: ["wvwTeam", "connected"],
    });
  }

  render(state) {
    const teamName = state.wvwTeam.name;
    if (teamName === "None") {
      return { title: "—\nNo Team" };
    }

    const emoji = TEAM_EMOJI[teamName] || "🏰";
    return { title: `${emoji}\n${teamName}` };
  }
}
