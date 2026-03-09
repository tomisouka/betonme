# 07 — JSON as a Database

## The concept

JSON (JavaScript Object Notation) is a text format for structured data.
`savedata.json` is BetOnMe's entire database — one file, all data, human-readable.

```json
{
  "app": {
    "coins": 3,
    "picks": {
      "2026-03-04": { "team": "New York Knicks", "result": "L" }
    }
  },
  "dog": { "picks": { ... } }
}
```

## Why this works for BetOnMe

- One user, one device (synced via Syncthing)
- ~1 entry per day — maybe 300KB after a full year
- No concurrent writes from multiple users
- Simple read/write, no queries needed

A real database (SQLite, Postgres) adds power but also complexity.
For a personal daily tracker, JSON is fine and easier to inspect/edit by hand.

## The read-modify-write pattern

Because it's one flat file, every update is a full rewrite:

```js
// 1. Read the whole file
const current = await loadAllData()

// 2. Modify just the part you care about
current.app.coins += 1

// 3. Write the whole file back
await saveAllData(current)
```

This is why the write queue matters — if two operations both do step 1 before
either does step 3, the second write clobbers the first.

A real DB handles this with transactions and row-level locks. With JSON you have
to handle it yourself — which is what the queue does.

## The savedata structure

```
savedata.json
├── app
│   ├── coins           number
│   ├── lastCoinDate    "YYYY-MM-DD"
│   ├── picks           { "YYYY-MM-DD": Pick }
│   ├── streak          ["W", "L", "W", ...]
│   └── streakDates     ["2026-03-01", ...]
├── predictions
│   └── "YYYY-MM-DD"    { legs: [...], lockedAt: timestamp }
├── lay
│   └── "YYYY-MM-DD"    { legs: [...], overallResult, hitCount, totalCount }
├── dog
│   ├── picks           { "YYYY-MM-DD": DogPick }
│   └── dogStreak       { type, count, since }
├── propPick
│   └── "YYYY-MM-DD"    { player, line, side, odds, result }
└── ouPick
    └── "YYYY-MM-DD"    { name, point, odds }
```

Using `"YYYY-MM-DD"` as keys (instead of a numeric ID) makes lookups trivial —
`picks[getTodayKey()]` gets today's pick directly, no search needed.

## Backup strategy

The server rotates `savedata.json` → `savedata.backup.json` on every write.
So you always have the last known good state one step back.

For longer history, the roadmap includes timestamped backups via `node-cron`
(keep 7 days of snapshots). That's a future Phase 1 item.

## Limitations to know

- **No history queries** — "what's my NBA record in March" requires looping all picks in JS
- **No concurrent writes** — only safe for a single user/device (Syncthing handles multi-device sync)
- **Full rewrite on every save** — fine at this scale, would be slow at 100MB+
- **No schema enforcement** — if you add a field in one place, old entries won't have it (use `|| default`)

When these limitations start hurting (usually around wanting real analytics),
the migration path is SQLite — same file-based simplicity but with SQL queries
and proper transactions.

## Key takeaway

- JSON files work great as a simple database for personal single-user tools
- Date strings as keys make daily-data lookups fast and obvious
- Every update is a full file rewrite — the write queue prevents corruption
- Backup on write gives you a safety net without any extra tooling
