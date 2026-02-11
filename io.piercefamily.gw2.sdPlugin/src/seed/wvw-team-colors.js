/**
 * WvW team color IDs from MumbleLink identity.team_color_id.
 *
 * These map to color IDs from /v2/colors, NOT simple 0/1/2/3 values.
 * 0 = neutral (not in WvW or no team).
 *
 * NOTE: The exact color IDs for red/blue/green may need verification
 * in-game. These are the commonly reported values from community research.
 * If a team_color_id isn't in this table, the plugin will display the raw ID.
 */

export const WVW_TEAM_COLORS_SEED = {
  0: "None",
  9: "Red",
  55: "Blue",
  376: "Green",
};
