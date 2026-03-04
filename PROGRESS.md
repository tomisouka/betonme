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
  "lay": { "YYYY-MM-DD": { "legs": [], "lockedAt": 0 } }
}
```

---

## Tabs
| Tab | Status |
|-----|--------|
| 🎮 Games | ✅ Working |
| 🔒 Lock | ✅ Working |
| 🐕 Dogs | ✅ Working (localStorage) |
| 🎰 Parlays | ✅ Working |
| 🎲 Props | ✅ Working (cache in localStorage) |
| 📺 Media | 🚧 Under construction |
| ⚡ Live | ✅ Working |

---

## Completed

### 2026-03-04
- Migrated persistent data from localStorage to `savedata.json` via Express server
  - Built `server.js` with GET/POST `/data` endpoints
  - Removed duplicate localStorage function definitions from App.jsx
  - Made all storage calls properly async (`loadState`, `saveState`, `loadPredictions`, `savePredictions`, `loadLayHistory`, `saveLayHistory`)
  - Fixed `useState(loadState)` → `useState({})` + async `useEffect` pattern in LockOfTheDay and ParlaysTab
  - Fixed inline `loadState()` JSX calls → `todayLock` state variable in root App
  - Fixed `devAction` and `confirmPick` to be async
  - Fixed CORS origin (5174 → 5173/5174)
- Set up `concurrently` so `pnpm dev` starts both servers with labeled `[server]` / `[vite]` output
- Installed `concurrently ^9.1.2` as devDependency

---

## TODO

### High Priority
- [ ] **Git setup** — commit server.js, App.jsx, package.json; add `savedata.json` to `.gitignore`
- [ ] **Migrate remaining localStorage data to savedata.json**
  - `dogapp` — dog picks (real pick data, should persist)
  - `propPick` — prop picks (real pick data, should persist)
  - `doubleLockOU` — double lock O/U pick (real pick data, should persist)

### Medium Priority
- [ ] **Backup on write** — keep a `savedata.backup.json` of the last good save in case file gets corrupted
- [ ] **Export/backup button** in dev panel — snapshot savedata.json manually
- [ ] **Error logging** — server.js currently has no persistent error log

### Low Priority / Future
- [ ] **One-time localStorage migration utility** — read old browser data and POST it to server (for migrating existing data from another browser/device)
- [ ] **balldontlie stats** — needs paid API key (balldontlie.io)
- [ ] **Media tab** — Discord webhook feed, Twitter/X embed
- [ ] **Historical odds/results** — 7-day team records on game cards (SportsDataIO, ActionNetwork, or paid the-odds-api tier)
- [ ] **Graceful server shutdown** — handle SIGTERM in server.js

### Deferred (Not Needed Yet)
- [ ] Real DB (Supabase etc.) — swap out server.js when/if needed
- [ ] Multi-device conflict resolution — Syncthing last-write-wins is fine for now

---

## Notes
- Cache data (odds, props, stats) intentionally stays in localStorage — it's temporary and resets every 3hrs anyway
- `savedata.json` grows ~1 entry/day — roughly 200-300KB after a full year, no performance concern
- Dev panel password: stored in code (Jesiah) — fine for local-only use
