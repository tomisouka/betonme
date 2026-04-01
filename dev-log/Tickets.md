# BetOnMe — Tickets

All known bugs, broken features, and planned work in one place.
Status: 🔴 Broken · 🟡 Incomplete · 🟢 Works but needs improvement · ⬜ Planned

---

## 🚨 URGENT — Priority #1

### TICKET-MEDIA003 · Media tab — pitcher/batter refresh still broken
**Tab:** Media  
**Status:** 🔴 Broken — Priority #1  
**What's wrong:** The refresh button on the Today sub-tab is not reliably correcting the lineup. Two separate problems:

1. **Lineup source** — `fetchMlbLineup` now hits `/schedule?gamePk={pk}&hydrate=lineups` which is correct, but this endpoint only returns lineups once the home team has officially submitted them (typically ~30–60 min before first pitch). Before that window, `lineups` is null and we fall back to the ESPN box score, which only contains batters who have already come to the plate. This means early refreshes still show an incomplete/wrong lineup.

2. **Merge correctness** — even when both sources are available, the last-name match used to merge ESPN stats onto MLB lineup slots is fragile (e.g. "Yordan Alvarez" matched against ESPN's "Y. Alvarez" can fail). Any mismatch silently drops that player's live stats (H, RBI, etc.).

**Intended fix:**
- On refresh, always prefer MLB `/schedule?hydrate=lineups` if available
- If `lineups` is null (pre-submission), fall back to ESPN box-score batting order — but flag the lineup as "not yet confirmed" in the UI
- Improve merge: match on full name first, then last name, then ESPN `batOrder` slot as final fallback so no stats are silently lost
- Add a visible "📋 Lineup confirmed" vs "⏳ Lineup TBD" badge on each BatterCard header

**Files:** `src/tabs/MediaTab.jsx` — `fetchMlbLineup`, lineup merge block in `usePitcherData`  
**Effort:** Medium  
**Priority:** 🚨 Fix before next game day

---

### TICKET-MEDIA004 · Media tab — Outs panel and Highlights reel are not cleanly split
**Tab:** Media  
**Status:** 🔴 Broken  
**What's wrong:** The Outs & Strikeouts panel and the full Highlights reel both pull from the same `fetchGameHighlights` pool but apply different (and incomplete) filters:

- **`filterHighlightsByPlayer`** (Highlights reel) — only checks `player_id` match; does NOT exclude recap reels, so compiled recap packages (e.g. `highlight-reel-starting-pitching`) appear in both panels.
- **`filterOutClips`** (Outs panel) — excludes `highlight-reel-starting-pitching` but misses other recap reel keyword values (e.g. `highlight-reel`, `condensed-game`, `daily-recap`). Individual out/K clips that happen to also match the pitcher's `player_id` correctly appear here, but recap reels tagged with multiple player IDs can still slip through.
- No deduplication between panels — the same clip can appear in both Outs and Highlights.

**Intended fix:**
- Define one authoritative "is this a recap reel" predicate: exclude any item where `keywordsAll` contains `type === "slug"` values of `highlight-reel-starting-pitching`, `highlight-reel`, `condensed-game`, or `daily-recap`
- **Outs panel**: individual out/K clips only — `player_id` match + NOT recap reel + short duration (< 60s is a good proxy for individual play clips)
- **Highlights reel**: all pitcher clips — `player_id` match + NOT recap reel (any duration)
- Deduplicate: if a clip ID already appears in Outs, exclude it from Highlights
- Validate against the verified clip IDs in TICKET-007 (Tatsuya Imai, gamePk 824215)

**Files:** `src/tabs/MediaTab.jsx` — `filterOutClips`, `filterHighlightsByPlayer`, `OutsPanel`, `PitcherHighlights`  
**Effort:** Small  
**Priority:** High — fix alongside TICKET-MEDIA003

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

### TICKET-007 · Media tab — split layout (Outs panel + existing content)
**Tab:** Media  
**Status:** ✅ Done  
**Effort:** Medium

**What's built:**
- Pitcher card: today stats (K, IP, ERA, BB, HR), season stats (K/9, K%, WHIP, K/BB), pitch totals
- Batter lineup cards with ESPN live box score stats
- Highlight clip player — fetches from `statsapi.mlb.com/api/v1/game/{gamePk}/content`, plays mp4 inline
- **Outs & Strikeouts panel** — collapsible, sits above the game line in each PitcherCard. Compact rows: thumbnail → title → duration → tap to play inline.
- **All highlight sections collapsed by default** — both the Outs panel and the full Highlights reel require a tap to open.
- **Stat layout reorganized** — game line highlighted (bright accent pills, pitch count first), season stats separated by a full-width divider line, plain unhighlighted pills.

**Filter rule implemented (revised from spec):**
1. ~~`keywordsAll` contains `{ "type": "taxonomy", "value": "pitching" }`~~ — **DROPPED**: this tag is absent on most individual out/K clips; using it reduced the feed to recap reels only
2. `keywordsAll` does NOT contain `{ "value": "highlight-reel-starting-pitching" }` — still in use, correctly drops compiled recap reels
3. `keywordsAll` contains a `player_id` entry matching the pitcher's MLB personId — still in use, is the correct primary filter

The `player_id` match alone correctly identifies all clips attributed to our pitcher. The recap reel exclusion drops the compiled highlight packages. This was validated against the verified clip IDs in the ticket spec (Tatsuya Imai, gamePk 824215) — individual K clips lack `taxonomy:pitching` but do have the `player_id` tag.

**🔬 Verified clip IDs (Angels @ Astros, 2026-03-29, gamePk 824215, pitcher Tatsuya Imai personId 837227)**

Individual out clips confirmed in the feed:

| slug | title | duration |
|---|---|---|
| `angels-challenged-pitch-result-mike-trout-called-out-on-strikes-capture-review` | Tatsuya Imai fans Mike Trout for first MLB strikeout | 0:29 |
| `travis-d-arnaud-strikes-out-swinging-eetvtq` | Travis d'Arnaud strikes out swinging | 0:06 |
| `tatsuya-imai-strikes-out-four-in-major-league-debut` | Tatsuya Imai strikes out four in Major League debut | 0:46 |

Clips to exclude from the outs panel (no pitcher player_id tag, or recap reel):
- `jose-altuve-called-out-on-strikes-04fb30` — this K was by Angels pitcher Kochanowicz, not our pick
- Any clip tagged `highlight-reel-starting-pitching`

**Playback URL** — use `mp4Avc` from each item's `playbacks` array:
```
// bdata (short clips):
https://bdata-producedclips.mlb.com/{mediaPlaybackId}.mp4

// diamond (longer produced clips):
https://mlb-cuts-diamond.mlb.com/FORGE/{yyyy}/{yyyy-mm}/{dd}/{mediaPlaybackId}_1280x720_59_4000K.mp4
```

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

### TICKET-LOGO001 · Team logos — incomplete coverage + logo quality
**Tab:** All tabs  
**Status:** ⬜ Planned  
**What's needed:** Current logos use ESPN CDN via a hand-maintained ID map. Several teams are missing or mapped to wrong IDs. Need to audit all 30 MLB + 30 NBA + 32 NFL entries against the ESPN CDN, fix wrong IDs, and add any gaps. Some logos also render too small or with wrong aspect ratio on certain cards — a UI pass is needed once IDs are verified.  
**Files:** `src/utils/teamLogos.js`  
**Effort:** Small

---

### TICKET-PLAYERIMG001 · Player pictures — coming soon
**Tab:** Media, Props, Dogs  
**Status:** ⬜ Coming Soon  
**What's needed:** Show player headshots next to pitcher cards and batter rows in MediaTab, and next to prop picks. ESPN CDN player images are available at `https://a.espncdn.com/i/headshots/mlb/players/full/{espnId}.png`. Need to wire in espnId from the existing fetch pipeline and add fallback avatar for missing shots.  
**Effort:** Small–Medium

---

### TICKET-UI001 · UI overhaul — coming soon
**Tab:** All tabs  
**Status:** ⬜ Coming Soon  
**What's needed:** Full visual refresh across the app. Current UI is functional dark-mode but lacks polish and brand identity. Planned improvements:
- Consistent card system with elevation, shadows, and proper spacing scale
- Typography system (size scale, weight hierarchy)
- Color system — accent palette beyond the current green/orange/blue trio
- Animated transitions between tabs and state changes
- Better empty states and loading skeletons
- Mobile-first layout audit — some cards break on narrow screens
- Logo / splash screen for the Tauri app  
**Effort:** Large · Do after core feature set is stable

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
| TICKET-007 | Media tab Outs panel + highlight reorganization | Outs & Strikeouts panel added to PitcherCard (collapsed by default). Filter: `player_id` match + exclude `highlight-reel-starting-pitching` (taxonomy:pitching rule dropped — absent on individual clips). All highlight sections collapsed by default. Game line highlighted (bright pills, pitch count first), season stats separated by divider, plain pills. |
| TICKET-MEDIA001 | Media tab — game pitch count missing | ESPN `PC-ST` label (e.g. `"94-62"`) parsed into P + S. Fallback handles `PC` and `#P` label variants. P / STR / S% now appear first in the game line row. |
| TICKET-PITCHER001 | Pitcher line in ParlaysTab hard to read | Restyled all 3 pitcher spots (game browser, slip legs, Lay section) as a compact navy pill (`#0d1a2a` bg, `#1a3a5a` border, `#7ab8e8` name text). |
| TICKET-LOGO001-PARTIAL | Team logos added to all tabs (GamesTab, LockTab, ParlaysTab, DogTab, LiveTab, MediaTab) via shared `teamLogos.js` helper. Logo ID coverage incomplete — see TICKET-LOGO001 for remaining work. | ✅ Partial |
| TICKET-MEDIA002 | MediaTab lineup missing players (Yordan etc.) after refresh — `fetchMlbLineup` was using `/game/boxscore` (only players who batted). Fixed to use `/schedule?hydrate=lineups` for confirmed pre-game lineup. Merge logic also fixed to preserve ESPN live stats on all matched players. | ✅ Fixed |
| TICKET-PARLAYS001 | All parlay nav sections were open by default — changed Double Lock and Predictions `defaultOpen` to `false`. All sections now collapsed on load. | ✅ Fixed |
| TICKET-LIVE002 | Live tab odds refresh interval was 30 minutes — reduced to 5 minutes for timelier updates. | ✅ Fixed |
| TICKET-DOG002 | DogTab pick result not updating when parlay already graded — resolve loop now first syncs from `predictions` data before hitting ESPN. | ✅ Fixed |
