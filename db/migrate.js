// db/migrate.js
// One-time migration: savedata.json → betonme_dev.db
// READ ONLY on savedata.json — never modifies it
// Safe to run multiple times against dev DB (wipes and rebuilds)

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── Load source data ──────────────────────────────────────────────────────────
const savePath = path.join(ROOT, 'savedata.json')
const raw = JSON.parse(fs.readFileSync(savePath, 'utf8'))
console.log('✓ savedata.json loaded — read only, will not be modified')

// ── Open dev DB ───────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'betonme_dev.db'))
db.pragma('foreign_keys = ON')
db.pragma('journal_mode = WAL')
console.log('✓ betonme_dev.db opened')

// ── Wipe existing data (safe — dev only) ─────────────────────────────────────
db.exec(`
  DELETE FROM parlay_legs;
  DELETE FROM parlays;
  DELETE FROM props;
  DELETE FROM picks;
  DELETE FROM prefs;
  DELETE FROM app_state;
`)
console.log('✓ dev DB wiped — fresh start')

// ── Prepared statements ───────────────────────────────────────────────────────
const insertAppState = db.prepare(`
  INSERT INTO app_state (id, coins, last_coin_date, streak, streak_dates, login_dates)
  VALUES (1, @coins, @last_coin_date, @streak, @streak_dates, @login_dates)
`)

const insertPref = db.prepare(`
  INSERT INTO prefs (key, value) VALUES (@key, @value)
`)

const insertPick = db.prepare(`
  INSERT INTO picks (date, type, sport, game_id, home, away, team, odds, market,
    point, stake, profit, result, confidence, no_pick, no_pick_reason, commence_time)
  VALUES (@date, @type, @sport, @game_id, @home, @away, @team, @odds, @market,
    @point, @stake, @profit, @result, @confidence, @no_pick, @no_pick_reason, @commence_time)
`)

const insertParlay = db.prepare(`
  INSERT INTO parlays (date, type, result) VALUES (@date, @type, @result)
`)

const insertLeg = db.prepare(`
  INSERT INTO parlay_legs (parlay_id, game_id, sport, home, away, team, odds, market, point, is_lock, is_dog, result)
  VALUES (@parlay_id, @game_id, @sport, @home, @away, @team, @odds, @market, @point, @is_lock, @is_dog, @result)
`)

const insertProp = db.prepare(`
  INSERT INTO props (date, game_id, sport, team, player, market_key, label, line, side, odds, result)
  VALUES (@date, @game_id, @sport, @team, @player, @market_key, @label, @line, @side, @odds, @result)
`)

// ── Run everything in one transaction ────────────────────────────────────────
const migrate = db.transaction(() => {

  // 1. APP STATE
  const app = raw.app
  insertAppState.run({
    coins:          app.coins ?? 0,
    last_coin_date: app.lastCoinDate ?? null,
    streak:         JSON.stringify(app.streak ?? []),
    streak_dates:   JSON.stringify(app.streakDates ?? []),
    login_dates:    JSON.stringify(app.loginDates ?? []),
  })
  console.log('✓ app_state migrated')

  // 2. PREFS
  const prefs = raw.prefs ?? {}
  for (const [key, value] of Object.entries(prefs)) {
    insertPref.run({ key, value })
  }
  console.log(`✓ prefs migrated (${Object.keys(prefs).length} rows)`)

  // 3. LOCK PICKS (app.picks keyed by date)
  const lockPicks = app.picks ?? {}
  for (const [date, pick] of Object.entries(lockPicks)) {
    insertPick.run({
      date,
      type:           'lock',
      sport:          pick.sport ?? null,
      game_id:        pick.gameId ?? null,
      home:           pick.home ?? null,
      away:           pick.away ?? null,
      team:           pick.team ?? null,
      odds:           pick.odds ?? null,
      market:         pick.market ?? null,
      point:          pick.point ?? null,
      stake:          pick.stake ?? null,
      profit:         pick.profit ?? null,
      result:         pick.result ?? null,
      confidence:     pick.confidence ?? null,
      no_pick:        0,
      no_pick_reason: null,
      commence_time:  pick.commenceTime ?? null,
    })
  }
  console.log(`✓ picks (lock) migrated (${Object.keys(lockPicks).length} rows)`)

  // 4. DOG PICKS (dog.picks keyed by date)
  const dogPicks = raw.dog?.picks ?? {}
  for (const [date, pick] of Object.entries(dogPicks)) {
    insertPick.run({
      date,
      type:           'dog',
      sport:          pick.sport ?? null,
      game_id:        pick.gameId ?? null,
      home:           pick.home ?? null,
      away:           pick.away ?? null,
      team:           pick.team ?? null,
      odds:           pick.odds ?? null,
      market:         pick.market ?? null,
      point:          pick.point ?? null,
      stake:          null,
      profit:         null,
      result:         pick.result ?? null,
      confidence:     null,
      no_pick:        0,
      no_pick_reason: null,
      commence_time:  null,
    })
  }
  console.log(`✓ picks (dog) migrated (${Object.keys(dogPicks).length} rows)`)

  // 5. SUPERDOG PICKS (superdog.picks keyed by date)
  const superdogPicks = raw.superdog?.picks ?? {}
  for (const [date, pick] of Object.entries(superdogPicks)) {
    insertPick.run({
      date,
      type:           'superdog',
      sport:          pick.sport ?? null,
      game_id:        pick.gameId ?? null,
      home:           pick.home ?? null,
      away:           pick.away ?? null,
      team:           pick.team ?? null,
      odds:           pick.odds ?? null,
      market:         pick.market ?? null,
      point:          pick.point ?? null,
      stake:          null,
      profit:         null,
      result:         pick.result ?? null,
      confidence:     null,
      no_pick:        0,
      no_pick_reason: null,
      commence_time:  null,
    })
  }
  console.log(`✓ picks (superdog) migrated (${Object.keys(superdogPicks).length} rows)`)

  // 6. OU PICKS (ouPick keyed by date)
  const ouPicks = raw.ouPick ?? {}
  for (const [date, pick] of Object.entries(ouPicks)) {
    insertPick.run({
      date,
      type:           'ou',
      sport:          null,
      game_id:        null,
      home:           null,
      away:           null,
      team:           pick.name ?? null,
      odds:           pick.odds ?? null,
      market:         'totals',
      point:          pick.point ?? null,
      stake:          null,
      profit:         null,
      result:         pick.result ?? null,
      confidence:     null,
      no_pick:        0,
      no_pick_reason: null,
      commence_time:  null,
    })
  }
  console.log(`✓ picks (ou) migrated (${Object.keys(ouPicks).length} rows)`)

  // 7. HATE PICKS (hatePick keyed by date)
  const hatePicks = raw.hatePick ?? {}
  for (const [date, pick] of Object.entries(hatePicks)) {
    insertPick.run({
      date,
      type:           'hate',
      sport:          pick.sport ?? null,
      game_id:        pick.gameId ?? null,
      home:           pick.home ?? null,
      away:           pick.away ?? null,
      team:           pick.team ?? null,
      odds:           pick.odds ?? null,
      market:         pick.market ?? null,
      point:          pick.point ?? null,
      stake:          null,
      profit:         null,
      result:         pick.result ?? null,
      confidence:     null,
      no_pick:        pick.noPick ? 1 : 0,
      no_pick_reason: pick.reason ?? null,
      commence_time:  null,
    })
  }
  console.log(`✓ picks (hate) migrated (${Object.keys(hatePicks).length} rows)`)

  // 8. FAV PICKS (favPick keyed by date)
  const favPicks = raw.favPick ?? {}
  for (const [date, pick] of Object.entries(favPicks)) {
    insertPick.run({
      date,
      type:           'fav',
      sport:          pick.sport ?? null,
      game_id:        pick.gameId ?? null,
      home:           pick.home ?? null,
      away:           pick.away ?? null,
      team:           pick.team ?? null,
      odds:           pick.odds ?? null,
      market:         pick.market ?? null,
      point:          pick.point ?? null,
      stake:          null,
      profit:         null,
      result:         pick.result ?? null,
      confidence:     null,
      no_pick:        0,
      no_pick_reason: null,
      commence_time:  null,
    })
  }
  console.log(`✓ picks (fav) migrated (${Object.keys(favPicks).length} rows)`)

  // 9. F5 PICKS (f5 keyed by date, then by sport)
  const f5ByDate = raw.f5 ?? {}
  let f5Count = 0
  for (const [date, sports] of Object.entries(f5ByDate)) {
    for (const [sport, pick] of Object.entries(sports)) {
      if (sport === '_locked') continue
      insertPick.run({
        date,
        type:           'f5',
        sport:          pick.sport ?? sport,
        game_id:        null,
        home:           null,
        away:           null,
        team:           null,
        odds:           null,
        market:         'f5',
        point:          null,
        stake:          null,
        profit:         null,
        result:         pick.result ?? null,
        confidence:     null,
        no_pick:        pick.noGuess ? 1 : 0,
        no_pick_reason: pick.noGuess ? 'no_guess' : null,
        commence_time:  null,
      })
      f5Count++
    }
  }
  console.log(`✓ picks (f5) migrated (${f5Count} rows)`)

  // 10. PARLAYS — lay, predictions, allIn
  const parlayTypes = [
    { key: 'lay',         type: 'lay' },
    { key: 'predictions', type: 'prediction' },
    { key: 'allIn',       type: 'allin' },
  ]

  let parlayCount = 0
  let legCount = 0

  for (const { key, type } of parlayTypes) {
    const byDate = raw[key] ?? {}
    for (const [date, parlay] of Object.entries(byDate)) {
      const legs = parlay.legs ?? []
      const result = parlay.result ?? null
      const { lastInsertRowid } = insertParlay.run({ date, type, result })
      parlayCount++
      for (const leg of legs) {
        insertLeg.run({
          parlay_id: lastInsertRowid,
          game_id:   leg.gameId ?? null,
          sport:     leg.sport ?? null,
          home:      leg.home ?? null,
          away:      leg.away ?? null,
          team:      leg.team ?? null,
          odds:      leg.odds ?? null,
          market:    leg.market ?? null,
          point:     leg.point ?? null,
          is_lock:   leg.isLock ? 1 : 0,
          is_dog:    leg.isDog ? 1 : 0,
          result:    leg.result ?? null,
        })
        legCount++
      }
    }
  }
  console.log(`✓ parlays migrated (${parlayCount} parlays, ${legCount} legs)`)

  // 11. PROPS (propPick keyed by date, then by team||market key)
  const propsByDate = raw.propPick ?? {}
  let propCount = 0
  for (const [date, props] of Object.entries(propsByDate)) {
    for (const [, prop] of Object.entries(props)) {
      insertProp.run({
        date,
        game_id:    prop.gameId ?? null,
        sport:      prop.sport ?? null,
        team:       prop.team ?? null,
        player:     prop.player ?? null,
        market_key: prop.marketKey ?? null,
        label:      prop.label ?? null,
        line:       prop.line ?? null,
        side:       prop.side ?? null,
        odds:       prop.odds ?? null,
        result:     prop.result ?? null,
      })
      propCount++
    }
  }
  console.log(`✓ props migrated (${propCount} rows)`)
})

// ── Execute ───────────────────────────────────────────────────────────────────
try {
  migrate()
  console.log('\n✅ Migration complete — betonme_dev.db is ready')
} catch (err) {
  console.error('\n❌ Migration failed:', err.message)
  process.exit(1)
} finally {
  db.close()
}