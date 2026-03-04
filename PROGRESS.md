# BetOnMe — Project Progress

---

## Architecture Overview

A local React app (Vite, port 5173) for daily sports betting tracking.
Data is persisted to `savedata.json` via a small Express server (port 3001).
`pnpm dev` starts both servers together via `concurrently`.
`savedata.json` is inside a Syncthing-synced folder — auto-syncs across devices.

### Stack
- **Frontend:** React 19, Vite, Recharts
- **Data server:** Express (server.js, port 3001)
- **Persistence:** savedata.json (local JSON file)
- **Cache:** localStorage (odds, props, stats — temporary, intentionally not migrated)
- **Package manager:** pnpm
- **Dev runner:** concurrently

### Data Flow
```
pnpm dev
├── [server] node server.js → reads/writes savedata.json
└── [vite]   vite → serves React app on localhost:5173
```

### savedata.json Structure
```json
{
  "app": { "coins": 0, "lastCoinDate": "YYYY-MM-DD", "picks": { "YYYY-MM-DD": {} } },
  "predictions": { "YYYY-MM-DD": { "legs": [], "lockedAt": 0 } },
  "lay": { "YYYY-MM-DD": { "legs": [], "lockedAt": 0 } },
  "dog": { "picks": { "YYYY-MM-DD": {} }, "dogStreak": {} },
  "propPick": { "YYYY-MM-DD": { "[team]": {} } },
  "ouPick": { "YYYY-MM-DD": { "name": "", "point": 0, "odds": 0 } }
}
```

---

## Tabs
| Tab | Status |
|-----|--------|
| 🎮 Games | ✅ Working |
| 🔒 Lock | ✅ Working |
| 🐕 Dogs | ✅ Working (server) |
| 🎰 Parlays | ✅ Working |
| 🎲 Props | ✅ Working (cache in localStorage) |
| 📺 Media | 🚧 Under construction |
| ⚡ Live | ✅ Working |

---

## Completed

### 2026-03-04 (Session 2)
- Fixed away vs home ordering throughout entire app — games now display as `away vs home` (correct convention)
- Fixed predictions slip sorting — locked slips now always enforce lock → dog → rest order even after locking
- Added `_leg` reference to fallback game objects so locked predictions retain full leg data
- Lock confirm modal subtitle updated to "odds locked at pick time"
- Dev panel "Close & Reload" split into separate "Exit" and "Exit & Reload" buttons
- Dev panel confirmation wording tightened ("Cannot be undone.")
- Added TodoBox items across Props, Parlays tabs for future work tracking
- Created `BetOnMe-Roadmap.md` — server evolution + PWA/APK path document
- Git repo confirmed pushed to `tomisouka/I-DONT-MISSSS` on GitHub
- `savedata.json` and `savedata.backup.json` confirmed in `.gitignore`
- Restore point committed: `b4f1f47` — "restore point before splitting 3k App.js"

### 2026-03-04 (Session 1)
- Migrated persistent data from localStorage to `savedata.json` via Express server
  - Built `server.js` with GET/POST `/data` endpoints, export, restore-backup
  - Made all storage calls properly async (`loadState`, `saveState`, `loadPredictions`, `savePredictions`, `loadLayHistory`, `saveLayHistory`)
  - Migrated dog picks → `loadDogState` / `saveDogStateServer`
  - Migrated prop picks → `loadPropPick` / `savePropPick`
  - Migrated double lock O/U → `loadOuPick` / `saveOuPick`
  - Added one-time `migrateLocalStorageToServer()` migration utility on startup
  - Fixed `useState(loadState)` → `useState({})` + async `useEffect` pattern
  - Fixed CORS origin (5174 → 5173/5174)
- Backup on write implemented — server rotates `savedata.json` → `savedata.backup.json` before every save
- Export endpoint added — `GET /export` downloads timestamped snapshot
- Restore backup endpoint added — `POST /restore-backup`
- Export + restore wired into Dev Panel UI
- Graceful shutdown handled — `SIGTERM` / `SIGINT` in server.js
- Set up `concurrently` so `pnpm dev` starts both servers with labeled output
- Installed `concurrently ^9.1.2` as devDependency

---

## TODO

### High Priority
- [ ] **Split App.jsx** — 3,051 lines is too large; split into per-tab component files
  - Suggested structure: `components/LockOfTheDay.jsx`, `DogOfTheDay.jsx`, `ParlaysTab.jsx`, `PropsTab.jsx`, `LivePicksTab.jsx`, `OddsDashboard.jsx`, `MediaTab.jsx`, `StatsBar.jsx`, `helpers.js`, `storage.js`
- [ ] **PWA setup** — install `vite-plugin-pwa`, add `manifest.json`, generate icons → installs on phone home screen
  - `pnpm add -D vite-plugin-pwa`
  - Update `vite.config.js` with PWA plugin config
  - Add `public/manifest.json` (name, icons, theme color `#0f0f0f`, background `#0f0f0f`)
  - Generate 192×192 and 512×512 icons

### Medium Priority
- [ ] **Dog ordering in Predictions** — dog leg should always appear as leg 2 (after lock)
- [ ] **Dog auto-tag** — dog pick should auto-tag as `isDog` on predictions when picked same day without re-locking
- [ ] **Individual leg odds on Lay slip** — show each leg's odds so user can see which leg added most value
- [ ] **Yesterday tab in Predictions** — show previous day's selections inside Predictions section
- [ ] **Error logging** — server.js has no persistent error log; add append-only `server.log`
- [ ] **Versioned savedata** — add `_version` field for future schema migrations

### Low Priority / Future
- [ ] **balldontlie stats** — needs paid API key (balldontlie.io)
- [ ] **Media tab** — Discord webhook feed (post pick at lock time, update on result), Twitter/X embed
- [ ] **Historical odds/results** — 7-day team records on game cards (SportsDataIO, ActionNetwork, or paid the-odds-api tier)
- [ ] **Player team colors in Props** — heuristic alphabetical split is unreliable; needs real roster API
- [ ] **Timestamped backup rotation** — keep 7 days of `savedata.YYYY-MM-DD.json` snapshots using `node-cron`
- [ ] **`POST /import` endpoint** — accept JSON upload to restore from any snapshot (pairs with export)

### Roadmap (Longer Term)
- [ ] **VPS / home server deployment** — move server.js off localhost, drop Syncthing dependency
- [ ] **SQLite** — swap `savedata.json` for `better-sqlite3` when history queries are needed
- [ ] **Scheduled result resolution** — move ESPN result-checking to server cron job (runs at midnight regardless of app being open)
- [ ] **Push notifications** — Pushover or ntfy.sh: "Your lock WON 🔒✅" on game end
- [ ] **Capacitor APK** — wrap PWA into real `.apk` for sideloading after PWA is stable
- [ ] **React Native rewrite** — only if Play Store distribution or native APIs are needed

### Deferred (Not Needed Yet)
- [ ] Real DB (Supabase etc.) — swap out server.js when/if needed
- [ ] Multi-device conflict resolution — Syncthing last-write-wins is fine for now

---

## Notes
- Cache data (odds, props, stats) intentionally stays in localStorage — temporary, resets every 3hrs
- `savedata.json` grows ~1 entry/day — roughly 200-300KB after a full year, no performance concern
- Dev panel password: stored in code (Jesiah) — fine for local-only use
- Git remote: `git@github.com:tomisouka/I-DONT-MISSSS.git`
- Restore point before App.jsx split: `b4f1f47`
