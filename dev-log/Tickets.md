# BetOnMe — Tickets

All known bugs, broken features, and planned work in one place.
Status: 🔴 Broken · 🟡 Incomplete · 🟢 Works but needs improvement · ⬜ Planned

---

## 🔴 Broken

### TICKET-001 · Live Tab — odds fetch broken
**Tab:** Live
**What's wrong:** The Live tab re-fetches from the-odds-api which returns the same
cached pre-game lines, not in-play odds. The free tier of the-odds-api does not
include live/in-play markets. Greyed-out lines show but never update.
**Intended fix:** Investigate `/v4/sports/{sport}/events/{eventId}/odds` with
`markets=h2h` — may return live lines on paid tier. Alternative: replace with
ESPN live scoreboard data and drop odds display for in-progress games entirely.
**Effort:** Medium

---

## 🟡 Incomplete

### TICKET-002 · Game cards missing live scores
**Tab:** Games, Lock
**What's wrong:** ESPN status badges show (e.g. "🔴 LIVE · Q3 8:42") but the actual
score is not displayed. The ESPN scoreboard response already contains
`competitors[].score` — it's being fetched but not rendered.
**Intended fix:** Wire score into the badge: "🔴 Q3 8:42 · LAL 87 – BOS 91"
**Effort:** Small — data already available, just needs wiring into the badge render

### TICKET-003 · Dog leg ordering in Predictions
**Tab:** Parlays
**What's wrong:** Dog of the day leg can appear in any position in the predictions
slip. It should always be leg 2 (after the lock leg).
**Intended fix:** Sort legs on render: lock first, dog second, rest by order added.
**Effort:** Small

### TICKET-004 · Dog auto-tag in Predictions
**Tab:** Parlays
**What's wrong:** If you pick a dog and then build a predictions slip the same day,
the dog leg doesn't get tagged as `isDog: true` automatically unless you re-lock
the predictions.
**Intended fix:** When building predictions slip, check if any leg matches today's
dog pick and auto-set `isDog: true`.
**Effort:** Small

### TICKET-005 · Individual leg odds missing from Lay slip
**Tab:** Parlays
**What's wrong:** The locked lay slip shows team name and result emoji but no
per-leg odds. Can't see which leg had the most value.
**Intended fix:** Store odds per leg when locking the lay, display alongside each
leg in the slip.
**Effort:** Small-Medium (needs schema addition + render)

### TICKET-006 · Yesterday tab in Predictions
**Tab:** Parlays
**What's wrong:** No way to see yesterday's prediction slip inside the Predictions
section. Only the current day loads by default.
**Intended fix:** Add a "Yesterday" card above today's slip that loads
`predictions[yesterdayKey]` and renders it as a read-only slip.
**Effort:** Small

### TICKET-007 · Media tab not built
**Tab:** Media
**What's wrong:** Tab exists but has no real content — just placeholder text.
**Intended fix:**
- Discord integration: post picks to a #picks channel via webhook on lock;
  app fetches and displays as a live feed (Discord bot, free)
- Twitter/X: dedicated account posts pick daily, paste URL into dev panel
  to render via Twitter embed script (free, manual)
**Effort:** Large

---

## 🟢 Works but needs improvement

### TICKET-008 · Dog definition threshold
**Tab:** Dogs
**What's wrong:** Any team with ML odds > 0 shows up as a dog. This includes
near-even +101 coin-flip games that aren't real underdogs.
**Intended fix:** Add a configurable minimum threshold (suggested: +150) so only
meaningful underdogs appear. Could be a dev panel setting.
**Effort:** Small

### TICKET-009 · Game card 7-day team records
**Tab:** Games
**What's wrong:** No historical win/loss context on game cards. Hard to know if
a team is hot or cold at a glance.
**Intended fix:** Show each team's last 7-day ML and spread record per card.
Needs historical results API — candidates: SportsDataIO, ActionNetwork, paid
the-odds-api tier.
**Effort:** Large (needs external API + paid tier)

### TICKET-010 · Dog tab 7-day underdog record
**Tab:** Dogs
**What's wrong:** No historical straight-up win rate shown per underdog.
**Intended fix:** Same as TICKET-009 — pull team record from historical results API.
**Effort:** Large (same dependency)

### TICKET-011 · Props player team color split unreliable
**Tab:** Props
**What's wrong:** Player-to-team assignment uses a heuristic name split which
breaks on some matchups. Colors don't reliably match favorite/dog side.
**Intended fix:** Real roster API to map player → team accurately.
**Effort:** Medium (needs roster API)

---

## ⬜ Planned (Server / Infrastructure)

### TICKET-012 · Timestamped backup rotation
**Where:** server.js
**Description:** Currently only one rolling backup exists (`savedata.backup.json`).
If you save twice you lose the older snapshot. Need `node-cron` to write
timestamped backups (e.g. `savedata.2026-03-08.json`) and keep 7 days.
**Effort:** Small

### TICKET-013 · POST /import endpoint
**Where:** server.js
**Description:** `/restore-backup` exists but only restores the single rolling
backup. Need `POST /import` that accepts any JSON upload and overwrites
`savedata.json` — enables restoring from any timestamped backup.
**Effort:** Small

### TICKET-014 · Server error logging
**Where:** server.js
**Description:** Errors currently go to `console.error` only and are lost when
the process restarts. Need an append-only `server.log` with timestamps.
**Effort:** Small

### TICKET-015 · Versioned savedata schema
**Where:** savedata.json + server.js
**Description:** No `_version` field. Future schema changes have no migration path.
Add `_version: 1` now and a server-side upgrade function for when schema changes.
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
| — | App.jsx was 3,051 lines | Split into per-tab components |
| — | localStorage used for persistent data | Migrated to `savedata.json` via Express |