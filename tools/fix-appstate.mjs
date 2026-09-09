#!/usr/bin/env node
// fix-appstate.mjs
// Restores streak, streakDates, loginDates from savedata.json into the DB.
// Keeps the DB's current coins value (it's more up to date than savedata.json).
//
// Usage: node fix-appstate.mjs

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH   = path.join(__dirname, 'db', 'betonme.db')
const SAVE_PATH = path.join(__dirname, 'savedata.json')

const RESET = '\x1b[0m', GREEN = '\x1b[32m', RED = '\x1b[31m', CYAN = '\x1b[36m', BOLD = '\x1b[1m'
const ok   = m => console.log(`  ${GREEN}✓${RESET} ${m}`)
const fail = m => console.log(`  ${RED}✗${RESET} ${m}`)
const info = m => console.log(`  ${CYAN}→${RESET} ${m}`)

if (!fs.existsSync(DB_PATH)) { fail(`DB not found: ${DB_PATH}`); process.exit(1) }
if (!fs.existsSync(SAVE_PATH)) { fail(`savedata.json not found`); process.exit(1) }

const raw  = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8'))
const app  = raw.app || {}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// Read current DB state
const current = db.prepare('SELECT coins, last_coin_date, streak, streak_dates, login_dates FROM app_state WHERE id=1').get()

console.log('\nCurrent DB app_state:')
console.log('  coins:', current?.coins)
console.log('  streak:', current?.streak)
console.log('  streak_dates:', current?.streak_dates)
console.log('  login_dates:', current?.login_dates)

// What we're restoring from savedata.json
const streak      = app.streak      || []
const streakDates = app.streakDates || []
const loginDates  = app.loginDates  || []
const lastCoinDate = app.lastCoinDate || current?.last_coin_date || null

// Keep DB coins — it's more current (savedata.json may be behind)
const coins = current?.coins ?? app.coins ?? 0

console.log('\nRestoring from savedata.json:')
info(`streak: ${JSON.stringify(streak)}`)
info(`streakDates: ${JSON.stringify(streakDates)}`)
info(`loginDates count: ${loginDates.length}, last: ${loginDates[loginDates.length - 1]}`)
info(`coins: keeping DB value = ${coins}`)
info(`lastCoinDate: ${lastCoinDate}`)

db.prepare(`
  INSERT INTO app_state (id, coins, last_coin_date, streak, streak_dates, login_dates)
  VALUES (1, @coins, @lcd, @streak, @sd, @ld)
  ON CONFLICT(id) DO UPDATE SET
    streak = @streak,
    streak_dates = @sd,
    login_dates = @ld,
    last_coin_date = @lcd
    -- deliberately NOT updating coins — keep DB value
`).run({
  coins,
  lcd:    lastCoinDate,
  streak: JSON.stringify(streak),
  sd:     JSON.stringify(streakDates),
  ld:     JSON.stringify(loginDates),
})

// Verify
const after = db.prepare('SELECT coins, last_coin_date, streak, streak_dates, login_dates FROM app_state WHERE id=1').get()
const parsedStreak = JSON.parse(after.streak)
const parsedDates  = JSON.parse(after.streak_dates)

console.log('\nDB after fix:')
console.log('  coins:', after.coins)
console.log('  last_coin_date:', after.last_coin_date)
console.log('  streak length:', parsedStreak.length, '→', parsedStreak.join(' '))
console.log('  streak_dates length:', parsedDates.length)
console.log('  login_dates length:', JSON.parse(after.login_dates).length)

if (parsedStreak.length === streak.length && parsedDates.length === streakDates.length) {
  ok(`streak restored: ${parsedStreak.length} entries`)
  ok(`streakDates restored: ${parsedDates.length} entries`)
  console.log(`\n${GREEN}${BOLD}✅ Done. Restart the server for changes to take effect.${RESET}\n`)
} else {
  fail('Mismatch after write — check manually')
}

db.close()
