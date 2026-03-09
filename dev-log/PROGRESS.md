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
| 🎮 Games | ✅ Working (ESPN status badges) |
| 🔒 Lock | ✅ Working (ESPN status badges, MAX bet button) |
| 🐕 Dogs | ✅ Working |
| 🎰 Parlays | ✅ Working |
| 🎲 Props | ✅ Working (lines cache in localStorage) |
| 📺 Media | 🚧 Under construction |
| ⚡ Live | ⚠ Broken — live odds fetch not working |

---

## Completed

### 2026-03-08 (Session 2)
- **Welcome back screen** — boot overlay in App.jsx showing current date, daily coin status (earned today vs already claimed + balance), and first game of the day pulled from live odds. Coin grant moved here from LockTab so welcome always shows post-grant balance. LockTab skips grant if already done.
- **MAX button on Lock bet modal** — one-click sets bet amount to full coin balance in LockTab modal
- **ESPN game status badges** — GamesTab and LockTab now fetch ESPN scoreboard on load. Live games show 🔴 LIVE · Q3 8:42 badge; finished games show ✓ Final · LAL 112 · BOS 108. In LockTab, unavailable games replace pick buttons with "Game in progress — betting closed" / "Game over — betting closed"
- `getGameStatus()` helper shared in both tabs — matches odds API games to ESPN events by team name fuzzy match

### 2026-03-08 (Diagnostics)
- Audited all TODO items against actual codebase
- **App.jsx split** — confirmed complete. App.jsx is 309 lines (was 3,051). All tabs live in `src/tabs/`, shared hook in `src/hooks/useSaveData.js`, utils in `src/utils/odds.js`
- **Dog auto-tag** — confirmed complete. DogTab auto-sets dog from lock when odds are +150 or better (`autoSetFromLock: true` flag)

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
- [ ] **Live tab — fix live odds fetch** — nothing in LiveTab works right now. Currently re-fetches from the-odds-api which returns cached/stale lines. Need to either use a different endpoint that returns in-play odds, or replace with ESPN live data and drop the odds display entirely for in-progress games. Investigate: the-odds-api `/v4/sports/{sport}/events/{eventId}/odds` with `markets=h2h` may return live lines if available.
- [ ] **Live scores on game cards** — GamesTab and LockTab currently show ESPN status badge (e.g. "🔴 LIVE · Q3 8:42") but not the actual score. The ESPN scoreboard response already contains `competitors[].score` — wire it into the badge so users see "🔴 Q3 8:42 · LAL 87 – BOS 91" inline on the card without having to click anything.

### Medium Priority
- [ ] **Dog ordering in Predictions** — dog leg should always appear as leg 2 (after lock). No sort logic currently enforces this.
- [ ] **Individual leg odds on Lay slip** — locked lay slip shows team + result emoji but no per-leg odds. TodoBox comment in ParlaysTab line ~301 calls this out.
- [ ] **Yesterday tab in Predictions** — show previous day's selections inside Predictions section. No prevDay logic exists yet in LockTab or App.jsx.
- [ ] **Timestamped backup rotation** — keep 7 days of snapshots via `node-cron`. Currently only one rolling backup (`savedata.backup.json`). `node-cron` not installed.
- [ ] **`POST /import` endpoint** — accept JSON upload to restore from any snapshot. `/restore-backup` exists but only restores the single rolling backup, not arbitrary uploads.
- [ ] **Error logging** — add append-only `server.log` with timestamps. Currently errors go to `console.error` only and are lost on restart.

### Low Priority / Future
- [ ] **Versioned savedata** — add `_version` field to `savedata.json` for future schema migrations. Currently missing.
- [ ] **balldontlie stats** — needs paid API key (balldontlie.io)
- [ ] **Media tab** — Discord webhook (post pick on lock, update on result), Twitter/X embed
- [ ] **Historical odds/results** — 7-day team records on game cards (needs SportsDataIO or paid tier)
- [ ] **Player team colors in Props** — heuristic split unreliable; needs real roster API

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