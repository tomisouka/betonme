# BetOnMe — Tickets

All known bugs, broken features, and planned work in one place.
Status: 🔴 Broken · 🟡 Incomplete · 🟢 Works but needs improvement · ⬜ Planned

---

## 🚨 URGENT — Priority #1

### TICKET-FLOW001 · Pick flow order enforcement
**Status:** ✅ Fixed  
**What was wrong:** HateWatch and Favs tabs were reported to have `goLock()` / `saveState()` calls that could overwrite the Lock of the Day. On inspection both tabs were already read-only with no pick buttons. Sequential gating added in App.jsx.  
**Fix applied:**
- Confirmed FavsTab and HateWatchTab are READ ONLY — no saveState/goLock calls exist
- Added `gate` metadata to each tab in TABS array in App.jsx
- `isTabLocked()` helper checks prerequisites at render time
- Locked tabs render dimmed (opacity 0.45) and are unclickable with a tooltip
- If somehow navigated to while locked, a `GateWall` component blocks with a clear message
- Gating order enforced:
  - Dog → requires Lock
  - Favs, HateWatch, Parlays → require Lock + Dog
  - Props → requires Lock + Dog (parlays gate preserved for future)
**Files:** App.jsx

### TICKET-PROPS001 · Props tab full rewrite
**Status:** ✅ Resolved  
**What was fixed:**
- 4 picks per day: 2 lock game pitchers + 2 dog game pitchers
- Lock and dog fetched in single call (`fetchAllProps`) with explicit args — no stale closure values
- `fetchedRef` guard prevents loops; refresh button works correctly
- `refreshLock()` added to App.jsx init useEffect — `todayLock` now loads on startup
- Dog props section hidden when lock and dog are the same game
- Already-picked pitchers hidden from picker immediately after confirming
- 🔒 LOCK / 🐕 DOG pill on every TODAY and YESTERDAY card
- Dog vs lock label derived from `dogPropLines` player set at render time
- `isDogGame` flag + correct `gameId` saved on confirm for future picks
- Manual W/L grading removed — auto-resolves via ESPN only
- Yesterday section collapsed by default
- `test-props.mjs` added to project root for server-side validation
**Files:** PropsTab.jsx, App.jsx

---

### TICKET-BOT001 · Discord Bot — pick delivery & results
**Status:** 🚨 Urgent · Not started  
**What's needed:** A Discord bot that posts today's lock and dog of the day to a channel when they're set, then updates the message with the result (W/L) once the game finishes. This is the primary distribution layer for picks — everything else is secondary until this is live.  
**Scope:**
- Bot posts lock + dog embed to a designated channel when predictions are locked
- Edits the message with W/L result when `results.py` resolves the pick
- Slash command or webhook trigger from `server.js` (POST `/discord-notify`)
- Embed should show: team, odds, sport, game time, and result badge when resolved
**Effort:** Medium  
**Priority:** 🚨 DO THIS FIRST

---

## 🔴 Broken

### TICKET-T001 · Tauri app has no memory (server not bundled)
**Status:** 🔴 Broken  
**What's wrong:** The Tauri .deb installs the React frontend but `server.js` is not bundled. All app data lives in `savedata.json` served by Express on port 3001. When the .deb app launches, it shows "Server offline" — blank app with no data.  
**Recommended fix:** Bundle server.js to `/usr/share/betonme/server.js` via tauri.conf.json resources, update `lib.rs` `find_server_dir()` to check that path, ensure node is a deb dependency. We want to make this an app and we need to fix the memory issue within tauri as well.  
**Effort:** Medium · Deferred

---

## 🟡 Incomplete

### TICKET-021 · Favs tab — analytics expansion
**Tab:** Favs  
**Status:** 🟡 Foundation built — core bias metrics live, deeper analytics planned  
**What's built:**
- Team selector (all 30 MLB teams, persisted to localStorage)
- Bias Meter — needle showing always-fade → neutral → always-pick based on pick history
- Picked them / Faded them / MLB overall win rate cards
- Knowledge Delta — win rate on their games vs your MLB average
- Avg odds when picking them (chalk vs value lean)
- Recent picks log (last 5 games they were involved in)

**What's left to build:**
- Home / away split in your picks for that team
- Division rival head-to-head record
- Streak chasing detection (do you keep picking them after a W, bail after an L)
- Pitcher matchup awareness score
- Day / night game split
- NBA team support (currently MLB only)
- Full audit of TEAM_ABBREVS (DK abbrevs like "HOU Astros" vs "Houston Astros" — partial coverage, needs completion)

**Effort:** Medium (iterative)

---

### TICKET-007 · Media tab not built
**Tab:** Media  
**What's wrong:** Tab exists but has no real content — just placeholder text.  
**Intended fix:** Discord webhook (post pick on lock, update on result), Twitter/X embed. Pull from discord channel and upload to media tab and make video playable within tab. WITHIN TAB.  
**Effort:** Large

### TICKET-009 · Game card 7-day team records
**Tab:** Games  
**What's wrong:** No historical win/loss context on game cards.  
**Intended fix:** Show each team's last 7-day ML and spread record per card. Needs historical results API.  
**Effort:** Large (needs external API)

### TICKET-010 · Dog tab 7-day underdog record
**Tab:** Dogs  
**What's wrong:** No historical straight-up win rate shown per underdog.  
**Effort:** Large (same dependency as TICKET-009)

### TICKET-011 · Props player team color split unreliable
**Tab:** Props  
**What's wrong:** Player-to-team assignment uses a heuristic name split which breaks on some matchups.  
**Intended fix:** Real roster API to map player → team accurately.  
**Effort:** Medium

### TICKET-015b · Batter props O/U subcategoryIds needed
**Tab:** Props / dk_scraper.py  
**What's wrong:** DK batter prop O/U subcategoryIds (hits, total bases, HRs, RBIs, stolen bases) not yet captured from DevTools — lines only post game-day morning.  
**Intended fix:** Open DevTools on DK MLB batter props page on game day, grab subcategoryIds, add to PROP_SUBCATEGORIES in dk_scraper.py.  
**Effort:** Small (data collection) · Do on next game day

---

## 🟢 Works but needs improvement

### TICKET-023 · Live tab — chart axis too wide + add hi/lo/current
**Tab:** Live  
**What's wrong:** Y-axis range is too broad so small odds movements look flat. No way to see the lowest, highest, and current odds at a glance.  
**Intended fix:**
- Tighten Y-axis to fit actual data range ± small padding so movement looks dramatic
- Add Lowest / Highest / Current labels for each team's odds line
- Vegas rarely moves lines more than 10-15 cents pre-game, chart should reflect that
**Effort:** Small

### TICKET-022 · Parlays tab — slip UI redesign
**Tab:** Parlays  
**What's wrong:** Locked slips have no visual identity — just a list of legs. Doesn't feel like a real betting slip.  
**Intended fix:** Redesign locked parlay slip to look like an actual sportsbook slip — card-style with header, legs, total odds, potential payout. Should entice the user and feel premium.  
**Effort:** Medium

### TICKET-001 · Live tab chart — needs more snapshots
**Tab:** Live  
**What's wrong:** Chart only shows one dot until enough snapshots accumulate.  
**Status:** Working as designed — improves naturally as scraper runs.

---

## ⬜ Planned

### TICKET-020 · Always-on free server for live odds + props
**Tab:** Infrastructure  
**Description:** Scraper and server only run when `startapp.sh` is open. Need to deploy to always-on host.  
**Free options (in order of preference):**
- **Oracle Cloud Free Tier** — Always-free ARM VM (4 CPU / 24GB RAM). Best option.
- **Fly.io free tier** — 3 shared VMs free.
- **Render free tier** — Spins down after 15min inactivity.
- **GitHub Actions cron** — Hacky but zero infrastructure.

**What needs to change:**
- Frontend API calls hardcoded to `127.0.0.1:3001` need an env var for deployed URL
- `dk_scraper.py` output path must match where server reads from

**Effort:** Medium · **Priority:** High

---

### TICKET-018 · NBA player props
**Tab:** Props  
**Description:** Find NBA player prop subcategoryIds (points, rebounds, assists O/U) from DevTools on DK NBA props page.  
**Effort:** Small

### TICKET-019 · Scraper result — show last run time in UI
**Tab:** App header  
**Description:** Show when the systemd watch-mode scraper last ran (read from dk_odds.json fetchedAt field).  
**Effort:** Small

---

## ✅ Resolved (for reference)

| Ticket | Description | Fixed |
|--------|-------------|-------|
| — | Race condition on startup | Write queue in `useSaveData.js` |
| — | CORS blocking port 5175 | Dynamic origin regex in `server.js` |
| — | LockTab stale data | Sequential init, state passed through |
| — | Dog tab accessible before lock | Lock gate added to DogTab |
| — | Dog auto-set not triggering | `[todayLock]` dependency on useEffect |
| TICKET-001 | Live tab broken | Replaced with DK odds movement chart |
| TICKET-002 | Live scores missing | ESPN scores wired into game cards |
| TICKET-003 | Dog leg ordering | Was already working |
| TICKET-004 | Dog auto-tag | Was already working |
| TICKET-005 | Per-leg odds missing from Lay slip | Added odds display to locked lay legs |
| TICKET-006 | Yesterday prediction card | Was already built in ParlaysTab |
| TICKET-008 | Dog threshold was >0 | Raised to >=150 |
| TICKET-012 | Only one rolling backup | Daily timestamped backups, 7-day retention |
| TICKET-013 | No /import endpoint | POST /import + GET /backups/:filename added |
| TICKET-014 | Errors lost on restart | Append-only server.log with timestamps |
| TICKET-015 | No schema version | _version: 1 stamped on every write |
| TICKET-015b | Pitcher props missing | DK scraper 15221 (Ks) + 17413 (Outs) |
| TICKET-016 | Tauri wrapper | src-tauri/ scaffolded, build-deb.sh provided |
| TICKET-017 | Pitchers not shown on cards | MLB game cards: pitchers under each team name |
| T-002 | Games tab on the-odds-api | Migrated to ESPN (free, unlimited) |
| TICKET-FLOW001 | Pick flow gating — FavsTab/HateWatchTab read-only confirmed, sequential gate added to App.jsx | ✅ Fixed |
| — | App.jsx was 3,051 lines | Split into per-tab components |
| — | localStorage for persistent data | Migrated to savedata.json via Express |
| — | NBA game lines missing | DK scraper subcategoryId 4511 |
| — | MLB game lines on the-odds-api | DK scraper subcategoryId 4519 |
| — | F5 lines missing from Parlays | DK scraper subcategoryId 15628, matched via game._dk.f5 |
| — | Props marketKey showing raw subcategoryId | SUBCAT_TO_KEY map + savedata.json migrated |
| — | Props team hardcoded to away | Fixed to use p.team \|\| p.away |
| — | Props sneak peek unsorted | MLB first (pitchers → batters), then NBA |
| — | Prop picks had no W/L grading | Inline ✅ W / ❌ L buttons on pending cards |
| — | Props unavailable banner after game ends | Suppressed when today already has picks |
| — | PropsInsightPanel counting pending picks | Over/under totals now resolved-only |
| — | [DK] console label | Renamed to [stros_scraper] in odds.js |
| — | Favs tab foundation | TICKET-021 open for expansion |
| TICKET-NOPICK001 | HateWatch/Favs no way to skip when team not playing | Added "No pick today" button + confirm dialog in TodayGameCard — works on both game-today and no-game-today paths. Saves `{noPick:true}` to pick slot, doesn't affect analytics. |
| TICKET-PASTLAY001 | PastLayTab always showed "Loading history..." | Bare `return` with no `if(loading)` guard — one-char fix. |
| TICKET-PASTLAY002 | PastLayTab — no total odds or payout shown | Added `calcTotalOdds()` + `TotalOddsRow` component. Parlay math for all slips (Lock, Dog, Double Lock, Predictions, Lay). `🪙1 wins → 🪙X,XXX.XX` sub-row with comma formatting. |
| TICKET-PASTLAY003 | PastLayTab — no final scores or prop results shown | Added `fetchGameScore()` hitting ESPN summary endpoint per gameId on day select. Final scores shown per leg as italic sub-line. Props show `Player: 7 K · line 6.5 · HIT`. |
| TICKET-LIVE001 | Live tab showing 3 dogs when only 1 picked | `isDog` matched on home/away team presence in game, not on actual picked team. Fixed: `matchesPick()` now prefers `gameId` comparison, falls back to matching the picked team name only (not any team in that game). |
| TICKET-PITCHER001 | Pitcher line in ParlaysTab hard to read | Restyled all 3 pitcher spots (game browser, slip legs, Lay section) as a compact navy pill (`#0d1a2a` bg, `#1a3a5a` border, `#7ab8e8` name text). |
| TICKET-DOG001 | DogTab had no pick history | Added `📋 History NW–NL` button in header. Opens bottom-sheet modal with all past picks sorted newest-first — date, team, matchup, odds in tier color, W/L/⏳. Only shows once results exist. |
