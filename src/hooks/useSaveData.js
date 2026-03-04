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

const CACHE_DURATION_MS = 3 * 60 * 60 * 1000

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

// ─── APP STATE (lock picks, coins, streak) ────────────────────────────────────

export async function loadState() {
  try {
    const data = await loadAllData()
    return data.app || {}
  } catch { return {} }
}

export async function saveState(state) {
  try {
    const current = await loadAllData()
    await saveAllData({ ...current, app: state })
  } catch (e) { console.error('saveState failed', e) }
}

// ─── PREDICTIONS ──────────────────────────────────────────────────────────────

export async function loadPredictions() {
  try {
    const data = await loadAllData()
    return data.predictions || {}
  } catch { return {} }
}

export async function savePredictions(pred) {
  try {
    const current = await loadAllData()
    await saveAllData({ ...current, predictions: pred })
  } catch (e) { console.error('savePredictions failed', e) }
}

// ─── LAY HISTORY ─────────────────────────────────────────────────────────────

export async function loadLayHistory() {
  try {
    const data = await loadAllData()
    return data.lay || {}
  } catch { return {} }
}

export async function saveLayHistory(lay) {
  try {
    const current = await loadAllData()
    await saveAllData({ ...current, lay })
  } catch (e) { console.error('saveLayHistory failed', e) }
}

// ─── DOG PICKS ────────────────────────────────────────────────────────────────

export async function loadDogState() {
  try {
    const data = await loadAllData()
    return data.dog || {}
  } catch { return {} }
}

export async function saveDogStateServer(state) {
  try {
    const current = await loadAllData()
    await saveAllData({ ...current, dog: state })
  } catch (e) { console.error('saveDogState failed', e) }
}

// ─── PROP PICKS ───────────────────────────────────────────────────────────────

export async function loadPropPick() {
  try {
    const data = await loadAllData()
    return data.propPick || {}
  } catch { return {} }
}

export async function savePropPick(picks) {
  try {
    const current = await loadAllData()
    await saveAllData({ ...current, propPick: picks })
  } catch (e) { console.error('savePropPick failed', e) }
}

// ─── DOUBLE LOCK O/U ─────────────────────────────────────────────────────────

export async function loadOuPick() {
  try {
    const data = await loadAllData()
    return data.ouPick || {}
  } catch { return {} }
}

export async function saveOuPick(picks) {
  try {
    const current = await loadAllData()
    await saveAllData({ ...current, ouPick: picks })
  } catch (e) { console.error('saveOuPick failed', e) }
}

// ─── ODDS CACHE (localStorage) ───────────────────────────────────────────────

export function getCachedOdds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ODDS_CACHE)
    if (!raw) return null
    const { timestamp, data } = JSON.parse(raw)
    if (Date.now() - timestamp < CACHE_DURATION_MS) return data
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
    if (Date.now() - timestamp < CACHE_DURATION_MS) return data
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