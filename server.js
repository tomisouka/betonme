import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const SAVE_PATH   = path.join(__dirname, 'savedata.json')
const BACKUP_PATH = path.join(__dirname, 'savedata.backup.json')

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }))
app.use(express.json({ limit: '5mb' }))

// ── Load all data ────────────────────────────────────────────────────────────
app.get('/data', (req, res) => {
  try {
    if (!fs.existsSync(SAVE_PATH)) return res.json({})
    res.json(JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8')))
  } catch (e) {
    console.error('[server] GET /data error:', e.message)
    res.json({})
  }
})

// ── Save all data (writes backup first) ─────────────────────────────────────
app.post('/data', (req, res) => {
  try {
    // Rotate current file -> backup before overwriting
    if (fs.existsSync(SAVE_PATH)) {
      fs.copyFileSync(SAVE_PATH, BACKUP_PATH)
    }
    fs.writeFileSync(SAVE_PATH, JSON.stringify(req.body, null, 2))
    res.json({ ok: true })
  } catch (e) {
    console.error('[server] POST /data error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

// ── Manual snapshot export ───────────────────────────────────────────────────
// GET /export  ->  downloads savedata.json as a file attachment
app.get('/export', (req, res) => {
  try {
    if (!fs.existsSync(SAVE_PATH)) return res.status(404).json({ error: 'No data yet' })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    res.setHeader('Content-Disposition', `attachment; filename="betonme-${stamp}.json"`)
    res.setHeader('Content-Type', 'application/json')
    res.send(fs.readFileSync(SAVE_PATH))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Restore from backup ──────────────────────────────────────────────────────
app.post('/restore-backup', (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_PATH)) return res.status(404).json({ error: 'No backup found' })
    fs.copyFileSync(BACKUP_PATH, SAVE_PATH)
    res.json({ ok: true, restored: JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8')) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.listen(3001, '127.0.0.1', () => console.log('Save server running on port 3001'))

// Graceful shutdown
process.on('SIGTERM', () => { console.log('[server] SIGTERM -- shutting down'); process.exit(0) })
process.on('SIGINT',  () => { console.log('[server] SIGINT -- shutting down');  process.exit(0) })