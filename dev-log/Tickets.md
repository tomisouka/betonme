# BetOnMe — Tickets

All known bugs, broken features, and planned work in one place.
Status: 🔴 Broken · 🟡 Incomplete · 🟢 Works but needs improvement · ⬜ Planned

---

## 🔴 Broken

### TICKET-T001 · Tauri app has no memory (server not bundled)
**Status:** 🔴 Broken  
**What's wrong:** The Tauri .deb installs the React frontend but `server.js` is not bundled. All app data lives in `savedata.json` served by Express on port 3001. When the .deb app launches, it shows "Server offline" — blank app with no data.  
**Recommended fix:** Bundle server.js to `/usr/share/betonme/server.js` via tauri.conf.json resources, update `lib.rs` `find_server_dir()` to check that path, ensure node is a deb dependency.  
**Effort:** Medium · Deferred

---

## 🟡 Incomplete

### TICKET-007 · Media tab not built
**Tab:** Media  
**What's wrong:** Tab exists but has no real content — just placeholder text.  
**Intended fix:** Discord webhook (post pick on lock, update on result), Twitter/X embed  
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
**Effort:** Small (data collection) · Do tomorrow

---

## 🟢 Works but needs improvement

### TICKET-001 · Live tab chart — needs more snapshots
**Tab:** Live  
**What's wrong:** DK scraper now runs every 30 minutes and logs odds history, but chart only shows one dot until enough snapshots accumulate throughout the day.  
**Status:** Working as designed — will improve naturally as scraper runs.

---

## ⬜ Planned

### TICKET-018 · NBA player props
**Tab:** Props  
**Description:** NBA now has game lines wired via dk_scraper. Need to find NBA player prop subcategoryIds (points O/U, rebounds O/U, assists O/U) from DevTools on DK NBA props page.  
**Effort:** Small (same DevTools process as MLB)

### TICKET-019 · Scraper result — show last run time in UI
**Tab:** App header  
**Description:** Refresh button shows "Updated X:XX PM" but only after manual refresh. Should also show when the systemd watch-mode scraper last ran (read from dk_odds.json fetchedAt field).  
**Effort:** Small

---

## ✅ Resolved (for reference)

| Ticket | Description | Fixed |
|--------|-------------|-------|
| — | Race condition on startup — saves stomping each other | Write queue in `useSaveData.js` |
| — | CORS blocking data load when Vite bumps to port 5175 | Dynamic origin regex in `server.js` |
| — | LockTab loading stale data due to parallel init + resolve | Sequential init, pass state through |
| — | Dog tab accessible before lock set | Lock gate added to DogTab |
| — | Dog auto-set not triggering | `[todayLock]` dependency on useEffect |
| TICKET-001 | Live tab broken (no live odds) | Replaced with DK odds movement chart — line history tracked every 30min |
| TICKET-002 | Live scores missing from badge | ESPN scores wired into game cards |
| TICKET-003 | Dog leg ordering | Was already working — rank sort in lockLay/lockPredictions |
| TICKET-004 | Dog auto-tag | Was already working — game.id === dogGameId check |
| TICKET-005 | Per-leg odds missing from locked Lay slip | Added odds display to locked lay legs |
| TICKET-006 | Yesterday prediction card | Was already built in ParlaysTab |
| TICKET-008 | Dog threshold was >0 | Raised to >=150 |
| TICKET-012 | Only one rolling backup | Daily timestamped backups in savedata-backups/, 7-day retention |
| TICKET-013 | No /import endpoint | POST /import + GET /backups/:filename added |
| TICKET-014 | Errors lost on restart | Append-only server.log with timestamps |
| TICKET-015 | No schema version | _version: 1 stamped on every write, migrateSchema() on every read |
| TICKET-015b | Prop options — pitcher strikeouts, outs | DK scraper pulls 15221 (Ks O/U) + 17413 (Outs O/U) free |
| TICKET-016 | Tauri wrapper | src-tauri/ scaffolded, build-deb.sh + systemd service provided |
| TICKET-017 | Pitchers shown in separate row | MLB game cards: pitchers aligned under each team name |
| T-002 | Games tab on the-odds-api | Migrated to ESPN (free, unlimited, live scores) |
| — | App.jsx was 3,051 lines | Split into per-tab components |
| — | localStorage used for persistent data | Migrated to `savedata.json` via Express |
| — | NBA game lines missing | DK scraper subcategoryId 4511 wired for NBA |
| — | MLB game lines on the-odds-api | DK scraper subcategoryId 4519 — free, unlimited |
| — | Props sneak peek showing game lines | Fixed to show actual DK pitcher props (Ks O/U + Outs O/U) |
| — | Games tab date bucketing UTC bug | Fixed to use local date strings — today's games now show correctly |
| — | Games tab sort broken | All games sorted chronologically by commence_time |
| — | Finals cluttering active game list | Completed games moved to collapsed ✓ FINAL section |
| — | Live tab only showed today | Now shows last 2 days — yesterday's lock + dog highlighted |
| — | Live tab dog not highlighted | Dog of the day highlighted orange, sorts second after lock |
