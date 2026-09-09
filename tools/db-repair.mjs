#!/usr/bin/env node
// db-repair.mjs — fixes the 4 dbcheck failures as of 2026-04-03
//
// Issues:
//   1. props_unique index missing from live DB (schema defines it, was never applied)
//   2. 2099-01-01 f5 pick — bogus future-dated row
//   3. parlays count: DB has 33, savedata.json has 30 → 3 extra rows
//   4. parlay_legs count: DB has 229, savedata.json has 227 → 2 extra legs
//
// Usage:
//   node db-repair.mjs
//   node db-repair.mjs --dry-run    (show what would be done, no writes)

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH   = path.join(__dirname, 'db', 'betonme.db')
const SAVE_PATH = path.join(__dirname, 'savedata.json')

const DRY_RUN = process.argv.includes('--dry-run')

const RESET  = '\x1b[0m'
const GREEN  = '\x1b[32m'
const RED    = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN   = '\x1b[36m'
const BOLD   = '\x1b[1m'

function ok(msg)   { console.log(`  ${GREEN}✓${RESET} ${msg}`) }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`) }
function info(msg) { console.log(`  ${CYAN}→${RESET} ${msg}`) }
function hdr(msg)  { console.log(`\n${CYAN}── ${msg} ${'─'.repeat(Math.max(0, 50 - msg.length))}${RESET}`) }

if (!fs.existsSync(DB_PATH)) { fail(`DB not found: ${DB_PATH}`); process.exit(1) }
const raw = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8'))

const db = new Database(DB_PATH)
db.pragma('foreign_keys = ON')
db.pragma('journal_mode = WAL')

if (DRY_RUN) console.log(`\n${YELLOW}${BOLD}DRY RUN — no changes will be written${RESET}`)

// ── 1. props_unique index ─────────────────────────────────────────────────────
hdr('FIX 1 — props_unique index')

const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='props_unique'").get()
if (existing) {
  ok('props_unique already exists — skipping')
} else {
  // Check for any duplicates first — index will fail if dupes exist
  const dupes = db.prepare(`
    SELECT date, player, market_key, side, COUNT(*) as c
    FROM props GROUP BY date, player, market_key, side HAVING c > 1
  `).all()

  if (dupes.length > 0) {
    fail(`Cannot create index — ${dupes.length} duplicate prop rows found:`)
    dupes.forEach(d => console.log(`    ${d.date} ${d.player} ${d.market_key} ${d.side} × ${d.c}`))
    fail('Fix duplicates manually first, then re-run this script')
    process.exit(1)
  }

  info('No prop duplicates — safe to create index')
  if (!DRY_RUN) {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS props_unique ON props(date, player, market_key, side)`)
    ok('props_unique created')
  } else {
    ok('[DRY] Would create: CREATE UNIQUE INDEX props_unique ON props(date, player, market_key, side)')
  }
}

// ── 2. Future-dated f5 pick (2099-01-01) ─────────────────────────────────────
hdr('FIX 2 — bogus future-dated picks')

const futurePicks = db.prepare("SELECT id, date, type, sport, team FROM picks WHERE date > '2027-01-01'").all()
if (futurePicks.length === 0) {
  ok('No future-dated picks found')
} else {
  futurePicks.forEach(r => {
    info(`Will delete: id=${r.id} date=${r.date} type=${r.type} sport=${r.sport} team=${r.team ?? '—'}`)
  })
  if (!DRY_RUN) {
    const del = db.prepare("DELETE FROM picks WHERE date > '2027-01-01'")
    const result = del.run()
    ok(`Deleted ${result.changes} future-dated pick(s)`)
  } else {
    ok(`[DRY] Would delete ${futurePicks.length} future-dated pick(s)`)
  }
}

// ── 3+4. Parlay / leg count mismatch ─────────────────────────────────────────
hdr('FIX 3+4 — parlay + leg count mismatch')

// Build expected set from savedata.json
const expectedParlays = new Set()
for (const key of ['lay', 'predictions', 'allIn']) {
  const typeMap = { lay: 'lay', predictions: 'prediction', allIn: 'allin' }
  for (const date of Object.keys(raw[key] ?? {})) {
    expectedParlays.add(`${typeMap[key]}:${date}`)
  }
}
info(`savedata.json expects ${expectedParlays.size} parlays`)

const dbParlays = db.prepare("SELECT id, date, type FROM parlays ORDER BY date, type").all()
info(`DB has ${dbParlays.length} parlays`)

const orphans = dbParlays.filter(p => !expectedParlays.has(`${p.type}:${p.date}`))

if (orphans.length === 0) {
  ok('No orphan parlays found — counts match or difference is benign')
} else {
  orphans.forEach(p => {
    const legCount = db.prepare("SELECT COUNT(*) as c FROM parlay_legs WHERE parlay_id=?").get(p.id).c
    info(`Will delete orphan: id=${p.id} type=${p.type} date=${p.date} (${legCount} legs)`)
  })
  if (!DRY_RUN) {
    const ids = orphans.map(p => p.id)
    // ON DELETE CASCADE will remove legs too
    const del = db.prepare(`DELETE FROM parlays WHERE id IN (${ids.map(() => '?').join(',')})`)
    const result = del.run(...ids)
    ok(`Deleted ${result.changes} orphan parlay(s) (legs cascade-deleted)`)
  } else {
    ok(`[DRY] Would delete ${orphans.length} orphan parlay(s) (legs cascade-deleted)`)
  }
}

// ── Final verification ────────────────────────────────────────────────────────
hdr('VERIFICATION')

const pickCount    = db.prepare("SELECT COUNT(*) as c FROM picks").get().c
const parlayCount  = db.prepare("SELECT COUNT(*) as c FROM parlays").get().c
const legCount     = db.prepare("SELECT COUNT(*) as c FROM parlay_legs").get().c
const propCount    = db.prepare("SELECT COUNT(*) as c FROM props").get().c
const idxCheck     = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='props_unique'").get()
const futureCheck  = db.prepare("SELECT COUNT(*) as c FROM picks WHERE date > '2027-01-01'").get().c

console.log(`  picks:        ${BOLD}${pickCount}${RESET}`)
console.log(`  parlays:      ${BOLD}${parlayCount}${RESET}  (savedata: ${expectedParlays.size})`)
console.log(`  parlay_legs:  ${BOLD}${legCount}${RESET}`)
console.log(`  props:        ${BOLD}${propCount}${RESET}`)
console.log(`  props_unique: ${BOLD}${idxCheck ? 'EXISTS' : 'MISSING'}${RESET}`)
console.log(`  future picks: ${BOLD}${futureCheck}${RESET}`)

if (!DRY_RUN) {
  console.log(`\n${GREEN}${BOLD}✅ Repair complete. Run: node dbcheck.mjs${RESET}`)
} else {
  console.log(`\n${YELLOW}${BOLD}DRY RUN complete. Re-run without --dry-run to apply.${RESET}`)
}

db.close()
