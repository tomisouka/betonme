#!/usr/bin/env node
// dbcheck.mjs — BetOnMe DB health check
// Usage: node dbcheck.mjs
// Run from project root: node dbcheck.mjs

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, 'db', 'betonme.db')
const SAVE_PATH = path.join(__dirname, 'savedata.json')

const RESET  = '\x1b[0m'
const GREEN  = '\x1b[32m'
const RED    = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN   = '\x1b[36m'
const DIM    = '\x1b[2m'
const BOLD   = '\x1b[1m'

function ok(msg)   { console.log(`  ${GREEN}✓${RESET} ${msg}`) }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`) }
function warn(msg) { console.log(`  ${YELLOW}!${RESET} ${msg}`) }
function hdr(msg)  { console.log(`\n${CYAN}── ${msg} ${DIM}${'─'.repeat(Math.max(0, 50 - msg.length))}${RESET}`) }

let passed = 0
let failed = 0
let warnings = 0

function check(label, actual, expected) {
  if (actual === expected) { ok(`${label}: ${BOLD}${actual}${RESET}`); passed++ }
  else { fail(`${label}: got ${BOLD}${actual}${RESET}, expected ${BOLD}${expected}${RESET}`); failed++ }
}

function checkGte(label, actual, min) {
  if (actual >= min) { ok(`${label}: ${BOLD}${actual}${RESET} (>= ${min})`); passed++ }
  else { fail(`${label}: got ${BOLD}${actual}${RESET}, expected >= ${BOLD}${min}${RESET}`); failed++ }
}

// ── Open DB ───────────────────────────────────────────────────────────────────
if (!fs.existsSync(DB_PATH)) {
  fail(`DB not found at ${DB_PATH}`)
  process.exit(1)
}
const db = new Database(DB_PATH, { readonly: true })

// ── Load savedata.json for comparison ─────────────────────────────────────────
let raw = null
if (fs.existsSync(SAVE_PATH)) {
  try { raw = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8')) } catch {}
}

// ── 1. ROW COUNTS ─────────────────────────────────────────────────────────────
hdr('ROW COUNTS')

const counts = {}
for (const t of ['app_state','prefs','picks','parlays','parlay_legs','props']) {
  counts[t] = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c
  console.log(`  ${t.padEnd(16)} ${BOLD}${counts[t]}${RESET}`)
}

// ── 2. PICKS BY TYPE ──────────────────────────────────────────────────────────
hdr('PICKS BY TYPE')

const EXPECTED_TYPES = ['lock','dog','superdog','ou','hate','fav','f5']
const typeRows = db.prepare("SELECT type, COUNT(*) as c FROM picks GROUP BY type ORDER BY type").all()
const typeMap = {}
typeRows.forEach(r => typeMap[r.type] = r.c)

for (const t of EXPECTED_TYPES) {
  const c = typeMap[t] ?? 0
  console.log(`  ${t.padEnd(12)} ${BOLD}${c}${RESET}`)
}

// Compare to savedata.json if available
if (raw) {
  hdr('SAVEDATA COMPARISON')
  const lockCount     = Object.keys(raw.app?.picks ?? {}).length
  const dogCount      = Object.keys(raw.dog?.picks ?? {}).length
  const superdogCount = Object.keys(raw.superdog?.picks ?? {}).length
  const ouCount       = Object.keys(raw.ouPick ?? {}).length
  const hateCount     = Object.keys(raw.hatePick ?? {}).length
  const favCount      = Object.keys(raw.favPick ?? {}).length
  let f5Count = 0
  for (const sports of Object.values(raw.f5 ?? {}))
    for (const s of Object.keys(sports)) if (s !== '_locked') f5Count++

  check('picks (lock)',     typeMap.lock     ?? 0, lockCount)
  check('picks (dog)',      typeMap.dog      ?? 0, dogCount)
  check('picks (superdog)', typeMap.superdog ?? 0, superdogCount)
  check('picks (ou)',       typeMap.ou       ?? 0, ouCount)
  check('picks (hate)',     typeMap.hate     ?? 0, hateCount)
  check('picks (fav)',      typeMap.fav      ?? 0, favCount)
  check('picks (f5)',       typeMap.f5       ?? 0, f5Count)

  let parlayCount = 0, legCount = 0
  for (const key of ['lay','predictions','allIn']) {
    const byDate = raw[key] ?? {}
    parlayCount += Object.keys(byDate).length
    for (const p of Object.values(byDate)) legCount += (p.legs ?? []).length
  }
  check('parlays',     counts.parlays,     parlayCount)
  check('parlay_legs', counts.parlay_legs, legCount)

  const propCount = Object.values(raw.propPick ?? {}).reduce((s, d) => s + Object.keys(d).length, 0)
  checkGte('props (>= savedata)', counts.props, propCount)
}

// ── 3. DUPLICATE CHECK ────────────────────────────────────────────────────────
hdr('DUPLICATE CHECK')

const dupPicks = db.prepare(`
  SELECT date, type, sport, COUNT(*) as c
  FROM picks GROUP BY date, type, sport HAVING c > 1
`).all()
if (dupPicks.length === 0) { ok('No duplicate picks'); passed++ }
else {
  fail(`${dupPicks.length} duplicate pick groups found:`)
  dupPicks.slice(0, 5).forEach(r => console.log(`    ${r.date} ${r.type} ${r.sport} × ${r.c}`))
  failed++
}

const dupProps = db.prepare(`
  SELECT date, player, market_key, side, COUNT(*) as c
  FROM props GROUP BY date, player, market_key, side HAVING c > 1
`).all()
if (dupProps.length === 0) { ok('No duplicate props'); passed++ }
else {
  fail(`${dupProps.length} duplicate prop groups found:`)
  dupProps.slice(0, 5).forEach(r => console.log(`    ${r.date} ${r.player} ${r.market_key} ${r.side} × ${r.c}`))
  failed++
}

// ── 4. INDEXES ────────────────────────────────────────────────────────────────
hdr('INDEXES')

const indexes = db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all()
const idxNames = indexes.map(i => i.name)

for (const [name, table] of [['picks_unique','picks'],['props_unique','props']]) {
  if (idxNames.includes(name)) { ok(`${name} on ${table}`); passed++ }
  else { fail(`MISSING: ${name} on ${table} — duplicates will accumulate`); failed++ }
}

// ── 5. APP STATE ──────────────────────────────────────────────────────────────
hdr('APP STATE')

const state = db.prepare("SELECT coins, last_coin_date, streak, streak_dates, login_dates FROM app_state WHERE id=1").get()
if (state) {
  console.log(`  coins          ${BOLD}${state.coins}${RESET}`)
  console.log(`  last_coin_date ${BOLD}${state.last_coin_date ?? 'null'}${RESET}`)
  try {
    const streak = JSON.parse(state.streak)
    const recent = streak.slice(-10).join(' ')
    console.log(`  streak (last 10) ${BOLD}${recent || '(empty)'}${RESET}`)
  } catch {}
  try {
    const logins = JSON.parse(state.login_dates)
    console.log(`  login_dates    ${BOLD}${logins.length} recorded, last: ${logins[logins.length-1] ?? 'none'}${RESET}`)
  } catch {}
  ok('app_state row present'); passed++
} else {
  fail('app_state row missing'); failed++
}

// ── 6. PREFS ──────────────────────────────────────────────────────────────────
hdr('PREFS')

const prefs = db.prepare("SELECT key, value FROM prefs").all()
prefs.forEach(p => console.log(`  ${p.key.padEnd(20)} ${BOLD}${p.value}${RESET}`))
if (prefs.length > 0) { ok(`${prefs.length} prefs loaded`); passed++ }
else { warn('No prefs found'); warnings++ }

// ── 7. LATEST PICKS ───────────────────────────────────────────────────────────
hdr('LATEST PICKS (last 5)')

const latestPicks = db.prepare("SELECT date, type, team, odds, result FROM picks ORDER BY date DESC, id DESC LIMIT 5").all()
latestPicks.forEach(r => {
  const result = r.result ? (r.result === 'W' ? `${GREEN}W${RESET}` : `${RED}L${RESET}`) : `${YELLOW}pending${RESET}`
  console.log(`  ${r.date}  ${r.type.padEnd(10)} ${(r.team||'—').padEnd(28)} ${r.odds != null ? String(r.odds).padStart(5) : '  —  '}  ${result}`)
})

// ── 8. LATEST PROPS ───────────────────────────────────────────────────────────
hdr('LATEST PROPS (last 5)')

const latestProps = db.prepare("SELECT date, player, market_key, side, line, result FROM props ORDER BY date DESC, id DESC LIMIT 5").all()
latestProps.forEach(r => {
  const result = r.result ? (r.result === 'W' ? `${GREEN}W${RESET}` : `${RED}L${RESET}`) : `${YELLOW}pending${RESET}`
  console.log(`  ${r.date}  ${r.player.padEnd(22)} ${r.side.padEnd(6)} ${String(r.line).padStart(4)}  ${result}`)
})

// ── 9. PENDING RESULTS ────────────────────────────────────────────────────────
hdr('PENDING RESULTS (unresolved picks)')

const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

const pendingOld = db.prepare(`
  SELECT type, date, team FROM picks
  WHERE result IS NULL AND date < ?
  ORDER BY date DESC LIMIT 10
`).all(yesterday)

if (pendingOld.length === 0) {
  ok('No unresolved picks older than yesterday')
  passed++
} else {
  warn(`${pendingOld.length} picks older than yesterday still pending:`)
  pendingOld.forEach(r => console.log(`    ${r.date} ${r.type} ${r.team ?? '—'}`))
  warnings++
}

const pendingProps = db.prepare(`
  SELECT date, player, market_key FROM props
  WHERE result IS NULL AND date < ?
  ORDER BY date DESC LIMIT 10
`).all(yesterday)

if (pendingProps.length === 0) {
  ok('No unresolved props older than yesterday')
  passed++
} else {
  warn(`${pendingProps.length} props older than yesterday still pending:`)
  pendingProps.forEach(r => console.log(`    ${r.date} ${r.player} ${r.market_key}`))
  warnings++
}

// ── 10. DB FILE INFO ──────────────────────────────────────────────────────────
hdr('DB FILE')

const stat = fs.statSync(DB_PATH)
const kb = (stat.size / 1024).toFixed(1)
console.log(`  path     ${DIM}${DB_PATH}${RESET}`)
console.log(`  size     ${BOLD}${kb} KB${RESET}`)
console.log(`  modified ${BOLD}${stat.mtime.toLocaleString()}${RESET}`)

const backupDir = path.join(__dirname, 'db', 'backups')
if (fs.existsSync(backupDir)) {
  const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).sort()
  if (backups.length > 0) {
    ok(`${backups.length} backup(s) — latest: ${backups[backups.length - 1]}`)
    passed++
  } else {
    warn('No backups found in db/backups/')
    warnings++
  }
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(54)}`)
console.log(`  ${GREEN}${passed} passed${RESET}  |  ${warnings > 0 ? YELLOW : DIM}${warnings} warnings${RESET}  |  ${failed > 0 ? RED : DIM}${failed} failed${RESET}`)

if (failed === 0 && warnings === 0) {
  console.log(`  ${GREEN}${BOLD}✅ DB is clean${RESET}\n`)
} else if (failed === 0) {
  console.log(`  ${YELLOW}${BOLD}⚠️  DB is OK but check warnings${RESET}\n`)
} else {
  console.log(`  ${RED}${BOLD}❌ Issues found — do not proceed${RESET}\n`)
  process.exit(1)
}

db.close()
