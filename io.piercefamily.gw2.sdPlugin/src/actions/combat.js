/**
 * Combat Status action — shows whether character is in combat.
 * Uses uiState bit 7 from MumbleLink context.
 */

import { GW2Action } from "./gw2-action.js";

export class CombatAction extends GW2Action {
  constructor(stateManager) {
    super(stateManager, {
      manifestId: "io.piercefamily.gw2.combat",
      fields: ["inCombat", "connected"],
    });
  }

  render(state) {
    return {
      title: state.inCombat ? "⚔️\nCOMBAT" : "✓\nPeace",
    };
  }
}
