/**
 * Game Focus action — shows whether GW2 is the active window.
 * Uses uiState bit 4 from MumbleLink context.
 */

import { GW2Action } from "./gw2-action.js";

export class GameFocusAction extends GW2Action {
  constructor(stateManager) {
    super(stateManager, {
      manifestId: "io.piercefamily.gw2.gamefocus",
      fields: ["gameHasFocus", "connected"],
    });
  }

  render(state) {
    return {
      title: state.gameHasFocus ? "🎮\nActive" : "💤\nBackground",
    };
  }
}
