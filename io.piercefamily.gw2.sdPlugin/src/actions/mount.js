/**
 * Mount action — shows current mount or "On Foot" if not mounted.
 * Reads from context.mountIndex in MumbleLink.
 */

import { GW2Action } from "./gw2-action.js";

export class MountAction extends GW2Action {
  constructor(stateManager) {
    super(stateManager, {
      manifestId: "io.piercefamily.gw2.mount",
      fields: ["mount", "connected"],
    });
  }

  render(state) {
    const mountName = state.mount.name;
    if (mountName === "None" || state.mount.id === 0) {
      return { title: "🚶\nOn Foot" };
    }

    return { title: `🐴\n${mountName}` };
  }
}
