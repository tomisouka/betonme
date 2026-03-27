import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

// Data directory: prefer ~/.local/share/betonme so it works the same
// whether running from dev, deb install, or Tauri. Falls back to __dirname
// for backwards compatibility with existing dev setups.
function getDataDir() {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const xdg  = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share')
  const dir  = path.join(xdg, 'betonme')
  // If savedata.json already exists in __dirname (existing dev setup), use that
  if (fs.existsSync(path.join(__dirname, 'savedata.json'))) return __dirname
  // Otherwise use the proper data dir
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

const DATA_DIR     = getDataDir()
const SAVE_PATH    = path.join(DATA_DIR, 'savedata.json')
const BACKUP_PATH  = path.join(DATA_DIR, 'savedata.backup.json')
const BACKUPS_DIR  = path.join(DATA_DIR, 'savedata-backups')
const LOG_PATH     = path.join(DATA_DIR, 'server.log')

const SCHEMA_VERSION = 1
const MAX_BACKUPS    = 7

// ── File logger (TICKET-014) ─────────────────────────────────────────────────
function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`
  process.stdout.write(line)
  try { fs.appendFileSync(LOG_PATH, line) } catch {}
}

// ── Timestamped backup rotation (TICKET-012) ─────────────────────────────────
function rotateDailyBackup() {
  if (!fs.existsSync(SAVE_PATH)) return
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const dest  = path.join(BACKUPS_DIR, `savedata.${stamp}.json`)
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(SAVE_PATH, dest)
    log('INFO', `Daily backup written -> ${path.basename(dest)}`)
  }
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('savedata.') && f.endsWith('.json'))
    .sort()
  if (files.length > MAX_BACKUPS) {
    files.slice(0, files.length - MAX_BACKUPS).forEach(f => {
      fs.unlinkSync(path.join(BACKUPS_DIR, f))
      log('INFO', `Pruned old backup: ${f}`)
    })
  }
}

// ── Schema migration (TICKET-015) ────────────────────────────────────────────
function migrateSchema(data) {
  if (!data || typeof data !== 'object') return { _version: SCHEMA_VERSION }
  if (!data._version) {
    data._version = SCHEMA_VERSION
    log('INFO', 'Schema migrated v0 -> v1')
  }
  return data
}

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) cb(null, true)
    else cb(new Error('CORS blocked'))
  }
}))
app.use(express.json({ limit: '5mb' }))

// ── GET /ping ────────────────────────────────────────────────────────────────
app.get('/ping', (req, res) => res.json({ ok: true, dataDir: DATA_DIR, version: SCHEMA_VERSION }))

// ── GET /dk-odds ─────────────────────────────────────────────────────────────
app.get('/dk-odds', (req, res) => {
  const dkPath = path.join(DATA_DIR, 'dk_odds.json')
  if (!fs.existsSync(dkPath)) return res.status(404).json({ error: 'dk_odds.json not found — run dk_scraper.py first' })
  try { res.json(JSON.parse(fs.readFileSync(dkPath, 'utf8'))) }
  catch (e) { res.status(500).json({ error: 'Failed to parse dk_odds.json' }) }
})

// ── GET /dk-props ─────────────────────────────────────────────────────────────
// Returns just the props portion from dk_odds.json, optionally filtered by sport
app.get('/dk-props', (req, res) => {
  const dkPath = path.join(DATA_DIR, 'dk_odds.json')
  if (!fs.existsSync(dkPath)) return res.status(404).json({ error: 'No props data — run dk_scraper.py first' })
  try {
    const data = JSON.parse(fs.readFileSync(dkPath, 'utf8'))
    const sport = req.query.sport  // optional ?sport=MLB
    const result = {}
    for (const [s, sd] of Object.entries(data.sports || {})) {
      if (sport && s !== sport) continue
      result[s] = {
        fetchedAt: data.fetchedAt,
        props: sd.props || [],
        propsCount: sd.propsCount || 0,
      }
    }
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── POST /scrape-now ──────────────────────────────────────────────────────────
// Triggers dk_scraper.py on demand
app.post('/scrape-now', (req, res) => {
  const scriptPath = path.join(DATA_DIR, 'dk_scraper.py')
  exec(`python3 ${scriptPath}`, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      log('ERROR', `scrape-now failed: ${stderr}`)
      return res.status(500).json({ ok: false, error: stderr })
    }
    log('INFO', 'scrape-now completed')
    res.json({ ok: true, output: stdout })
  })
})

// ── GET /odds-history ────────────────────────────────────────────────────────
// Stores odds snapshots keyed by date+game for movement tracking
const ODDS_HISTORY_FILE = path.join(DATA_DIR, 'odds_history.json')

function loadOddsHistory() {
  if (!fs.existsSync(ODDS_HISTORY_FILE)) return {}
  try { return JSON.parse(fs.readFileSync(ODDS_HISTORY_FILE, 'utf8')) } catch { return {} }
}

function saveOddsHistory(data) {
  fs.writeFileSync(ODDS_HISTORY_FILE, JSON.stringify(data, null, 2))
}

app.get('/odds-history', (req, res) => {
  res.json(loadOddsHistory())
})

app.post('/odds-history', (req, res) => {
  try {
    const { dateKey, gameKey, snapshot } = req.body
    if (!dateKey || !gameKey || !snapshot) return res.status(400).json({ error: 'Missing fields' })
    const history = loadOddsHistory()
    if (!history[dateKey]) history[dateKey] = {}
    if (!history[dateKey][gameKey]) history[dateKey][gameKey] = []
    // Don't duplicate if odds haven't changed
    const last = history[dateKey][gameKey].slice(-1)[0]
    const changed = !last ||
      last.ml?.home !== snapshot.ml?.home ||
      last.ml?.away !== snapshot.ml?.away ||
      last.spread?.point !== snapshot.spread?.point ||
      last.total?.point !== snapshot.total?.point
    if (changed) {
      history[dateKey][gameKey].push({ ...snapshot, ts: Date.now() })
      saveOddsHistory(history)
    }
    res.json({ ok: true, changed })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Purge history older than 2 days on startup
;(() => {
  const history = loadOddsHistory()
  const cutoff = Date.now() - 2 * 86400000
  let changed = false
  Object.keys(history).forEach(dateKey => {
    const d = new Date(dateKey + 'T12:00:00')
    if (d.getTime() < cutoff) { delete history[dateKey]; changed = true }
  })
  if (changed) saveOddsHistory(history)
})()

// ── GET /data ────────────────────────────────────────────────────────────────
app.get('/data', (req, res) => {
  try {
    if (!fs.existsSync(SAVE_PATH)) return res.json({ _version: SCHEMA_VERSION })
    const data = migrateSchema(JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8')))
    res.json(data)
  } catch (e) {
    log('ERROR', `GET /data: ${e.message}`)
    res.json({ _version: SCHEMA_VERSION })
  }
})

// ── POST /data ───────────────────────────────────────────────────────────────
app.post('/data', (req, res) => {
  try {
    if (fs.existsSync(SAVE_PATH)) fs.copyFileSync(SAVE_PATH, BACKUP_PATH)
    rotateDailyBackup()
    const body = { ...req.body, _version: SCHEMA_VERSION }
    fs.writeFileSync(SAVE_PATH, JSON.stringify(body, null, 2))
    res.json({ ok: true })
  } catch (e) {
    log('ERROR', `POST /data: ${e.message}`)
    res.status(500).json({ error: e.message })
  }
})

// ── GET /export ──────────────────────────────────────────────────────────────
app.get('/export', (req, res) => {
  try {
    if (!fs.existsSync(SAVE_PATH)) return res.status(404).json({ error: 'No data yet' })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    res.setHeader('Content-Disposition', `attachment; filename="betonme-${stamp}.json"`)
    res.setHeader('Content-Type', 'application/json')
    res.send(fs.readFileSync(SAVE_PATH))
    log('INFO', `Export downloaded: betonme-${stamp}.json`)
  } catch (e) {
    log('ERROR', `GET /export: ${e.message}`)
    res.status(500).json({ error: e.message })
  }
})

// ── POST /restore-backup ─────────────────────────────────────────────────────
app.post('/restore-backup', (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_PATH)) return res.status(404).json({ error: 'No backup found' })
    fs.copyFileSync(BACKUP_PATH, SAVE_PATH)
    const restored = migrateSchema(JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8')))
    log('INFO', 'Rolling backup restored')
    res.json({ ok: true, restored })
  } catch (e) {
    log('ERROR', `POST /restore-backup: ${e.message}`)
    res.status(500).json({ error: e.message })
  }
})

// ── POST /import (TICKET-013) ────────────────────────────────────────────────
app.post('/import', (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Body must be a JSON object' })
    }
    const knownKeys = ['app', 'dog', 'propPick', 'predictions', 'lay', 'ouPick', 'f5', '_version']
    if (!Object.keys(req.body).some(k => knownKeys.includes(k))) {
      return res.status(400).json({ error: 'Does not look like a BetOnMe save file' })
    }
    if (fs.existsSync(SAVE_PATH)) {
      if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const preImport = path.join(BACKUPS_DIR, `savedata.pre-import-${stamp}.json`)
      fs.copyFileSync(SAVE_PATH, preImport)
      log('INFO', `Pre-import backup saved: ${path.basename(preImport)}`)
    }
    const body = migrateSchema({ ...req.body })
    fs.writeFileSync(SAVE_PATH, JSON.stringify(body, null, 2))
    log('INFO', 'Data imported via POST /import')
    res.json({ ok: true, _version: body._version })
  } catch (e) {
    log('ERROR', `POST /import: ${e.message}`)
    res.status(500).json({ error: e.message })
  }
})

// ── GET /backups ─────────────────────────────────────────────────────────────
app.get('/backups', (req, res) => {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return res.json({ backups: [] })
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort().reverse()
      .map(f => ({ filename: f, size: fs.statSync(path.join(BACKUPS_DIR, f)).size, url: `/backups/${f}` }))
    res.json({ backups: files })
  } catch (e) {
    log('ERROR', `GET /backups: ${e.message}`)
    res.status(500).json({ error: e.message })
  }
})

// ── GET /backups/:filename ────────────────────────────────────────────────────
app.get('/backups/:filename', (req, res) => {
  try {
    const safe = path.basename(req.params.filename)
    if (!safe.endsWith('.json')) return res.status(400).json({ error: 'Invalid filename' })
    const filePath = path.join(BACKUPS_DIR, safe)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' })
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`)
    res.setHeader('Content-Type', 'application/json')
    res.send(fs.readFileSync(filePath))
  } catch (e) {
    log('ERROR', `GET /backups/${req.params.filename}: ${e.message}`)
    res.status(500).json({ error: e.message })
  }
})

// ── Startup ──────────────────────────────────────────────────────────────────
const server = app.listen(3001, '127.0.0.1', () => {
  log('INFO', 'Save server running on port 3001')
  rotateDailyBackup()
})

// Keep process alive (required for Express 5 async listen)
server.on('error', (e) => {
  log('ERROR', `Server error: ${e.message}`)
  process.exit(1)
})

process.on('SIGTERM', () => { log('INFO', 'SIGTERM - shutting down'); process.exit(0) })
process.on('SIGINT',  () => { log('INFO', 'SIGINT - shutting down');  process.exit(0) })
