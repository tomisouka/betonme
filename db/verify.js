// db/verify.js
// Verification script — confirms migration data matches savedata.json
// READ ONLY on both files — never modifies anything

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'savedata.json'), 'utf8'))
const db  = new Database(path.join(__dirname, 'betonme.db'), { readonly: true })

let passed = 0
let failed = 0

function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}: ${actual}`)
    passed++
  } else {
    console.error(`  ✗ ${label}: got ${actual}, expected ${expected}`)
    failed++
  }
}

console.log('\n── ROW COUNTS ──────────────────────────────────────────────')

// app_state
check('app_state rows', db.prepare('SELECT COUNT(*) as n FROM app_state').get().n, 1)

// prefs
const prefCount = Object.keys(raw.prefs ?? {}).length
check('prefs rows', db.prepare('SELECT COUNT(*) as n FROM prefs').get().n, prefCount)

// picks by type
const lockCount     = Object.keys(raw.app?.picks ?? {}).length
const dogCount      = Object.keys(raw.dog?.picks ?? {}).length
const superdogCount = Object.keys(raw.superdog?.picks ?? {}).length
const ouCount       = Object.keys(raw.ouPick ?? {}).length
const hateCount     = Object.keys(raw.hatePick ?? {}).length
const favCount      = Object.keys(raw.favPick ?? {}).length

let f5Count = 0
for (const [, sports] of Object.entries(raw.f5 ?? {})) {
  for (const sport of Object.keys(sports)) {
    if (sport !== '_locked') f5Count++
  }
}

const totalPicks = lockCount + dogCount + superdogCount + ouCount + hateCount + favCount + f5Count

check('picks (lock)',     db.prepare("SELECT COUNT(*) as n FROM picks WHERE type='lock'").get().n,     lockCount)
check('picks (dog)',      db.prepare("SELECT COUNT(*) as n FROM picks WHERE type='dog'").get().n,      dogCount)
check('picks (superdog)', db.prepare("SELECT COUNT(*) as n FROM picks WHERE type='superdog'").get().n, superdogCount)
check('picks (ou)',       db.prepare("SELECT COUNT(*) as n FROM picks WHERE type='ou'").get().n,       ouCount)
check('picks (hate)',     db.prepare("SELECT COUNT(*) as n FROM picks WHERE type='hate'").get().n,     hateCount)
check('picks (fav)',      db.prepare("SELECT COUNT(*) as n FROM picks WHERE type='fav'").get().n,      favCount)
check('picks (f5)',       db.prepare("SELECT COUNT(*) as n FROM picks WHERE type='f5'").get().n,       f5Count)
check('picks (total)',    db.prepare('SELECT COUNT(*) as n FROM picks').get().n,                       totalPicks)

// parlays
let parlayCount = 0
let legCount    = 0
for (const key of ['lay', 'predictions', 'allIn']) {
  const byDate = raw[key] ?? {}
  parlayCount += Object.keys(byDate).length
  for (const parlay of Object.values(byDate)) {
    legCount += (parlay.legs ?? []).length
  }
}
check('parlays',     db.prepare('SELECT COUNT(*) as n FROM parlays').get().n,     parlayCount)
check('parlay_legs', db.prepare('SELECT COUNT(*) as n FROM parlay_legs').get().n, legCount)

// props
let propCount = 0
for (const props of Object.values(raw.propPick ?? {})) {
  propCount += Object.keys(props).length
}
check('props (>= savedata)', db.prepare('SELECT COUNT(*) as n FROM props').get().n >= propCount, true)

console.log('\n── SPOT CHECKS ─────────────────────────────────────────────')

// Spot check 1: coins match
const dbCoins  = db.prepare('SELECT coins FROM app_state WHERE id=1').get().coins
const rawCoins = raw.app?.coins ?? 0
check('coins match', dbCoins, rawCoins)

// Spot check 2: prefs match
const dbHate  = db.prepare("SELECT value FROM prefs WHERE key='hateTeam_MLB'").get()?.value
const rawHate = raw.prefs?.hateTeam_MLB
check('hateTeam_MLB', dbHate, rawHate)

const dbFav  = db.prepare("SELECT value FROM prefs WHERE key='favTeam_MLB'").get()?.value
const rawFav = raw.prefs?.favTeam_MLB
check('favTeam_MLB', dbFav, rawFav)

// Spot check 3: first lock pick
const firstLockDate = Object.keys(raw.app?.picks ?? {})[0]
if (firstLockDate) {
  const rawLock = raw.app.picks[firstLockDate]
  const dbLock  = db.prepare("SELECT * FROM picks WHERE type='lock' AND date=?").get(firstLockDate)
  check(`lock pick date ${firstLockDate} — team`,   dbLock?.team,    rawLock?.team)
  check(`lock pick date ${firstLockDate} — odds`,   dbLock?.odds,    rawLock?.odds)
  check(`lock pick date ${firstLockDate} — result`, dbLock?.result,  rawLock?.result)
}

// Spot check 4: first dog pick
const firstDogDate = Object.keys(raw.dog?.picks ?? {})[0]
if (firstDogDate) {
  const rawDog = raw.dog.picks[firstDogDate]
  const dbDog  = db.prepare("SELECT * FROM picks WHERE type='dog' AND date=?").get(firstDogDate)
  check(`dog pick date ${firstDogDate} — team`,   dbDog?.team,   rawDog?.team)
  check(`dog pick date ${firstDogDate} — odds`,   dbDog?.odds,   rawDog?.odds)
  check(`dog pick date ${firstDogDate} — result`, dbDog?.result, rawDog?.result)
}

// Spot check 5: first parlay leg count
const firstLayDate = Object.keys(raw.lay ?? {})[0]
if (firstLayDate) {
  const rawLegCount = (raw.lay[firstLayDate]?.legs ?? []).length
  const dbParlay    = db.prepare("SELECT id FROM parlays WHERE type='lay' AND date=?").get(firstLayDate)
  const dbLegCount  = dbParlay
    ? db.prepare('SELECT COUNT(*) as n FROM parlay_legs WHERE parlay_id=?').get(dbParlay.id).n
    : 0
  check(`lay parlay ${firstLayDate} — leg count`, dbLegCount, rawLegCount)
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────')
console.log(`  ${passed} passed  |  ${failed} failed`)

if (failed === 0) {
  console.log('  ✅ All checks passed — safe to proceed to Phase 3')
} else {
  console.log('  ❌ Some checks failed — do not proceed until fixed')
  process.exit(1)
}

db.close()