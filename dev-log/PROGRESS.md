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
- **Odds scraper:** dk_scraper.py — DraftKings reverse-engineered API, runs every 30min via systemd
- **Cache:** localStorage (ESPN, odds — temporary, intentionally not migrated)
- **Package manager:** pnpm
- **Dev runner:** concurrently (startapp.sh)

### Data Flow
```
startapp.sh / pnpm dev
├── [server] node server.js → reads/writes savedata.json, serves dk_odds.json, odds_history.json
└── [vite]   vite → serves React app on localhost:5173

systemd user service (dk-scraper.service)
└── python3 dk_scraper.py --watch → fetches DK every 30min → dk_odds.json + POST /odds-history
```

### Data Sources
| Source | Data | Cost |
|--------|------|------|
| ESPN (unofficial) | Games, scores, schedules, live status | Free · unlimited |
| DraftKings (dk_scraper.py) | Game lines (ML/spread/total), pitcher props | Free · unlimited |
| the-odds-api | Player props fallback only | 500 credits/month · resets April 1 |
| Local Express | savedata.json, odds_history.json | Local |

### savedata.json Structure
```json
{
  "_version": 1,
  "app": { "coins": 0, "lastCoinDate": "YYYY-MM-DD", "picks": { "YYYY-MM-DD": {} } },
  "predictions": { "YYYY-MM-DD": { "legs": [], "lockedAt": 0 } },
  "lay": { "YYYY-MM-DD": { "legs": [], "lockedAt": 0 } },
  "dog": { "picks": { "YYYY-MM-DD": {} }, "dogStreak": {} },
  "propPick": { "YYYY-MM-DD": { "[team]": {} } },
  "ouPick": { "YYYY-MM-DD": { "name": "", "point": 0, "odds": 0 } }
}
```

### DK Scraper Subcategory IDs
| Sport | subcategoryId | Market |
|-------|--------------|--------|
| MLB | 4519 | Game lines (ML/spread/total) |
| MLB | 15221 | Pitcher Strikeouts O/U |
| MLB | 17413 | Pitcher Outs O/U |
| NBA | 4511 | Game lines (ML/spread/total) |
| MLB batter props | TBD | Hits O/U, Total Bases O/U, HRs O/U, RBIs O/U — grab from DevTools on game day |
| NBA player props | TBD | Points O/U, Rebounds O/U, Assists O/U |

---

## Tabs
| Tab | Status |
|-----|--------|
| 🎮 Games | ✅ Working — ESPN + DK odds, Today/Tomorrow/Later sections, final scores, live badges |
| 🔒 Lock | ✅ Working — ESPN status badges, MAX bet button |
| 🐕 Dogs | ✅ Working — +150 threshold |
| 🎰 Parlays | ✅ Working |
| 🎲 Props | ✅ Working — DK pitcher props free, the-odds-api fallback for batter props |
| 📺 Media | 🚧 Under construction |
| ⚡ Live | ✅ Working — DK odds movement chart, dual-axis (odds + implied prob %), 30min snapshots |
| 🏆 Wins | ✅ Working |
| 📋 Past Lays | ✅ Working |

---

## Completed

### 2026-03-27 (Session 3 — DK Scraper + Live Tab + Props)

#### DraftKings Scraper (`dk_scraper.py`)
- Reverse-engineered DK internal API from browser DevTools network capture
- Endpoint: `sportsbook-nash.draftkings.com/sites/US-SB/api/sportscontent/controldata/league/leagueSubcategory/v1/markets`
- **MLB game lines:** subcategoryId `4519` — moneyline, run line, total
- **NBA game lines:** subcategoryId `4511` — moneyline, spread, total
- **Pitcher Strikeouts O/U:** subcategoryId `15221` — standard o/u format (6.5 Ks o+121 / u-155)
- **Pitcher Outs O/U:** subcategoryId `17413` — outs recorded (15.5 o+112 / u-148)
- `parse_props()` handles both O/U format (over/under pairs) and milestone format (3+, 4+, 5+)
- Saves to `dk_odds.json`, logs odds snapshots to server `/odds-history` endpoint
- Runs every **30 minutes** via systemd service (`dk-scraper.service`)
- `--watch` flag for systemd mode, `--test` flag for dry run

#### Server (`server.js`)
- `GET /dk-odds` — serves dk_odds.json
- `GET /dk-props?sport=MLB` — serves props portion of dk_odds.json
- `POST /scrape-now` — triggers dk_scraper.py on demand (↺ Refresh button)
- `GET /odds-history` — returns odds movement history (last 2 days, auto-purge)
- `POST /odds-history` — logs new snapshot (called by scraper)
- Fixed ES module `require()` → `import { exec }` bug

#### Live Tab — Full Rewrite
- Dual-axis SVG line chart — American odds (left) + implied probability % (right)
- Home team in blue, away team in purple
- Shows last 2 days — loads yesterday's lock + dog from savedata on mount
- Lock game highlighted green (sorts first), Dog game highlighted orange (sorts second)
- ↺ Refresh Now button triggers `/scrape-now` + reloads history
- Game cards collapsed by default, tap to expand chart + movement log
- Movement log shows last 3 snapshots, expandable

#### Games Tab
- **Today/Tomorrow/Later** sections — clean split by local date
- Final scores on completed games: `Diamondbacks 3 – Dodgers 7`
- Completed games moved to collapsed `✓ FINAL` section
- All games sorted chronologically by `commence_time` across sports
- Fixed UTC date bucketing bug (was showing today's games as tomorrow)
- NBA odds now show in game cards (was showing no lines before)

#### Props Tab — DK Integration
- `fetchDkProps()` — tries local DK scraper first (free), falls back to the-odds-api
- Props sneak peek always visible (even without lock), fetches `/dk-props` on mount
- Sneak peek shows pitcher Ks O/U + Outs O/U grouped by game per pitcher
- Shows TBA for any market not yet posted
- Starts at 2 pitchers per game, "+ more" to expand

#### App-wide
- Global `↺ Refresh` button in header — runs scraper + force-refreshes ESPN
- Shows "Updated 8:45 PM" timestamp after refresh
- Data sources bar updated to show actual sources (DK for lines, ESPN for games)

---

### 2026-03-08 (Session 2)
- Welcome back screen — boot overlay with daily coin status
- MAX button on Lock bet modal
- ESPN game status badges in GamesTab and LockTab
- `getGameStatus()` helper shared between tabs

### 2026-03-04 (Session 1)
- Migrated all persistent data from localStorage to `savedata.json` via Express
- Built `server.js` with GET/POST `/data`, `/export`, `/restore-backup`
- Backup on write — timestamped backups in savedata-backups/, 7-day retention
- Migrated: lock picks, predictions, lay, dog picks, prop picks, double lock O/U
- Graceful shutdown — SIGTERM / SIGINT handled in server.js
- Set up concurrently — `pnpm dev` starts both servers

---

## TODO

### Do Tomorrow
- [ ] **Batter prop subcategoryIds** — open DK MLB batter props on game day, grab Hits O/U, Total Bases O/U, HRs O/U, RBIs O/U subcategoryIds from DevTools Network tab, add to `PROP_SUBCATEGORIES` in dk_scraper.py
- [ ] **Fix deprecation warnings** — `datetime.utcnow()` → `datetime.now(timezone.utc)` in dk_scraper.py

### Medium Priority
- [ ] **NBA player props** — find NBA player prop subcategoryIds from DevTools (points, rebounds, assists O/U)
- [ ] **Media tab** — Discord webhook (post pick on lock, update on result), Twitter/X embed
- [ ] **TICKET-T001** — Tauri server bundling (Option D: resources in tauri.conf.json)

### Low Priority / Future
- [ ] **7-day team records** — on game cards and dog tab (needs historical results API)
- [ ] **Player team colors in Props** — needs real roster API
- [ ] **VPS/Pi deployment** — HTTPS via Caddy, drop Syncthing dependency

---

## Notes
- Cache data (odds, props, stats) stays in localStorage — temporary, no need to persist
- `savedata.json` grows ~1 entry/day — ~200-300KB after a full year, no performance concern
- Dev panel password: `Jesiah` — fine for local-only use
- Git remote: `git@github.com:tomisouka/I-DONT-MISSSS.git`
- DK scraper API key: none needed — reverse-engineered from browser traffic
- the-odds-api key: `9556a1b199876f898bdc45023a854ed2` — resets April 1st (27 credits left as of 2026-03-27)
- Systemd service: `systemctl --user status dk-scraper` to check, `journalctl --user -u dk-scraper -f` for logs
