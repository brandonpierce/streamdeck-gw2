/**
 * Commander action — shows whether commander tag is active.
 * Reads from identity.commander boolean in MumbleLink.
 */

import { GW2Action } from "./gw2-action.js";

export class CommanderAction extends GW2Action {
  constructor(stateManager) {
    super(stateManager, {
      manifestId: "io.piercefamily.gw2.commander",
      fields: ["commander", "connected"],
    });
  }

  render(state) {
    return {
      title: state.commander ? "🔶\nTagged" : "—\nNo Tag",
    };
  }
}
