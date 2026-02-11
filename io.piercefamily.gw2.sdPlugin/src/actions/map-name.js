/**
 * Map Name action — shows current map name, resolved via GW2 API.
 * Example display: "Lion's Arch" or "Shipwreck Strand"
 */

import { GW2Action, wrapTitle } from "./gw2-action.js";

export class MapNameAction extends GW2Action {
  constructor(stateManager) {
    super(stateManager, {
      manifestId: "io.piercefamily.gw2.mapname",
      fields: ["mapName", "connected"],
    });
  }

  render(state) {
    return { title: wrapTitle(state.mapName.name) };
  }
}
