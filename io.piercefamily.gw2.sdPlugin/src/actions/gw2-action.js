/**
 * GW2Action — base class for Stream Deck actions backed by StateManager.
 *
 * Each subclass watches one or more state fields and re-renders its buttons
 * when those fields change. Subclasses implement render(state) returning
 * { title: string } (and eventually { image: string } for icons).
 *
 * Uses SDK v2 SingletonAction pattern — one instance per action ID,
 * registered via streamDeck.actions.registerAction().
 */

import { SingletonAction } from "@elgato/streamdeck";

const OFFLINE_TITLE = "Launch\nGW2";

export function wrapTitle(text, maxChars = 12) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

export class GW2Action extends SingletonAction {
  #stateManager;

  constructor(stateManager, { manifestId, fields }) {
    super();
    this.manifestId = manifestId;
    this.#stateManager = stateManager;

    // Subscribe to each field — re-render all visible instances on change.
    // This runs once at startup since SingletonAction is a singleton.
    for (const field of fields) {
      stateManager.on(field, (_value, fullState) => {
        this.#renderAll(fullState);
      });
    }
  }

  /**
   * Called when a button appears on the Stream Deck.
   * Renders immediately with current state.
   */
  onWillAppear(ev) {
    const state = this.#stateManager.getCurrentState();
    if (!state || !state.connected) {
      this.#updateButton(ev.action, { title: OFFLINE_TITLE });
      return;
    }
    this.#updateButton(ev.action, this.render(state));
  }

  /**
   * Subclasses must implement this. Receives full state, returns { title }.
   */
  render(_state) {
    throw new Error("GW2Action subclass must implement render()");
  }

  #renderAll(state) {
    for (const action of this.actions) {
      if (!state.connected) {
        this.#updateButton(action, { title: OFFLINE_TITLE });
      } else {
        this.#updateButton(action, this.render(state));
      }
    }
  }

  #updateButton(action, result) {
    if (result.title !== undefined) {
      action.setTitle(result.title);
    }
    // Future: result.image for custom icons
  }
}
