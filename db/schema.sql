-- BetOnMe Database Schema
-- SQLite

PRAGMA foreign_keys = ON;

-- ── 1. APP STATE ──────────────────────────────────────────────────────────────
-- coins, streak, login dates
CREATE TABLE IF NOT EXISTS app_state (
  id            INTEGER PRIMARY KEY CHECK (id = 1), -- only ever one row
  coins         REAL    NOT NULL DEFAULT 0,
  last_coin_date TEXT,
  streak        TEXT    NOT NULL DEFAULT '[]', -- JSON array ['W','L',...]
  streak_dates  TEXT    NOT NULL DEFAULT '[]', -- JSON array of date strings
  login_dates   TEXT    NOT NULL DEFAULT '[]'  -- JSON array of date strings
);

-- ── 2. PREFS ──────────────────────────────────────────────────────────────────
-- hateTeam_MLB, favTeam_MLB, etc.
CREATE TABLE IF NOT EXISTS prefs (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ── 3. PICKS ──────────────────────────────────────────────────────────────────
-- covers: lock (app.picks), dog, superdog, ouPick, hatePick, favPick, f5
CREATE TABLE IF NOT EXISTS picks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  date            TEXT    NOT NULL,
  type            TEXT    NOT NULL, -- 'lock'|'dog'|'superdog'|'ou'|'hate'|'fav'|'f5'
  sport           TEXT,
  game_id         TEXT,
  home            TEXT,
  away            TEXT,
  team            TEXT,
  odds            REAL,
  market          TEXT,
  point           REAL,
  stake           REAL,
  profit          REAL,
  result          TEXT,             -- 'W'|'L'|null
  confidence      INTEGER,
  no_pick         INTEGER DEFAULT 0, -- boolean 0/1
  no_pick_reason  TEXT,
  commence_time   TEXT,
  created_at      TEXT    DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS picks_unique ON picks(date, type, COALESCE(game_id, sport, 'solo'));

-- ── 4. PARLAYS ────────────────────────────────────────────────────────────────
-- covers: lay, predictions, allIn (headers only)
CREATE TABLE IF NOT EXISTS parlays (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT    NOT NULL,
  type       TEXT    NOT NULL, -- 'lay'|'prediction'|'allin'
  result     TEXT,             -- 'W'|'L'|null
  created_at TEXT    DEFAULT (datetime('now'))
);

-- ── 5. PARLAY LEGS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parlay_legs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  parlay_id  INTEGER NOT NULL REFERENCES parlays(id) ON DELETE CASCADE,
  game_id    TEXT,
  sport      TEXT,
  home       TEXT,
  away       TEXT,
  team       TEXT,
  odds       REAL,
  market     TEXT,
  point      REAL,
  is_lock    INTEGER DEFAULT 0, -- boolean 0/1
  is_dog     INTEGER DEFAULT 0, -- boolean 0/1
  result     TEXT              -- 'W'|'L'|null
);

-- ── 6. PROPS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS props (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT    NOT NULL,
  game_id     TEXT,
  sport       TEXT,
  team        TEXT,
  player      TEXT,
  market_key  TEXT,
  label       TEXT,
  line        REAL,
  side        TEXT,             -- 'over'|'under'
  odds        REAL,
  result      TEXT,             -- 'W'|'L'|null
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS props_unique ON props(date, player, market_key, side);

-- ── 7. GAME RESULTS ───────────────────────────────────────────────────────────
-- Single source of truth for all game outcomes
-- DK scraper writes scheduled/live, ESPN resolver fills in finals
CREATE TABLE IF NOT EXISTS game_results (
  game_id       TEXT PRIMARY KEY,  -- dk_{eventId}
  sport         TEXT NOT NULL,
  home          TEXT NOT NULL,
  away          TEXT NOT NULL,
  home_score    INTEGER,
  away_score    INTEGER,
  status        TEXT,              -- 'scheduled'|'live'|'final'
  winner        TEXT,              -- winning team name, null until final
  commence_time TEXT,
  date          TEXT,              -- YYYY-MM-DD
  updated_at    TEXT DEFAULT (datetime('now'))
);
