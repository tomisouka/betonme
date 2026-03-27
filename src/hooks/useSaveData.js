// ─── SERVER ───────────────────────────────────────────────────────────────────

export const SERVER = 'http://127.0.0.1:3001'

// ─── STORAGE KEYS (localStorage — cache only) ────────────────────────────────

export const STORAGE_KEYS = {
  APP: 'lockapp',
  ODDS_CACHE: 'oddsCache',
  PROPS_CACHE: 'propsCache',
  PROPS_DAY_CACHE: 'propsDayCache',
  STATS_CACHE: 'statsCache',
  PREDICTIONS: 'predictionsHistory',
  LAY: 'layHistory',
}

const CACHE_DURATION_MS = 8 * 60 * 60 * 1000  // 8h — kept for legacy compatibility

// ─── RAW SERVER I/O ───────────────────────────────────────────────────────────

export async function loadAllData() {
  try {
    const res = await fetch(`${SERVER}/data`)
    return await res.json()
  } catch { return {} }
}

export async function saveAllData(data) {
  try {
    await fetch(`${SERVER}/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (e) { console.error('saveAllData failed', e) }
}

// ─── WRITE QUEUE ──────────────────────────────────────────────────────────────
// Serializes all saves so they run one at a time.
// Each job: reads current data, merges its key, writes back.
// Next job doesn't start until the previous POST fully resolves —
// so no two saves ever read the same stale snapshot and stomp each other.

let _queue = Promise.resolve()

function enqueueWrite(key, value) {
  _queue = _queue.then(async () => {
    try {
      const current = await loadAllData()
      await saveAllData({ ...current, [key]: value })
    } catch (e) { console.error(`enqueueWrite(${key}) failed`, e) }
  })
  return _queue
}

// ─── APP STATE (lock picks, coins, streak) ────────────────────────────────────

export async function loadState() {
  try {
    const data = await loadAllData()
    return data.app || {}
  } catch { return {} }
}

export async function saveState(state) {
  return enqueueWrite('app', state)
}

// ─── PREDICTIONS ──────────────────────────────────────────────────────────────

export async function loadPredictions() {
  try {
    const data = await loadAllData()
    return data.predictions || {}
  } catch { return {} }
}

export async function savePredictions(pred) {
  return enqueueWrite('predictions', pred)
}

// ─── LAY HISTORY ─────────────────────────────────────────────────────────────

export async function loadLayHistory() {
  try {
    const data = await loadAllData()
    return data.lay || {}
  } catch { return {} }
}

export async function saveLayHistory(lay) {
  return enqueueWrite('lay', lay)
}

// ─── DOG PICKS ────────────────────────────────────────────────────────────────

export async function loadDogState() {
  try {
    const data = await loadAllData()
    return data.dog || {}
  } catch { return {} }
}

export async function saveDogStateServer(state) {
  return enqueueWrite('dog', state)
}

// ─── PROP PICKS ───────────────────────────────────────────────────────────────

export async function loadPropPick() {
  try {
    const data = await loadAllData()
    return data.propPick || {}
  } catch { return {} }
}

export async function savePropPick(picks) {
  return enqueueWrite('propPick', picks)
}

// ─── DOUBLE LOCK O/U ─────────────────────────────────────────────────────────

export async function loadOuPick() {
  try {
    const data = await loadAllData()
    return data.ouPick || {}
  } catch { return {} }
}

export async function saveOuPick(picks) {
  return enqueueWrite('ouPick', picks)
}

// ─── ODDS CACHE (localStorage) ───────────────────────────────────────────────

export function getCachedOdds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ODDS_CACHE)
    if (!raw) return null
    const { timestamp, data } = JSON.parse(raw)
    // 8-hour TTL = 3 fetches/day (450 credits/month)
    if (Date.now() - timestamp < 8 * 60 * 60 * 1000) return data
    return null
  } catch { return null }
}

export function setCachedOdds(data) {
  localStorage.setItem(STORAGE_KEYS.ODDS_CACHE, JSON.stringify({ timestamp: Date.now(), data }))
}

export function getCacheAge() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ODDS_CACHE)
    if (!raw) return null
    const { timestamp } = JSON.parse(raw)
    const mins = Math.floor((Date.now() - timestamp) / 60000)
    return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`
  } catch { return null }
}

export function getCachedData(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const { timestamp, data } = JSON.parse(raw)
    // 8-hour TTL = 3 fetches/day (450 credits/month)
    if (Date.now() - timestamp < 8 * 60 * 60 * 1000) return data
    return null
  } catch { return null }
}

export function setCachedData(storageKey, data) {
  localStorage.setItem(storageKey, JSON.stringify({ timestamp: Date.now(), data }))
}

// ─── ONE-TIME localStorage MIGRATION ─────────────────────────────────────────
// Runs once on startup: moves any existing browser-side pick data to the server.
// After migration the localStorage keys are removed so this only fires once.

export async function migrateLocalStorageToServer() {
  try {
    const current = await loadAllData()
    let dirty = false

    const rawDog = localStorage.getItem('dogapp')
    if (rawDog && !current.dog) {
      try { current.dog = JSON.parse(rawDog); dirty = true } catch {}
    }
    const rawProp = localStorage.getItem('propPick')
    if (rawProp && !current.propPick) {
      try { current.propPick = JSON.parse(rawProp); dirty = true } catch {}
    }
    const rawOU = localStorage.getItem('doubleLockOU')
    if (rawOU && !current.ouPick) {
      try { current.ouPick = JSON.parse(rawOU); dirty = true } catch {}
    }

    if (dirty) {
      await saveAllData(current)
      localStorage.removeItem('dogapp')
      localStorage.removeItem('propPick')
      localStorage.removeItem('doubleLockOU')
      console.log('[BetOnMe] localStorage migration complete')
    }
  } catch (e) { console.error('Migration failed', e) }
}
// ─── ESPN DATE CACHE ──────────────────────────────────────────────────────────
// Caches ESPN scoreboard responses keyed by date string (YYYYMMDD)
// Historical dates never change once completed — cache indefinitely
// Today's date uses 8h TTL

export function getCachedEspnDate(dateStr) {
  try {
    const raw = localStorage.getItem(`espn_${dateStr}`)
    if (!raw) return null
    const { timestamp, events } = JSON.parse(raw)
    const isToday = dateStr === new Date().toISOString().split('T')[0].replace(/-/g, '')
    if (isToday && Date.now() - timestamp > 8 * 60 * 60 * 1000) return null
    // Historical dates: cache forever
    return events
  } catch { return null }
}

export function setCachedEspnDate(dateStr, events) {
  try {
    localStorage.setItem(`espn_${dateStr}`, JSON.stringify({ timestamp: Date.now(), events }))
  } catch {}
}

export async function fetchEspnDate(sport, dateStr) {
  const cached = getCachedEspnDate(dateStr)
  if (cached) return cached
  const endpoints = { MLB: 'baseball/mlb', NFL: 'football/nfl', NBA: 'basketball/nba' }
  const endpoint = endpoints[sport]
  if (!endpoint) return []
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${endpoint}/scoreboard?dates=${dateStr}`)
    const data = await res.json()
    const events = data.events || []
    setCachedEspnDate(dateStr, events)
    return events
  } catch { return [] }
}
