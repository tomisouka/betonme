// db/database.js
// Single shared database connection for the entire app
// Import this wherever you need DB access

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const USE_DB  = process.env.USE_DB === 'true'
const DB_FILE = process.env.DB_FILE ?? 'betonme_dev.db'
const DB_PATH = path.join(__dirname, DB_FILE)

let db = null

export function getDb() {
  if (!USE_DB) return null
  if (!db) {
    if (!fs.existsSync(DB_PATH)) {
      throw new Error(`DB file not found: ${DB_PATH} — run node db/migrate.js first`)
    }
    db = new Database(DB_PATH)
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')
    console.log(`[db] connected to ${DB_FILE}`)
  }
  return db
}

export { USE_DB }
