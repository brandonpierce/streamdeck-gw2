# CLAUDE.md — Elgato Stream Deck Plugin SDK v2 Reference

This file is a **general-purpose SDK reference** for building Stream Deck plugins with Node.js. It is not a description of the current codebase — treat the SDK docs and this reference as the source of truth, not existing code in this repo.

## Authoritative Sources

| Resource | URL |
|---|---|
| SDK Docs (start here) | https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/ |
| Manifest Reference | https://docs.elgato.com/streamdeck/sdk/references/manifest/ |
| Actions Guide | https://docs.elgato.com/streamdeck/sdk/guides/actions/ |
| Settings Guide | https://docs.elgato.com/streamdeck/sdk/guides/settings/ |
| Property Inspector (UI) | https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/ |
| Dials & Touch Strip | https://docs.elgato.com/streamdeck/sdk/guides/dials/ |
| Manifest JSON Schema | https://schemas.elgato.com/streamdeck/plugins/manifest.json |
| npm package | https://www.npmjs.com/package/@elgato/streamdeck |
| CLI npm package | https://www.npmjs.com/package/@elgato/cli |
| Sample plugins | https://github.com/elgatosf/streamdeck-plugin-samples |

When in doubt, **fetch and read the official docs** before implementing. SDK details change between versions.

## SDK Version & Requirements

The current SDK is `@elgato/streamdeck` v2.x with `SDKVersion: 2` in the manifest.

- **Node.js** >= 20 (must match `Nodejs.Version` in manifest)
- **Stream Deck software** >= 6.9 (SDK v2 minimum; set `Software.MinimumVersion` to `"6.9"` or higher)
- **CLI**: `@elgato/cli` v1.6+ (`npm install -g @elgato/cli@latest`)
- **OS**: `"windows"` and/or `"mac"` in manifest `OS` array

## Plugin Architecture

A Stream Deck plugin has two layers:

1. **Backend (Node.js)** — The Stream Deck app launches your plugin as a Node.js child process and communicates over WebSocket. This is where your action logic lives.
2. **Frontend (Property Inspector)** — An HTML page rendered inside the Stream Deck app when a user configures an action instance. Optional per-action.

## Canonical Plugin Structure

The `.sdPlugin` folder IS the deployable unit. Everything the plugin needs at runtime must be inside it.

```
com.example.myplugin.sdPlugin/
├── manifest.json          # Plugin metadata, actions, compatibility
├── bin/
│   └── plugin.js          # Entry point (manifest CodePath)
├── src/                   # Source modules (imported by plugin.js)
│   └── actions/           # Action class files
├── ui/                    # Property Inspector HTML files
├── imgs/                  # Icons and images (no file extensions in manifest paths)
├── logs/                  # SDK log output (auto-created)
└── en.json                # Localization strings (optional)
```

**Critical:** The folder extension MUST be exactly `.sdPlugin` (capital P). `.sdplugin` will fail packaging with "Error: Invalid Input".

## Manifest (manifest.json)

The manifest defines your plugin's identity, actions, and compatibility. Always validate against the schema.

### Required Fields

```json
{
  "$schema": "https://schemas.elgato.com/streamdeck/plugins/manifest.json",
  "UUID": "com.example.myplugin",
  "Name": "My Plugin",
  "Version": "1.0.0.0",
  "Author": "Your Name",
  "Description": "What it does",
  "Icon": "imgs/plugin-icon",
  "CodePath": "bin/plugin.js",
  "SDKVersion": 2,
  "Software": { "MinimumVersion": "6.9" },
  "OS": [{ "Platform": "windows", "MinimumVersion": "10" }],
  "Nodejs": { "Version": "20", "Debug": "disabled" },
  "Actions": []
}
```

### Key Manifest Rules

- `Version` MUST be four segments: `"1.0.0.0"` (not three-segment semver)
- `UUID` must be a reverse-domain identifier: `com.example.pluginname`
- `CodePath` is relative to the `.sdPlugin` folder root, must point to a single JS file
- `Icon` and all image paths OMIT the file extension — the SDK resolves `.png`, `.svg`, etc. automatically
- `SDKVersion` must be `2`
- `Nodejs.Debug`: set to `"enabled"` during development to allow attaching a Node.js debugger

### Action Definitions

Each action in the `Actions` array requires:

```json
{
  "Name": "My Action",
  "UUID": "com.example.myplugin.myaction",
  "Icon": "imgs/actions/myaction",
  "Tooltip": "Description shown on hover",
  "Controllers": ["Keypad"],
  "States": [
    {
      "Image": "imgs/actions/myaction-key",
      "TitleAlignment": "middle",
      "FontSize": "9"
    }
  ]
}
```

- Action UUIDs MUST be prefixed by the plugin UUID: `<plugin-uuid>.<actionname>`
- `Controllers`: `"Keypad"` for buttons/pedals/G-keys, `"Encoder"` for dials/touchscreen (Stream Deck +)
- `PropertyInspectorPath`: optional, path to HTML file in `ui/` for per-action configuration UI
- `States`: array of state objects; each can specify `Image`, `TitleAlignment`, `FontSize`

## Actions

Actions are classes that extend `SingletonAction` from the SDK. They receive events from Stream Deck hardware and software interactions.

### Correct Action Pattern

```javascript
import streamDeck, { SingletonAction } from "@elgato/streamdeck";

export class MyAction extends SingletonAction {
  onWillAppear(ev) {
    // Action became visible — initialize or render
    ev.action.setTitle("Hello");
  }

  onKeyDown(ev) {
    // User pressed the key — perform your logic
    ev.action.setTitle("Pressed!");
  }
}
```

### Registration — Order Matters

All actions MUST be registered BEFORE calling `streamDeck.connect()`. This is a hard requirement.

```javascript
import streamDeck from "@elgato/streamdeck";
import { MyAction } from "./actions/my-action.js";

// Register ALL actions first
streamDeck.actions.registerAction(new MyAction());

// THEN connect — always last
streamDeck.connect();
```

If you register after `connect()`, actions silently won't receive events.

### Available Action Events

| Event | Trigger |
|---|---|
| `onWillAppear(ev)` | Action becomes visible on a Stream Deck |
| `onWillDisappear(ev)` | Action removed from view |
| `onKeyDown(ev)` | User presses a key |
| `onKeyUp(ev)` | User releases a key |
| `onDidReceiveSettings(ev)` | Settings changed (from PI or programmatically) |
| `onPropertyInspectorDidAppear(ev)` | User opened the action's config panel |
| `onPropertyInspectorDidDisappear(ev)` | User closed the action's config panel |
| `onSendToPlugin(ev)` | Message received from Property Inspector |

For Stream Deck + (dials/touchscreen): `onDialDown`, `onDialUp`, `onDialRotate`, `onTouchTap`

### Action Instance API

The `ev.action` object provides methods to update the button:

```javascript
ev.action.setTitle("text");           // Set button title
ev.action.setImage("data:image/...");  // Set button image (base64 or SVG string)
ev.action.setSettings({ key: "val" }); // Persist action-level settings
ev.action.setState(0);                 // Switch to a different state index
ev.action.showOk();                    // Flash checkmark
ev.action.showAlert();                 // Flash warning triangle
```

For dials: `ev.action.setFeedback({...})`, `ev.action.setFeedbackLayout("$B1")`

## Logging

Always use the SDK logger. `console.log` output does not appear in plugin log files.

```javascript
import streamDeck from "@elgato/streamdeck";

const logger = streamDeck.logger.createScope("MyScope");
logger.info("Informational message");
logger.warn("Warning");
logger.error("Error:", err);
logger.debug("Debug detail");
```

Logs are written to `<plugin>.sdPlugin/logs/`.

## Settings

### Action Settings (per-instance)

Settings are JSON objects attached to each action instance. They arrive in event payloads:

```javascript
onWillAppear(ev) {
  const settings = ev.payload.settings; // { itemId: 123, ... }
}

onDidReceiveSettings(ev) {
  const updated = ev.payload.settings;
}
```

Update them with `ev.action.setSettings({ ... })`. When updated from either the plugin or the PI, the other side is automatically notified.

**Security warning:** Action settings are stored as plain-text JSON and are included in profile exports. NEVER store API keys, tokens, or secrets in action settings.

### Global Settings (plugin-level)

Global settings are accessible only to your plugin and stored securely on the local machine.

```javascript
const globals = await streamDeck.settings.getGlobalSettings();
await streamDeck.settings.setGlobalSettings({ apiKey: "..." });
```

Always use global settings for sensitive data like access tokens.

## Property Inspector (UI)

Property inspectors are HTML files that let users configure action instances. They use `sdpi-components.js` for built-in UI components with automatic settings binding.

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="sdpi-components.js"></script>
</head>
<body>
  <sdpi-item label="Item Name">
    <sdpi-textfield setting="itemName"></sdpi-textfield>
  </sdpi-item>
  <sdpi-item label="Enabled">
    <sdpi-checkbox setting="enabled"></sdpi-checkbox>
  </sdpi-item>
</body>
</html>
```

- The `setting` attribute on `<sdpi-*>` components auto-binds to the action's persisted settings JSON
- Reference `sdpi-components.js` as a local file (not CDN) — it must ship with your plugin
- Custom messaging: PI → Plugin via `SDPIComponents.streamDeckClient.sendToPlugin(payload)`, Plugin → PI via `action.sendToPropertyInspector(payload)`

## System Events

```javascript
streamDeck.system.onSystemDidWakeUp(() => {
  // Reinitialize resources after system sleep (handles, connections, etc.)
});

streamDeck.system.onApplicationDidLaunch(ev => {
  // A monitored application launched (configure in manifest ApplicationsToMonitor)
});

streamDeck.system.onApplicationDidTerminate(ev => {
  // A monitored application closed
});
```

## Image & Icon Requirements

| Asset | Size | @2x Size | Format | Notes |
|---|---|---|---|---|
| Plugin icon (marketplace) | 256×256 | 512×512 | PNG | Full color allowed |
| Category icon | 28×28 | 56×56 | PNG or SVG (preferred) | Monochrome, transparent bg |
| Action icon (action list) | 20×20 | 40×40 | PNG or SVG (preferred) | Monochrome, transparent bg |
| Key icon (state image) | 72×72 | 144×144 | PNG, SVG, or GIF | GIF only for static manifest; no GIF via setImage() |

- SVG is strongly preferred for category, action, and key icons (scales across all devices)
- High DPI: provide both `icon.png` (1x) and `icon@2x.png` (2x) when using rasterized images
- Manifest image paths omit the file extension — the SDK resolves the correct file
- Programmatic `setImage()` calls should be limited to max 10 per second per key

## Layouts (Stream Deck + Touchscreen)

For dials/encoders, layouts define what appears on the touch display (200×100 px canvas).

Built-in layouts: `$A0`, `$A1`, `$B1`, `$B2`, `$C1`, `$X1`

Custom layouts are JSON files referenced in `Actions[].Encoder.layout`. Update values at runtime with `ev.action.setFeedback({ key: value })`.

## CLI Commands

| Command | Purpose |
|---|---|
| `streamdeck create` | Scaffold a new plugin project |
| `streamdeck link <folder>` | Symlink `.sdPlugin` folder into Stream Deck's plugins directory |
| `streamdeck restart <uuid>` | Restart a running plugin |
| `streamdeck validate <folder>` | Validate manifest and plugin structure |
| `streamdeck pack <folder>` | Package as `.streamDeckPlugin` for distribution |

## Development Workflow

1. `npm install` — install dependencies
2. `streamdeck link <your>.sdPlugin` — symlink into Stream Deck
3. Edit source files inside the `.sdPlugin/` folder
4. `streamdeck restart <uuid>` — reload after changes
5. Check logs in `<your>.sdPlugin/logs/`
6. For debugging: set `Nodejs.Debug` to `"enabled"` in manifest, attach a Node.js debugger (VS Code or Chrome DevTools)

## ES Modules

Modern Stream Deck plugins use ES modules. Your `package.json` should include `"type": "module"`. Use `import`/`export` syntax, not `require()`.

```javascript
// Correct
import streamDeck, { SingletonAction } from "@elgato/streamdeck";

// Wrong — will fail with "type": "module"
const streamDeck = require("@elgato/streamdeck");
```

## Common Pitfalls

1. **Registering actions after `streamDeck.connect()`** — actions silently receive no events. Always register first, connect last.
2. **Using `console.log`** — output won't appear in plugin logs. Use `streamDeck.logger.createScope()`.
3. **Storing secrets in action settings** — they're plain-text and exported with profiles. Use global settings.
4. **Including file extensions in manifest image paths** — the SDK resolves extensions automatically. Write `"imgs/icon"`, not `"imgs/icon.png"`.
5. **Missing @2x images** — Stream Deck looks for `@2x` variants on high-DPI displays. Provide both sizes or use SVG.
6. **`.sdPlugin` capitalization** — must be exactly `.sdPlugin`. Lowercase `p` causes packaging to fail.
7. **Three-segment version** — `"1.0.0"` is invalid. Stream Deck requires exactly four segments: `"1.0.0.0"`.
8. **Forgetting `"type": "module"`** — without it, `import` statements fail. Set it in package.json.
9. **Setting `Software.MinimumVersion` too low** — SDK v2 requires Stream Deck >= 6.9. Don't set it lower.
10. **Not handling `onSystemDidWakeUp`** — shared resources (file handles, connections, shared memory) can go stale after system sleep. Re-initialize in this handler.
