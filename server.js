import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import https from 'https'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import { getDb, USE_DB } from './db/database.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

const DATA_DIR = __dirname
const LOG_PATH = path.join(DATA_DIR, 'server.log')

// ── File logger ───────────────────────────────────────────────────────────────
function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`
  process.stdout.write(line)
  try { fs.appendFileSync(LOG_PATH, line) } catch {}
}

// ── readFromDb ────────────────────────────────────────────────────────────────
function readFromDb() {
  const db = getDb()
  const appState = db.prepare('SELECT * FROM app_state WHERE id=1').get() ?? {}
  const prefs    = db.prepare('SELECT key, value FROM prefs').all()
  const picks    = db.prepare('SELECT * FROM picks').all()
  const parlays  = db.prepare('SELECT * FROM parlays').all()
  const legs     = db.prepare('SELECT * FROM parlay_legs').all()
  const props    = db.prepare('SELECT * FROM props').all()

  const prefsObj = {}
  for (const { key, value } of prefs) prefsObj[key] = value

  const appOut = {
    coins:        appState.coins ?? 0,
    lastCoinDate: appState.last_coin_date ?? null,
    streak:       JSON.parse(appState.streak ?? '[]'),
    streakDates:  JSON.parse(appState.streak_dates ?? '[]'),
    loginDates:   JSON.parse(appState.login_dates ?? '[]'),
    picks:        {},
  }

  const dog      = { picks: {}, dogStreak: [] }
  const superdog = { picks: {}, sdStreak: [] }
  const ouPick   = {}
  const hatePick = {}
  const favPick  = {}
  const f5       = {}

  for (const p of picks) {
    const pick = {
      gameId: p.game_id, sport: p.sport, home: p.home, away: p.away,
      team: p.team, odds: p.odds, market: p.market, point: p.point, result: p.result,
    }
    if (p.type === 'lock')      appOut.picks[p.date] = { ...pick, stake: p.stake, profit: p.profit, commenceTime: p.commence_time, confidence: p.confidence }
    else if (p.type === 'dog')      dog.picks[p.date] = pick
    else if (p.type === 'superdog') superdog.picks[p.date] = { ...pick, isSuperDog: true }
    else if (p.type === 'ou')       ouPick[p.date] = { name: p.team, point: p.point, odds: p.odds, result: p.result }
    else if (p.type === 'hate')     hatePick[p.date] = p.no_pick ? { noPick: true, reason: p.no_pick_reason } : pick
    else if (p.type === 'fav')      favPick[p.date] = pick
    else if (p.type === 'f5') {
      if (!f5[p.date]) f5[p.date] = { _locked: true }
      f5[p.date][p.sport] = { sport: p.sport, result: p.result, noGuess: p.no_pick === 1, date: p.date }
    }
  }

  const legsByParlay = {}
  for (const leg of legs) {
    if (!legsByParlay[leg.parlay_id]) legsByParlay[leg.parlay_id] = []
    legsByParlay[leg.parlay_id].push({
      gameId: leg.game_id, sport: leg.sport, home: leg.home, away: leg.away,
      team: leg.team, odds: leg.odds, market: leg.market, point: leg.point,
      isLock: leg.is_lock === 1, isDog: leg.is_dog === 1, result: leg.result,
    })
  }

  const lay = {}, predictions = {}, allIn = {}
  for (const parlay of parlays) {
    const entry = { legs: legsByParlay[parlay.id] ?? [], result: parlay.result }
    if (parlay.type === 'lay')             lay[parlay.date]         = entry
    else if (parlay.type === 'prediction') predictions[parlay.date] = entry
    else if (parlay.type === 'allin')      allIn[parlay.date]       = entry
  }

  const propPick = {}
  for (const p of props) {
    if (!propPick[p.date]) propPick[p.date] = {}
    const key = `${p.team}||${p.market_key}`
    propPick[p.date][key] = {
      gameId: p.game_id, sport: p.sport, team: p.team, player: p.player,
      marketKey: p.market_key, label: p.label, line: p.line,
      side: p.side, odds: p.odds, result: p.result,
    }
  }

  return { app: appOut, dog, superdog, ouPick, hatePick, favPick, f5, lay, predictions, allIn, propPick, prefs: prefsObj, _version: 1 }
}

// ── ESPN resolver (server-side, DB-direct) ────────────────────────────────────

const ESPN_ENDPOINTS = { MLB: 'baseball/mlb', NBA: 'basketball/nba', NFL: 'football/nfl' }

function espnGet(sport, dateStr) {
  return new Promise((resolve) => {
    const endpoint = ESPN_ENDPOINTS[sport]
    if (!endpoint) return resolve([])
    const url = `https://site.api.espn.com/apis/site/v2/sports/${endpoint}/scoreboard?dates=${dateStr}`
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data).events || []) } catch { resolve([]) }
      })
    }).on('error', () => resolve([]))
  })
}

function espnMatch(events, home) {
  const hl = (home || '').toLowerCase()
  const hl_last = hl.split(' ').pop()
  return events.find(e =>
    (e.competitions?.[0]?.competitors || []).some(c => {
      const dn = c.team.displayName.toLowerCase()
      return hl.includes(dn) || dn.includes(hl) || (hl_last.length > 3 && dn.includes(hl_last))
    })
  )
}

function espnResult(comp, team, market, point) {
  if (market === 'spreads' && point != null) {
    const lt = (team || '').toLowerCase(), ll = lt.split(' ').pop()
    const pc = (comp.competitors || []).find(c => {
      const dn = c.team.displayName.toLowerCase()
      const sn = c.team.shortDisplayName?.toLowerCase() || ''
      return dn.includes(lt) || lt.includes(dn) || (ll.length > 3 && (dn.includes(ll) || sn.includes(ll)))
    })
    if (!pc) return null
    const oc = (comp.competitors || []).find(c => c.id !== pc.id)
    const ps = parseFloat(pc.score), os = parseFloat(oc?.score ?? 0)
    if (isNaN(ps)) return null
    return (ps - os + point) > 0 ? 'W' : 'L'
  } else {
    const winner = comp.competitors?.find(c => c.winner)
    if (!winner) return null
    const wn = winner.team.displayName.toLowerCase()
    const lt = (team || '').toLowerCase(), ll = lt.split(' ').pop()
    return (wn.includes(lt) || lt.includes(wn) || (ll.length > 3 && wn.includes(ll))) ? 'W' : 'L'
  }
}

async function resolveAllPending() {
  const db = getDb()
  let resolved = 0
  const updateLeg    = db.prepare('UPDATE parlay_legs SET result=? WHERE id=?')
  const updateParlay = db.prepare('UPDATE parlays SET result=? WHERE id=?')
  const updatePick   = db.prepare('UPDATE picks SET result=? WHERE id=?')

  // Cache ESPN calls by sport+date
  const espnCache = {}
  async function getEvents(sport, date) {
    const key = `${sport}|${date}`
    if (!espnCache[key]) espnCache[key] = await espnGet(sport, date.replace(/-/g, ''))
    return espnCache[key]
  }

  // 1. Parlay legs
  const pendingLegs = db.prepare(`
    SELECT pl.id, pl.parlay_id, pl.sport, pl.home, pl.away, pl.team, pl.market, pl.point, p.date, p.type
    FROM parlay_legs pl JOIN parlays p ON p.id = pl.parlay_id
    WHERE pl.result IS NULL AND pl.team IS NOT NULL AND pl.sport IS NOT NULL
  `).all()

  for (const leg of pendingLegs) {
    const events = await getEvents(leg.sport, leg.date)
    const event  = espnMatch(events, leg.home)
    if (!event) continue
    const comp = event.competitions?.[0]
    if (!comp?.status?.type?.completed) continue
    const r = espnResult(comp, leg.team, leg.market, leg.point)
    if (!r) continue
    updateLeg.run(r, leg.id)
    resolved++
    log('INFO', `leg ${leg.id} ${leg.team} → ${r}`)
  }

  // 2. Parlay-level results
  const parlaysToCheck = db.prepare(`
    SELECT DISTINCT p.id, p.type FROM parlays p
    JOIN parlay_legs pl ON pl.parlay_id = p.id WHERE p.result IS NULL
  `).all()

  for (const parlay of parlaysToCheck) {
    const legs     = db.prepare('SELECT result, team FROM parlay_legs WHERE parlay_id=?').all(parlay.id)
    const wt       = legs.filter(l => l.team)
    const resolved2 = wt.filter(l => l.result !== null)
    if (resolved2.length !== wt.length || !wt.length) continue
    const hits    = resolved2.filter(l => l.result === 'W').length
    const outcome = parlay.type === 'allin'
      ? (hits === wt.length ? 'W' : 'L')
      : (hits / wt.length >= 0.7 ? 'W' : 'L')
    updateParlay.run(outcome, parlay.id)
    log('INFO', `parlay ${parlay.id} (${parlay.type}) ${hits}/${wt.length} → ${outcome}`)
    resolved++
  }

  // 3. Single picks (lock, dog, superdog, fav, hate)
  const pendingPicks = db.prepare(`
    SELECT id, date, type, sport, home, away, team, market, point FROM picks
    WHERE result IS NULL AND team IS NOT NULL AND sport IS NOT NULL AND home IS NOT NULL
      AND type IN ('lock','dog','superdog','fav','hate')
  `).all()

  for (const pick of pendingPicks) {
    const events = await getEvents(pick.sport, pick.date)
    const event  = espnMatch(events, pick.home)
    if (!event) continue
    const comp = event.competitions?.[0]
    if (!comp?.status?.type?.completed) continue
    const r = espnResult(comp, pick.team, pick.market, pick.point)
    if (!r) continue
    updatePick.run(r, pick.id)
    resolved++
    log('INFO', `pick ${pick.id} (${pick.type}) ${pick.team} → ${r}`)
  }

  // 4. O/U picks
  const pendingOu = db.prepare(`
    SELECT ou.id, ou.date, ou.team, ou.point, lk.sport, lk.home, lk.away
    FROM picks ou JOIN picks lk ON lk.date = ou.date AND lk.type = 'lock'
    WHERE ou.type = 'ou' AND ou.result IS NULL AND ou.point IS NOT NULL
      AND lk.sport IS NOT NULL AND lk.home IS NOT NULL
  `).all()

  for (const ou of pendingOu) {
    const events = await getEvents(ou.sport, ou.date)
    const event  = espnMatch(events, ou.home)
    if (!event) continue
    const comp = event.competitions?.[0]
    if (!comp?.status?.type?.completed) continue
    const scores = (comp.competitors || []).map(c => parseFloat(c.score)).filter(s => !isNaN(s))
    if (scores.length < 2) continue
    const total = scores.reduce((a, b) => a + b, 0)
    if (total === ou.point) continue  // push
    const r = total > ou.point ? (ou.team === 'Over' ? 'W' : 'L') : (ou.team === 'Under' ? 'W' : 'L')
    updatePick.run(r, ou.id)
    resolved++
    log('INFO', `ou ${ou.id} total=${total} line=${ou.point} ${ou.team} → ${r}`)
  }

  // 5. F5 picks
  const pendingF5 = db.prepare(`
    SELECT id, date, sport, team, market, point, home, away FROM picks
    WHERE type = 'f5' AND result IS NULL AND no_pick = 0
      AND team IS NOT NULL AND sport IS NOT NULL AND home IS NOT NULL
  `).all()

  for (const f5 of pendingF5) {
    const events = await getEvents(f5.sport, f5.date)
    const event  = espnMatch(events, f5.home)
    if (!event) continue
    const comp = event.competitions?.[0]
    if (!comp?.status?.type?.completed) continue
    const r = espnResult(comp, f5.team, f5.market, f5.point)
    if (!r) continue
    updatePick.run(r, f5.id)
    resolved++
    log('INFO', `f5 ${f5.id} ${f5.team} → ${r}`)
  }

  log('INFO', `resolveAllPending: ${resolved} resolved`)
  return resolved
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: (origin, cb) => (!origin || /^http:\/\/localhost:\d+$/.test(origin)) ? cb(null, true) : cb(new Error('CORS blocked')) }))
app.use(express.json({ limit: '5mb' }))

// ── GET /ping ─────────────────────────────────────────────────────────────────
app.get('/ping', (req, res) => res.json({ ok: true, dataDir: DATA_DIR, version: 1 }))

// Dev panel password check — stays server-side, never bundled into client JS.
app.post('/dev-auth', (req, res) => {
  const expected = process.env.DEV_PANEL_PASSWORD || ''
  const input = (req.body && req.body.password) || ''
  const ok = expected.length > 0 && input === expected
  res.json({ ok })
})

// ── GET /data ─────────────────────────────────────────────────────────────────
app.get('/data', (req, res) => {
  try { res.json(readFromDb()) }
  catch (e) { log('ERROR', `GET /data: ${e.message}`); res.json({ _version: 1 }) }
})

// ── POST /resolve ─────────────────────────────────────────────────────────────
app.post('/resolve', async (req, res) => {
  try { res.json({ ok: true, resolved: await resolveAllPending() }) }
  catch (e) { log('ERROR', `POST /resolve: ${e.message}`); res.status(500).json({ error: e.message }) }
})

// ── GET /dk-odds ──────────────────────────────────────────────────────────────
app.get('/dk-odds', (req, res) => {
  const dkPath = path.join(DATA_DIR, 'dk_odds.json')
  if (!fs.existsSync(dkPath)) return res.status(404).json({ error: 'dk_odds.json not found' })
  try { res.json(JSON.parse(fs.readFileSync(dkPath, 'utf8'))) }
  catch { res.status(500).json({ error: 'Failed to parse dk_odds.json' }) }
})

// ── GET /dk-props ─────────────────────────────────────────────────────────────
app.get('/dk-props', (req, res) => {
  const dkPath = path.join(DATA_DIR, 'dk_odds.json')
  if (!fs.existsSync(dkPath)) return res.status(404).json({ error: 'No props data' })
  try {
    const data = JSON.parse(fs.readFileSync(dkPath, 'utf8'))
    const sport = req.query.sport
    const result = {}
    for (const [s, sd] of Object.entries(data.sports || {})) {
      if (sport && s !== sport) continue
      result[s] = { fetchedAt: data.fetchedAt, props: sd.props || [], propsCount: sd.propsCount || 0 }
    }
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── GET /f5 ───────────────────────────────────────────────────────────────────
app.get('/f5', (req, res) => {
  try {
    const picks = db.prepare("SELECT * FROM picks WHERE type='f5'").all()
    const f5 = {}
    for (const p of picks) {
      if (!f5[p.date]) f5[p.date] = { _locked: true }
      f5[p.date][p.sport] = {
        sport: p.sport, result: p.result, noGuess: p.no_pick === 1, date: p.date,
        odds: p.odds, team: p.team, home: p.home, away: p.away, marketType: p.market, point: p.point,
      }
    }
    res.json(f5)
  } catch (e) { log('ERROR', `GET /f5: ${e.message}`); res.status(500).json({ error: e.message }) }
})

// ── GET /parlays/allin ────────────────────────────────────────────────────────
app.get('/parlays/allin', (req, res) => {
  try {
    const parlays = db.prepare("SELECT * FROM parlays WHERE type='allin'").all()
    const legs = db.prepare(
      "SELECT pl.* FROM parlay_legs pl JOIN parlays p ON p.id=pl.parlay_id WHERE p.type='allin'"
    ).all()
    const legsByParlay = {}
    for (const leg of legs) {
      if (!legsByParlay[leg.parlay_id]) legsByParlay[leg.parlay_id] = []
      legsByParlay[leg.parlay_id].push({
        gameId: leg.game_id, sport: leg.sport, home: leg.home, away: leg.away,
        team: leg.team, odds: leg.odds, market: leg.market, point: leg.point,
        isLock: leg.is_lock === 1, isDog: leg.is_dog === 1, result: leg.result,
      })
    }
    const allIn = {}
    for (const parlay of parlays) {
      allIn[parlay.date] = { legs: legsByParlay[parlay.id] ?? [], result: parlay.result }
    }
    res.json(allIn)
  } catch (e) { log('ERROR', `GET /parlays/allin: ${e.message}`); res.status(500).json({ error: e.message }) }
})

// ── GET /dk-f5 ────────────────────────────────────────────────────────────────
app.get('/dk-f5', (req, res) => {
  const dkPath = path.join(DATA_DIR, 'dk_odds.json')
  if (!fs.existsSync(dkPath)) return res.status(404).json({ error: 'No data' })
  try {
    const data = JSON.parse(fs.readFileSync(dkPath, 'utf8'))
    const sport = req.query.sport
    const result = {}
    for (const [s, sd] of Object.entries(data.sports || {})) {
      if (sport && s !== sport) continue
      for (const game of sd.games || []) {
        const f5 = game._dk?.f5
        if (!f5) continue
        result[game.id] = { home: game.home_team, away: game.away_team, commence_time: game.commence_time, f5 }
      }
    }
    res.json({ fetchedAt: data.fetchedAt, games: result })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── POST /scrape-now ──────────────────────────────────────────────────────────
app.post('/scrape-now', (req, res) => {
  const scraperPath = path.join(__dirname, 'dk_scraper.py')
  exec(`python3 ${scraperPath}`, { timeout: 60000 }, async (err, out, stderr) => {
    if (err) { log('ERROR', `scrape-now failed: ${stderr}`); return res.status(500).json({ ok: false, error: stderr }) }
    log('INFO', 'scrape-now: odds updated')
    try {
      const resolved = await resolveAllPending()
      res.json({ ok: true, output: out, resolved })
    } catch (e) { res.json({ ok: true, output: out, resolveError: e.message }) }
  })
})

// ── GET /odds-history ─────────────────────────────────────────────────────────
const ODDS_HISTORY_FILE = path.join(DATA_DIR, 'odds_history.json')
function loadOddsHistory() {
  if (!fs.existsSync(ODDS_HISTORY_FILE)) return {}
  try { return JSON.parse(fs.readFileSync(ODDS_HISTORY_FILE, 'utf8')) } catch { return {} }
}
function saveOddsHistory(data) { fs.writeFileSync(ODDS_HISTORY_FILE, JSON.stringify(data, null, 2)) }

app.get('/odds-history', (req, res) => res.json(loadOddsHistory()))

app.post('/odds-history', (req, res) => {
  try {
    const { dateKey, gameKey, snapshot, force } = req.body
    if (!dateKey || !gameKey || !snapshot) return res.status(400).json({ error: 'Missing fields' })
    const history = loadOddsHistory()
    if (!history[dateKey]) history[dateKey] = {}
    if (!history[dateKey][gameKey]) history[dateKey][gameKey] = []
    const last = history[dateKey][gameKey].slice(-1)[0]
    const changed = !last || last.ml?.home !== snapshot.ml?.home || last.ml?.away !== snapshot.ml?.away ||
                    last.spread?.point !== snapshot.spread?.point || last.total?.point !== snapshot.total?.point
    if (changed || force) { history[dateKey][gameKey].push({ ...snapshot, ts: Date.now() }); saveOddsHistory(history) }
    res.json({ ok: true, changed: changed || !!force })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Purge odds history older than 2 days on startup
;(() => {
  const history = loadOddsHistory()
  const cutoff = Date.now() - 2 * 86400000
  let changed = false
  Object.keys(history).forEach(dateKey => {
    if (new Date(dateKey + 'T12:00:00').getTime() < cutoff) { delete history[dateKey]; changed = true }
  })
  if (changed) saveOddsHistory(history)
})()

// ── PUT /picks/:type/:date ────────────────────────────────────────────────────
app.put('/picks/:type/:date', (req, res) => {
  try {
    const { type, date } = req.params
    const pick = req.body
    if (!pick) return res.status(400).json({ error: 'Missing body' })
    const db = getDb()
    if (type === 'ou') {
      db.prepare(`INSERT INTO picks (date,type,team,odds,market,point,result,no_pick)
        VALUES (@date,'ou',@team,@odds,'totals',@point,@result,0)
        ON CONFLICT(date,type,COALESCE(game_id,sport,'solo')) DO UPDATE SET team=@team,odds=@odds,point=@point,result=@result`
      ).run({ date, team: pick.name ?? null, odds: pick.odds ?? null, point: pick.point ?? null, result: pick.result ?? null })
    } else if (type === 'hate') {
      db.prepare(`INSERT INTO picks (date,type,sport,game_id,home,away,team,odds,market,point,result,no_pick,no_pick_reason)
        VALUES (@date,'hate',@sport,@gid,@home,@away,@team,@odds,@market,@point,@result,@np,@npr)
        ON CONFLICT(date,type,COALESCE(game_id,sport,'solo')) DO UPDATE SET
          sport=@sport,game_id=@gid,home=@home,away=@away,team=@team,odds=@odds,market=@market,point=@point,result=@result,no_pick=@np,no_pick_reason=@npr`
      ).run({ date, sport: pick.sport ?? null, gid: pick.gameId ?? null, home: pick.home ?? null, away: pick.away ?? null,
              team: pick.team ?? null, odds: pick.odds ?? null, market: pick.market ?? null, point: pick.point ?? null,
              result: pick.result ?? null, np: pick.noPick ? 1 : 0, npr: pick.reason ?? null })
    } else if (type === 'f5') {
      db.prepare(`INSERT INTO picks (date,type,sport,market,result,no_pick,no_pick_reason)
        VALUES (@date,'f5',@sport,'f5',@result,@np,@npr)
        ON CONFLICT(date,type,COALESCE(game_id,sport,'solo')) DO UPDATE SET result=@result,no_pick=@np,no_pick_reason=@npr`
      ).run({ date, sport: pick.sport ?? null, result: pick.result ?? null, np: pick.noGuess ? 1 : 0, npr: pick.noGuess ? 'no_guess' : null })
    } else {
      db.prepare(`INSERT INTO picks (date,type,sport,game_id,home,away,team,odds,market,point,result,no_pick,stake,profit,confidence,commence_time)
        VALUES (@date,@type,@sport,@gid,@home,@away,@team,@odds,@market,@point,@result,0,@stake,@profit,@confidence,@ct)
        ON CONFLICT(date,type,COALESCE(game_id,sport,'solo')) DO UPDATE SET
          sport=@sport,game_id=@gid,home=@home,away=@away,team=@team,odds=@odds,market=@market,point=@point,result=@result,
          stake=@stake,profit=@profit,confidence=@confidence,commence_time=@ct`
      ).run({ date, type, sport: pick.sport ?? null, gid: pick.gameId ?? null, home: pick.home ?? null, away: pick.away ?? null,
              team: pick.team ?? null, odds: pick.odds ?? null, market: pick.market ?? null, point: pick.point ?? null,
              result: pick.result ?? null, stake: pick.stake ?? null, profit: pick.profit ?? null,
              confidence: pick.confidence ?? null, ct: pick.commenceTime ?? null })
    }
    log('INFO', `PUT /picks/${type}/${date}`)
    res.json({ ok: true })
  } catch (e) { log('ERROR', `PUT /picks: ${e.message}`); res.status(500).json({ error: e.message }) }
})

// ── DELETE /picks/:type/:date ─────────────────────────────────────────────────
app.delete('/picks/:type/:date', (req, res) => {
  try {
    const { type, date } = req.params
    getDb().prepare('DELETE FROM picks WHERE date=? AND type=?').run(date, type)
    log('INFO', `DELETE /picks/${type}/${date}`)
    res.json({ ok: true })
  } catch (e) { log('ERROR', `DELETE /picks: ${e.message}`); res.status(500).json({ error: e.message }) }
})

// ── PUT /parlays/:type/:date ──────────────────────────────────────────────────
app.put('/parlays/:type/:date', (req, res) => {
  try {
    const { type, date } = req.params
    const parlay = req.body
    if (!parlay) return res.status(400).json({ error: 'Missing body' })
    const db = getDb()
    db.transaction(() => {
      const existing = db.prepare('SELECT id FROM parlays WHERE date=? AND type=?').get(date, type)
      let parlayId
      if (existing) {
        parlayId = existing.id
        db.prepare('UPDATE parlays SET result=? WHERE id=?').run(parlay.result ?? null, parlayId)
        db.prepare('DELETE FROM parlay_legs WHERE parlay_id=?').run(parlayId)
      } else {
        const { lastInsertRowid } = db.prepare('INSERT INTO parlays (date,type,result) VALUES (?,?,?)').run(date, type, parlay.result ?? null)
        parlayId = lastInsertRowid
      }
      for (const leg of (parlay.legs ?? [])) {
        db.prepare(`INSERT INTO parlay_legs (parlay_id,game_id,sport,home,away,team,odds,market,point,is_lock,is_dog,result)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(parlayId, leg.gameId ?? null, leg.sport ?? null, leg.home ?? null, leg.away ?? null,
              leg.team ?? null, leg.odds ?? null, leg.market ?? null, leg.point ?? null,
              leg.isLock ? 1 : 0, leg.isDog ? 1 : 0, leg.result ?? null)
      }
    })()
    log('INFO', `PUT /parlays/${type}/${date}`)
    res.json({ ok: true })
  } catch (e) { log('ERROR', `PUT /parlays: ${e.message}`); res.status(500).json({ error: e.message }) }
})

// ── PUT /props/:date ──────────────────────────────────────────────────────────
app.put('/props/:date', (req, res) => {
  try {
    const { date } = req.params
    const props = req.body
    if (!props || typeof props !== 'object') return res.status(400).json({ error: 'Missing body' })
    const db = getDb()
    db.transaction(() => {
      for (const prop of Object.values(props)) {
        db.prepare(`INSERT OR REPLACE INTO props (date,game_id,sport,team,player,market_key,label,line,side,odds,result)
          VALUES (@date,@gid,@sport,@team,@player,@mk,@label,@line,@side,@odds,@result)`
        ).run({ date, gid: prop.gameId ?? null, sport: prop.sport ?? null, team: prop.team || prop.player || null,
                player: prop.player ?? null, mk: prop.marketKey ?? null, label: prop.label ?? null,
                line: prop.line ?? null, side: prop.side ?? null, odds: prop.odds ?? null, result: prop.result ?? null })
      }
    })()
    log('INFO', `PUT /props/${date} count=${Object.keys(props).length}`)
    res.json({ ok: true })
  } catch (e) { log('ERROR', `PUT /props: ${e.message}`); res.status(500).json({ error: e.message }) }
})

// ── PUT /prefs ────────────────────────────────────────────────────────────────
app.put('/prefs', (req, res) => {
  try {
    const prefs = req.body
    if (!prefs || typeof prefs !== 'object') return res.status(400).json({ error: 'Missing body' })
    const db = getDb()
    db.transaction(() => {
      for (const [key, value] of Object.entries(prefs))
        db.prepare(`INSERT INTO prefs (key,value) VALUES (@key,@value) ON CONFLICT(key) DO UPDATE SET value=@value`).run({ key, value })
    })()
    log('INFO', `PUT /prefs keys=${Object.keys(prefs).join(',')}`)
    res.json({ ok: true })
  } catch (e) { log('ERROR', `PUT /prefs: ${e.message}`); res.status(500).json({ error: e.message }) }
})

// ── PUT /appstate ─────────────────────────────────────────────────────────────
app.put('/appstate', (req, res) => {
  try {
    const a = req.body
    if (!a || typeof a !== 'object') return res.status(400).json({ error: 'Missing body' })
    const db = getDb()
    db.prepare(`INSERT INTO app_state (id,coins,last_coin_date,streak,streak_dates,login_dates)
      VALUES (1,@coins,@lcd,@streak,@sd,@ld)
      ON CONFLICT(id) DO UPDATE SET coins=@coins,last_coin_date=@lcd,streak=@streak,streak_dates=@sd,login_dates=@ld`
    ).run({ coins: a.coins ?? 0, lcd: a.lastCoinDate ?? null, streak: JSON.stringify(a.streak ?? []),
            sd: JSON.stringify(a.streakDates ?? []), ld: JSON.stringify(a.loginDates ?? []) })
    if (a.picks) {
      db.transaction(() => {
        for (const [date, pick] of Object.entries(a.picks)) {
          db.prepare(`INSERT INTO picks (date,type,sport,game_id,home,away,team,odds,market,point,stake,profit,result,confidence,no_pick,no_pick_reason,commence_time)
            VALUES (@date,'lock',@sport,@game_id,@home,@away,@team,@odds,@market,@point,@stake,@profit,@result,@confidence,0,null,@ct)
            ON CONFLICT(date,type,COALESCE(game_id,sport,'solo')) DO UPDATE SET result=@result,stake=@stake,profit=@profit,confidence=@confidence`
          ).run({ date, sport: pick.sport, game_id: pick.gameId, home: pick.home, away: pick.away,
                  team: pick.team, odds: pick.odds, market: pick.market, point: pick.point,
                  stake: pick.stake, profit: pick.profit, result: pick.result,
                  confidence: pick.confidence ?? null, ct: pick.commenceTime ?? null })
        }
      })()
    }
    log('INFO', 'PUT /appstate')
    res.json({ ok: true })
  } catch (e) { log('ERROR', `PUT /appstate: ${e.message}`); res.status(500).json({ error: e.message }) }
})

// ── PUT /f5/:date ─────────────────────────────────────────────────────────────
app.put('/f5/:date', (req, res) => {
  try {
    const { date } = req.params
    const sports = req.body
    if (!sports || typeof sports !== 'object') return res.status(400).json({ error: 'Missing body' })
    const db = getDb()
    db.transaction(() => {
      for (const [sport, pick] of Object.entries(sports)) {
        if (sport === '_locked') continue
        db.prepare(`INSERT INTO picks (date,type,sport,market,result,no_pick,no_pick_reason)
          VALUES (@date,'f5',@sport,'f5',@result,@np,@npr)
          ON CONFLICT(date,type,COALESCE(game_id,sport,'solo')) DO UPDATE SET result=@result,no_pick=@np,no_pick_reason=@npr`
        ).run({ date, sport, result: pick.result ?? null, np: pick.noGuess ? 1 : 0, npr: pick.noGuess ? 'no_guess' : null })
      }
    })()
    log('INFO', `PUT /f5/${date}`)
    res.json({ ok: true })
  } catch (e) { log('ERROR', `PUT /f5: ${e.message}`); res.status(500).json({ error: e.message }) }
})

// ── GET /export ───────────────────────────────────────────────────────────────
app.get('/export', (req, res) => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    res.setHeader('Content-Disposition', `attachment; filename="betonme-${stamp}.json"`)
    res.setHeader('Content-Type', 'application/json')
    res.json(readFromDb())
    log('INFO', `Export downloaded: betonme-${stamp}.json`)
  } catch (e) { log('ERROR', `GET /export: ${e.message}`); res.status(500).json({ error: e.message }) }
})

// ── Startup ───────────────────────────────────────────────────────────────────
const server = app.listen(3001, '127.0.0.1', async () => {
  log('INFO', 'BetOnMe server running on port 3001')
  // Resolve anything pending from last session
  try {
    const count = await resolveAllPending()
    if (count > 0) log('INFO', `Startup: resolved ${count} pending items`)
  } catch (e) { log('WARN', `Startup resolve failed: ${e.message}`) }
})

server.on('error', (e) => { log('ERROR', `Server error: ${e.message}`); process.exit(1) })
process.on('SIGTERM', () => { log('INFO', 'SIGTERM'); process.exit(0) })
process.on('SIGINT',  () => { log('INFO', 'SIGINT');  process.exit(0) })
