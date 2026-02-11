/**
 * Profession & Spec action — shows current profession and elite specialization.
 * Example display: "Necromancer\nRitualist" or "Guardian\nCore"
 */

import { GW2Action } from "./gw2-action.js";

export class ProfessionAction extends GW2Action {
  constructor(stateManager) {
    super(stateManager, {
      manifestId: "io.piercefamily.gw2.profession",
      fields: ["profession", "specialization", "connected"],
    });
  }

  render(state) {
    const prof = state.profession.name;
    const spec = state.specialization.name;

    return { title: `${prof}\n${spec}` };
  }
}
