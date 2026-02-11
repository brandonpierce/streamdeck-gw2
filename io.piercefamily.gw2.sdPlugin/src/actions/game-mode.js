/**
 * Game Mode action — shows current game mode from mapType enum.
 * Example display: "Open World" or "WvW:\nEternal\nBattlegrounds"
 */

import { GW2Action, wrapTitle } from "./gw2-action.js";

export class GameModeAction extends GW2Action {
  constructor(stateManager) {
    super(stateManager, {
      manifestId: "io.piercefamily.gw2.gamemode",
      fields: ["gameMode", "connected"],
    });
  }

  render(state) {
    return { title: wrapTitle(state.gameMode.name) };
  }
}
