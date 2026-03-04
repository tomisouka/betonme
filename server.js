import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const SAVE_PATH = path.join(__dirname, 'savedata.json')

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }))
app.use(express.json())

// Load all data
app.get('/data', (req, res) => {
  try {
    if (!fs.existsSync(SAVE_PATH)) return res.json({})
    res.json(JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8')))
  } catch (e) {
    res.json({})
  }
})

// Save all data
app.post('/data', (req, res) => {
  try {
    fs.writeFileSync(SAVE_PATH, JSON.stringify(req.body, null, 2))
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.listen(3001, '127.0.0.1', () => console.log('💾 Save server running on port 3001'))