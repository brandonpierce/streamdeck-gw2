# GW2 × Stream Deck — MumbleLink Integration

Real-time Guild Wars 2 status on your Stream Deck via MumbleLink shared memory.

## What It Does

Reads GW2's MumbleLink shared memory every 500ms and displays live game state on Stream Deck buttons:

| Button | Shows |
|---|---|
| **Profession & Spec** | Current profession + elite specialization |
| **Game Mode** | Open World, WvW, PvP, Fractal, etc. |
| **Map Name** | Current map (resolved from GW2 API) |
| **Combat** | In combat or at peace |
| **Chat Focus** | Whether chat textbox is active |
| **Commander** | Commander tag status |
| **Mount** | Current mount or on foot |
| **WvW Team** | Red / Blue / Green team assignment |
| **Game Focus** | Whether GW2 is the active window |

## Requirements

- Windows 10+ (MumbleLink is Windows shared memory)
- Stream Deck software v6.4+
- Node.js 20+
- Guild Wars 2

## Setup

```bash
npm install
```

## Testing (Without Stream Deck)

### Test MumbleLink reader
Run alongside GW2 — prints live game state to console:
```bash
npm run test:mumble
```

### Test cache layer
Verifies SQLite + GW2 API integration (no GW2 needed):
```bash
npm run test:cache
```

## Installing as Stream Deck Plugin

1. Build/package the plugin (TBD — needs Stream Deck CLI or manual packaging)
2. Copy the `io.piercefamily.gw2.sdPlugin` folder to:
   `%APPDATA%\Elgato\StreamDeck\Plugins\`
3. Restart Stream Deck software
4. Find "Guild Wars 2" in the action list

## Architecture

```
MumbleLink (shared memory) ──poll 500ms──→ MumbleLinkReader
                                               │
GW2 REST API ──lazy fetch on miss──→ SQLite Cache (typed tables)
                                               │
                                         StateManager
                                               │
                                    Stream Deck Actions (9 buttons)
```

## Known Caveats

- **MumbleLink doesn't clear on GW2 exit.** We detect stale data by watching
  `uiTick` — if it stops incrementing for 1.5s, all buttons show "GW2 Offline."
- **WvW team color IDs** may need verification in-game. The seeded values
  (Red=9, Blue=55, Green=376) are from community research and may be wrong.
- **Mount index list** goes through Siege Turtle (index 10). If new mounts
  were added in Visions of Eternity, they'll show as "Mount N" until the
  seed data is updated.
- **uiState combat flag** (bit 7) may have quirks in certain game modes.
  Test thoroughly.

## Project Structure

```
├── manifest.json              # Stream Deck plugin manifest
├── package.json
├── bin/
│   └── plugin.js              # Entry point
├── src/
│   ├── mumble-reader.js       # MumbleLink shared memory reader (koffi FFI)
│   ├── state-manager.js       # Orchestrator: poll → resolve → diff → notify
│   ├── gw2-api-client.js      # GW2 REST API wrapper
│   ├── test-mumble.js         # Standalone MumbleLink test
│   ├── test-cache.js          # Standalone cache test
│   ├── cache/
│   │   ├── db.js              # SQLite init + schema + seeding
│   │   ├── maps.js            # Maps table accessor
│   │   ├── professions.js     # Professions table accessor
│   │   ├── specializations.js # Specializations table accessor
│   │   ├── mounts.js          # Mounts table accessor
│   │   ├── map-types.js       # Map types table accessor
│   │   └── wvw-team-colors.js # WvW team colors table accessor
│   ├── seed/
│   │   ├── map-types.js       # Static mapType enum data
│   │   ├── mounts.js          # Static mount index data
│   │   └── wvw-team-colors.js # Static team color data
│   └── actions/
│       ├── base-action.js     # Action factory helper
│       ├── profession.js
│       ├── game-mode.js
│       ├── map-name.js
│       ├── combat.js
│       ├── chat-focus.js
│       ├── commander.js
│       ├── mount.js
│       ├── wvw-team.js
│       └── game-focus.js
└── imgs/                      # Placeholder for button icons
```
