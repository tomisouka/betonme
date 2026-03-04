# BetOnMe — Server Guide

A plain-English breakdown of what `server.js` does, why it exists, and where it can go.

---

## What It Is Right Now

`server.js` is a tiny Express app that runs on `localhost:3001` alongside your React app.
Its only job is to read and write `savedata.json` — a single JSON file that holds all your persistent pick data.

Before this existed, everything was in `localStorage` (the browser's built-in storage). That was fine until you wanted data to survive a browser clear, sync across devices, or be exportable. The server solves all of that.

### What it does today

| Endpoint | What it does |
|----------|--------------|
| `GET /data` | Returns the entire `savedata.json` as JSON |
| `POST /data` | Overwrites `savedata.json` with new data (backs up first) |
| `GET /export` | Downloads a timestamped copy of `savedata.json` |
| `POST /restore-backup` | Copies `savedata.backup.json` back over `savedata.json` |

That's it. Four endpoints, ~60 lines of code.

### The backup system

Every time the app saves anything, the server:
1. Copies the current `savedata.json` → `savedata.backup.json`
2. Writes the new data to `savedata.json`

So you always have one rollback point. If the file ever gets corrupted or a bad save goes through, the Dev Panel's "Restore Last Backup" button gets you back to the previous state instantly.

---

## Why a Local Server Instead of Just localStorage

| | localStorage | savedata.json via server |
|--|--|--|
| Survives browser clear | ❌ | ✅ |
| Works across browsers | ❌ | ✅ |
| Syncs via Syncthing | ❌ | ✅ |
| Exportable | ❌ | ✅ |
| Rollback | ❌ | ✅ |
| Works offline | ✅ | ✅ (reads last data) |
| Needs terminal running | ❌ | ✅ (must run `pnpm dev`) |

The one tradeoff is that the server has to be running. If you open the app without `pnpm dev`, saves silently fail. That's acceptable for a local tool — you'll always have the terminal open when using it.

---

## How the Data Flows

```
You tap "Lock In" in the app
        ↓
React calls saveState(newData)
        ↓
fetch('POST http://localhost:3001/data', { body: newData })
        ↓
server.js receives it
        ↓
copies savedata.json → savedata.backup.json
        ↓
writes new data to savedata.json
        ↓
returns { ok: true }
        ↓
React updates state and re-renders
```

On startup, the app does the reverse — `loadState()` fetches `GET /data` and populates all the React state from the file.

---

## What Lives Where

### In `savedata.json` (persistent — server)
Real pick data you care about keeping:
- `app` — coins, lock picks history, streak
- `predictions` — daily parlay prediction legs
- `lay` — lay of the day legs
- `dog` — dog of the day picks + streak
- `propPick` — player prop picks
- `ouPick` — double lock over/under picks

### In `localStorage` (cache — browser)
Temporary data that refreshes anyway:
- `oddsCache` — the-odds-api odds (3hr TTL)
- `propsDayCache` — player prop lines (3hr TTL)
- `statsCache` — balldontlie player stats (3hr TTL)

Cache intentionally stays in the browser. It's throwaway data — if it gets cleared you just refetch. No reason to persist it.

---

## Phase 1 — What to Add Next (Easy)

These are small additions to `server.js` that don't change its shape.

### Timestamped backup rotation
Right now you have one rolling backup. Add a daily snapshot so you have a week of history:

```js
import cron from 'node-cron'

// Runs at midnight every day
cron.schedule('0 0 * * *', () => {
  const stamp = new Date().toISOString().split('T')[0]
  if (fs.existsSync(SAVE_PATH)) {
    fs.copyFileSync(SAVE_PATH, path.join(__dirname, `savedata.${stamp}.json`))
    console.log(`[server] Daily backup saved: savedata.${stamp}.json`)
  }
})
```

Install: `pnpm add node-cron`

### Import endpoint
Lets you restore from any exported snapshot, not just the last backup:

```js
app.post('/import', (req, res) => {
  try {
    if (fs.existsSync(SAVE_PATH)) fs.copyFileSync(SAVE_PATH, BACKUP_PATH)
    fs.writeFileSync(SAVE_PATH, JSON.stringify(req.body, null, 2))
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
```

Wire a file picker into the Dev Panel to call this.

### Persistent error log
Right now errors only print to the terminal and disappear on restart:

```js
function logError(context, err) {
  const line = `[${new Date().toISOString()}] ${context}: ${err.message}\n`
  fs.appendFileSync(path.join(__dirname, 'server.log'), line)
  console.error(line.trim())
}
```

Replace `console.error` calls with `logError(...)`.

---

## Phase 2 — Moving Off Localhost (Medium)

Right now the server only accepts connections from `localhost`. To reach it from your phone or another device on the same network, you'd need to:

1. Change the listen address from `127.0.0.1` to `0.0.0.0`
2. Add a simple API key check so it's not wide open
3. Point the React app at your machine's local IP instead of `localhost`

To reach it from anywhere (not just home network):

1. Run it on a VPS ($5/mo Hetzner or DigitalOcean) or a Raspberry Pi
2. Use Caddy as a reverse proxy for automatic HTTPS
3. Add an auth token header check

At that point Syncthing becomes unnecessary — every device hits the same server directly.

---

## Phase 3 — Swapping JSON for SQLite (When You Need It)

`savedata.json` will handle a full year of daily picks no problem (~300KB). When you start wanting to *query* your history — "what's my NBA record in March?" or "which team am I most profitable on?" — a flat JSON file becomes painful. That's when you swap to SQLite.

SQLite is a single `.db` file, zero infrastructure, and the `better-sqlite3` npm package makes it trivial. The server endpoints stay identical — you just replace `fs.readFileSync` / `fs.writeFileSync` with SQL queries.

```
savedata.json  →  savedata.db
JSON.parse()   →  db.prepare('SELECT * FROM picks').all()
JSON.stringify →  db.prepare('INSERT INTO picks ...').run(data)
```

Migration is a one-time script that reads your existing JSON and inserts it into the new DB. Your whole pick history carries over.

---

## The Full Roadmap at a Glance

```
NOW         localhost:3001, savedata.json, Syncthing sync
            ↓
PHASE 1     timestamped backups, import endpoint, error log        (~1-2 weeks)
            ↓
PHASE 2     VPS/Pi deployment, HTTPS via Caddy, drop Syncthing     (~1-2 months)
            ↓
PHASE 3     SQLite, server-side result resolution cron, push notifs (~2-4 months)
            ↓
PHASE 4     PWA install on phone, Capacitor APK                     (~3-5 months)
            ↓
FUTURE      React Native if Play Store ever becomes a goal          (6+ months)
```

---

## Quick Reference

```bash
# Start everything
pnpm dev

# Server only
node server.js

# Check server is running
curl http://localhost:3001/data

# Export your data manually
curl http://localhost:3001/export -o backup.json

# Restore last backup (same as Dev Panel button)
curl -X POST http://localhost:3001/restore-backup
```
