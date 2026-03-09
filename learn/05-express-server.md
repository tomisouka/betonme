# 05 — Express Server Basics

## The concept

Express is a minimal Node.js framework for building HTTP servers. In BetOnMe
it acts as a persistence layer — a small program that sits between the React app
and the filesystem, reading and writing `savedata.json`.

## Basic structure

```js
import express from 'express'
const app = express()

app.use(express.json())   // parse incoming JSON bodies

app.get('/data', (req, res) => {
  // req = the incoming request
  // res = your response back to the caller
  res.json({ hello: 'world' })
})

app.post('/data', (req, res) => {
  const body = req.body   // parsed JSON from the request
  // do something with body
  res.json({ ok: true })
})

app.listen(3001, () => console.log('running on 3001'))
```

## The BetOnMe server endpoints

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/data` | Read `savedata.json`, return as JSON |
| POST | `/data` | Write `req.body` to `savedata.json` (backup first) |
| GET | `/export` | Download `savedata.json` as a file attachment |
| POST | `/restore-backup` | Copy `savedata.backup.json` → `savedata.json` |

## Backup on write

Every POST rotates the current file to backup before overwriting:

```js
app.post('/data', (req, res) => {
  if (fs.existsSync(SAVE_PATH)) {
    fs.copyFileSync(SAVE_PATH, BACKUP_PATH)   // rotate: current → backup
  }
  fs.writeFileSync(SAVE_PATH, JSON.stringify(req.body, null, 2))
  res.json({ ok: true })
})
```

This means you always have the previous version one step back.
The dev panel's "Restore Last Backup" button hits `POST /restore-backup`.

## Why a server at all?

The React app runs in the browser. Browsers can't write files to your hard drive
directly — that would be a massive security hole. The Express server runs in
Node.js, which CAN write files. So the flow is:

```
React (browser) → fetch POST /data → Express (Node.js) → fs.writeFileSync → savedata.json
```

The server is the bridge between browser land and filesystem land.

## Process management

The server runs alongside Vite via `concurrently` in `package.json`:

```json
"dev": "concurrently --prefix \"[{name}]\" --names \"server,vite\" \"node server.js\" \"vite\""
```

`pnpm dev` starts both. The `[server]` and `[vite]` labels in the terminal
output tell you which process each log line came from.

**Critical:** when you change `server.js`, you must restart (`Ctrl+C` → `pnpm dev`).
Node doesn't hot-reload like Vite does. This is why the CORS fix didn't take
effect until restart — the old server process was still running with the old config.

## Key takeaway

- Express handles HTTP routes: `app.get(path, handler)` and `app.post(path, handler)`
- `req.body` is the incoming data, `res.json()` sends data back
- Node.js can write files; browsers can't — the server is the bridge
- Server changes require a restart to take effect
