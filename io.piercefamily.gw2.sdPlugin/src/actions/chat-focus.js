/**
 * Chat Focus action — shows whether the chat textbox has focus.
 * Uses uiState bit 6 from MumbleLink context.
 *
 * Useful as a safety indicator — if textbox has focus, keybind-sending
 * features should be suppressed to avoid typing gibberish in chat.
 */

import { GW2Action } from "./gw2-action.js";

export class ChatFocusAction extends GW2Action {
  constructor(stateManager) {
    super(stateManager, {
      manifestId: "io.piercefamily.gw2.chatfocus",
      fields: ["textboxFocused", "connected"],
    });
  }

  render(state) {
    return {
      title: state.textboxFocused ? "💬\nTyping" : "—\nIdle",
    };
  }
}
