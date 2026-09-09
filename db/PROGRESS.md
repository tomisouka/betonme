# BetOnMe — Database Migration Progress
**Last updated: 2026-04-03**

---

## ✅ COMPLETE — All phases done as of 2026-04-03

---

## Phase 0 — Setup ✅
- [x] Install better-sqlite3
- [x] Compile native binary against Node 24
- [x] Create db/ directory
- [x] Write schema.sql (7 tables)
- [x] Run schema — betonme_dev.db created and verified

---

## Phase 1 — Migration Script ✅
- [x] Create db/migrate.js
- [x] Migrate app_state (coins, streak, streakDates, loginDates)
- [x] Migrate prefs (hateTeam_MLB, favTeam_MLB)
- [x] Migrate all pick types: lock, dog, superdog, ou, hate, fav, f5
- [x] Migrate parlays + legs: lay, prediction, allin
- [x] Migrate props

---

## Phase 2 — Verification ✅
- [x] Row counts match savedata.json
- [x] Spot check lock picks (all 16 confirmed)
- [x] Spot check parlays
- [x] Spot check props
- [x] Prefs verified (favTeam_MLB=Houston Astros confirmed after TEST value bug fix)

---

## Phase 3 — API Refactor ✅
- [x] USE_DB flag in server.js + database.js
- [x] GET /data → readFromDb()
- [x] PUT /appstate — upserts coins, streak, login dates, lock picks
- [x] PUT /picks/:type/:date — upserts individual picks (dog, hate, fav, superdog, ou, f5)
- [x] PUT /parlays/:type/:date — upserts parlay + legs
- [x] PUT /props/:date — upserts props
- [x] PUT /prefs — upserts prefs
- [x] DELETE /picks/:type/:date
- [x] GET /export → readFromDb() (not savedata.json)
- [x] POST /resolve — server-side ESPN resolution direct to DB
- [x] results.py rewritten to read/write DB only
- [x] useSaveData.js — all saves use targeted PUT endpoints, no write queue

---

## Phase 4 — Backup System ✅
- [x] db/backup.sh — daily SQLite backup
- [x] 7-day rotation
- [x] Cron at 2am confirmed
- [x] db/backups/betonme.YYYY-MM-DD.db verified

---

## Phase 5 — Cutover ✅ — 2026-04-03
- [x] Final migration into betonme.db with SF Giants W (Apr 2) patched in
- [x] USE_DB=true in .env
- [x] Smoke tested: coins=264.87, streak=6W, all picks intact
- [x] results.py confirmed writing to DB
- [x] savedata.json and all backups retired via retire-savedata.sh (11 files)
- [x] export button renamed betonme-export.json
- [x] favTeam_MLB=Houston Astros confirmed (was TEST — fixed)
- [x] Zero references to savedata.json in active source code

---

## Phase 6 — Machine Migration (IdeaPad)
- [ ] Install Node + pnpm on IdeaPad
- [ ] Sync project via Syncthing or git
- [ ] Run pnpm install + node-gyp rebuild on IdeaPad
- [ ] Copy betonme.db to IdeaPad
- [ ] Update .env on IdeaPad — USE_DB=true, correct DB_FILE
- [ ] Set up backup cron on IdeaPad
- [ ] Test app runs from IdeaPad
- [ ] Point frontend API URL at IdeaPad Tailscale IP
- [ ] Both machines hitting IdeaPad DB over Tailscale
- [ ] Syncthing handles code only — data is IdeaPad's job

---

## Notes

### Restore from backup
1. Stop the server
2. `cp db/backups/betonme.YYYY-MM-DD.db db/betonme.db`
3. `./startbetonme.sh`

### Emergency rollback to JSON
1. `mv savedata.json.retired savedata.json`
2. `sed -i 's/USE_DB=true/USE_DB=false/' .env`
3. Restart server
