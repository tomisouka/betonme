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
| 🐕 Dogs | ✅ Working |
| 🎰 Parlays | ✅ Working |
| 🎲 Props | ✅ Working (lines cache in localStorage) |
| 📺 Media | 🚧 Under construction |
| ⚡ Live | ✅ Working |

---

## Completed

### 2026-03-04 (Session 2)
- Fixed away vs home ordering throughout entire app (correct convention: away vs home)
- Fixed predictions slip sorting — locked slips enforce lock → dog → rest order
- Added `_leg` reference to fallback game objects so locked predictions retain full leg data
- Lock confirm modal subtitle updated to "odds locked at pick time"
- Dev panel "Close & Reload" split into "Exit" and "Exit & Reload" buttons
- Added TodoBox items across Props and Parlays tabs for future work tracking
- Created `BetOnMe-Roadmap.md` and `SERVER.md` — server evolution + PWA/APK path docs
- Git restore point committed: `b4f1f47` — "restore point before splitting 3k App.js"
- Confirmed `savedata.json` + `savedata.backup.json` in `.gitignore` ✅
- Confirmed git remote: `git@github.com:tomisouka/I-DONT-MISSSS.git` ✅

### 2026-03-04 (Session 1)
- Migrated all persistent data from localStorage to `savedata.json` via Express server
  - Built `server.js` with GET/POST `/data`, `/export`, `/restore-backup` endpoints
  - Backup on write — server rotates `savedata.json` → `savedata.backup.json` before every save
  - Migrated: lock picks, predictions, lay, dog picks, prop picks, double lock O/U
  - Added one-time `migrateLocalStorageToServer()` migration utility on startup
  - Fixed async patterns throughout (`useState({})` + `useEffect` instead of sync `useState(loadFn)`)
  - Fixed CORS origins
- Graceful shutdown — `SIGTERM` / `SIGINT` handled in server.js
- Set up `concurrently` — `pnpm dev` starts both servers with labeled `[server]` / `[vite]` output

---

## TODO

### High Priority
- [ ] **Split App.jsx** — 3,051 lines needs breaking into per-tab component files
  ```
  src/
  ├── components/
  │   ├── LockOfTheDay.jsx
  │   ├── DogOfTheDay.jsx
  │   ├── ParlaysTab.jsx
  │   ├── PropsTab.jsx
  │   ├── LivePicksTab.jsx
  │   ├── OddsDashboard.jsx
  │   ├── MediaTab.jsx
  │   └── StatsBar.jsx
  ├── lib/
  │   ├── storage.js     ← all server fetch/save functions
  │   └── helpers.js     ← calcProfit, formatOdds, getSportsInSeason, etc.
  └── App.jsx            ← root only: tabs, shared state, fetchOdds
  ```

### Medium Priority
- [ ] **Dog ordering in Predictions** — dog leg should always appear as leg 2 (after lock)
- [ ] **Dog auto-tag** — dog pick should auto-tag as `isDog` on predictions when picked same day without re-locking
- [ ] **Individual leg odds on Lay slip** — show each leg's odds so user can see value per leg
- [ ] **Yesterday tab in Predictions** — show previous day's selections inside Predictions section
- [ ] **Timestamped backup rotation** — keep 7 days of snapshots via `node-cron` (see SERVER.md)
- [ ] **`POST /import` endpoint** — accept JSON upload to restore from any snapshot (see SERVER.md)
- [ ] **Error logging** — add append-only `server.log` (see SERVER.md)

### Low Priority / Future
- [ ] **balldontlie stats** — needs paid API key (balldontlie.io)
- [ ] **Media tab** — Discord webhook (post pick on lock, update on result), Twitter/X embed
- [ ] **Historical odds/results** — 7-day team records on game cards (needs SportsDataIO or paid tier)
- [ ] **Player team colors in Props** — heuristic split unreliable; needs real roster API
- [ ] **Versioned savedata** — add `_version` field for future schema migrations

### Roadmap (See SERVER.md for full detail)
- [ ] **Phase 1** — timestamped backups, import endpoint, error log
- [ ] **Phase 2** — VPS/Pi deployment, HTTPS via Caddy, drop Syncthing
- [ ] **Phase 3** — SQLite, server-side cron result resolution, push notifications
- [ ] **Phase 4** — PWA setup (`vite-plugin-pwa`) once hosted somewhere, then Capacitor APK
- [ ] **Future** — React Native only if Play Store distribution becomes a goal

---

## Notes
- Cache data (odds, props, stats) stays in localStorage — temporary, 3hr TTL, no need to persist
- `savedata.json` grows ~1 entry/day — ~200-300KB after a full year, no performance concern
- Dev panel password: `Jesiah` — fine for local-only use
- Git remote: `git@github.com:tomisouka/I-DONT-MISSSS.git`
- Restore point before App.jsx split: `b4f1f47`
