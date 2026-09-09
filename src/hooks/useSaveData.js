// ─── SERVER ───────────────────────────────────────────────────────────────────

export const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
// STEP MARKER: step 3/6 in progress — file 1 of 5 (useSaveData.js) done.
// Next: App.jsx (2 occurrences), FavsTab.jsx, HateWatchTab.jsx, checkbetonme.sh.

// ─── RAW SERVER I/O ───────────────────────────────────────────────────────────

export async function loadAllData() {
  try {
    const res = await fetch(`${SERVER}/data`)
    return await res.json()
  } catch { return {} }
}

async function putJson(path, body) {
  try {
    await fetch(`${SERVER}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) { console.error(`PUT ${path} failed`, e) }
}

// ─── APP STATE ────────────────────────────────────────────────────────────────

export async function loadState() {
  try { const data = await loadAllData(); return data.app || {} }
  catch { return {} }
}

export async function saveState(state) {
  return putJson('/appstate', state)
}

// ─── PREDICTIONS ──────────────────────────────────────────────────────────────

export async function loadPredictions() {
  try { const data = await loadAllData(); return data.predictions || {} }
  catch { return {} }
}

export async function savePredictions(pred, changedDates = null) {
  const entries = changedDates
    ? changedDates.map(d => [d, pred[d]]).filter(([, v]) => v)
    : Object.entries(pred)
  return Promise.all(entries.map(([date, parlay]) => putJson(`/parlays/prediction/${date}`, parlay)))
}

// ─── LAY HISTORY ─────────────────────────────────────────────────────────────

export async function loadLayHistory() {
  try { const data = await loadAllData(); return data.lay || {} }
  catch { return {} }
}

export async function saveLayHistory(lay, changedDates = null) {
  const entries = changedDates
    ? changedDates.map(d => [d, lay[d]]).filter(([, v]) => v)
    : Object.entries(lay)
  return Promise.all(entries.map(([date, parlay]) => putJson(`/parlays/lay/${date}`, parlay)))
}

// ─── DOG PICKS ────────────────────────────────────────────────────────────────

export async function loadDogState() {
  try { const data = await loadAllData(); return data.dog || {} }
  catch { return {} }
}

export async function saveDogStateServer(state) {
  if (!state?.picks) return
  return Promise.all(Object.entries(state.picks).map(([date, pick]) => putJson(`/picks/dog/${date}`, pick)))
}

// ─── PROP PICKS ───────────────────────────────────────────────────────────────

export async function loadPropPick() {
  try { const data = await loadAllData(); return data.propPick || {} }
  catch { return {} }
}

export async function savePropPick(picks) {
  return Promise.all(Object.entries(picks).map(([date, dateProps]) => putJson(`/props/${date}`, dateProps)))
}

// ─── DOUBLE LOCK O/U ─────────────────────────────────────────────────────────

export async function loadOuPick() {
  try { const data = await loadAllData(); return data.ouPick || {} }
  catch { return {} }
}

export async function saveOuPick(picks) {
  return Promise.all(Object.entries(picks).map(([date, pick]) => putJson(`/picks/ou/${date}`, pick)))
}

// ─── FAV PICK ────────────────────────────────────────────────────────────────

export async function loadFavPick() {
  try { const data = await loadAllData(); return data.favPick || {} }
  catch { return {} }
}

export async function saveFavPick(picks) {
  return Promise.all(Object.entries(picks).map(([date, pick]) => putJson(`/picks/fav/${date}`, pick)))
}

// ─── SUPER DOG PICKS ──────────────────────────────────────────────────────────

export async function loadSuperDogState() {
  try { const data = await loadAllData(); return data.superdog || {} }
  catch { return {} }
}

export async function saveSuperDogState(state) {
  if (!state?.picks) return
  return Promise.all(Object.entries(state.picks).map(([date, pick]) => putJson(`/picks/superdog/${date}`, pick)))
}

// ─── HATE PICK ───────────────────────────────────────────────────────────────

export async function loadHatePick() {
  try { const data = await loadAllData(); return data.hatePick || {} }
  catch { return {} }
}

export async function saveHatePick(picks) {
  return Promise.all(Object.entries(picks).map(([date, pick]) => putJson(`/picks/hate/${date}`, pick)))
}

// ─── USER PREFS ───────────────────────────────────────────────────────────────

export async function loadPrefs() {
  try { const data = await loadAllData(); return data.prefs || {} }
  catch { return {} }
}

export async function savePrefs(prefs) {
  return putJson('/prefs', prefs)
}

// ─── IN-MEMORY CACHE (replaces localStorage) ──────────────────────────────────
// Odds and ESPN data cached in memory for the session only.

const _memCache = new Map()
const _espnCache = new Map()

export function getCachedData(key) {
  const entry = _memCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > 8 * 60 * 60 * 1000) { _memCache.delete(key); return null }
  return entry.data
}

export function setCachedData(key, data) {
  _memCache.set(key, { timestamp: Date.now(), data })
}

export function getCachedOdds() { return getCachedData('oddsCache') }
export function setCachedOdds(data) { setCachedData('oddsCache', data) }

export function getCacheAge() {
  const entry = _memCache.get('oddsCache')
  if (!entry) return null
  const mins = Math.floor((Date.now() - entry.timestamp) / 60000)
  return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`
}

export function getCachedEspnDate(dateStr) {
  const entry = _espnCache.get(dateStr)
  if (!entry) return null
  const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0].replace(/-/g, '')
  if (dateStr === todayStr) {
    if (Date.now() - entry.timestamp > 5 * 60 * 1000) { _espnCache.delete(dateStr); return null }
  } else if (dateStr === yesterdayStr) {
    if (Date.now() - entry.timestamp > 30 * 60 * 1000) { _espnCache.delete(dateStr); return null }
  }
  return entry.events
}

export function setCachedEspnDate(dateStr, events) {
  _espnCache.set(dateStr, { timestamp: Date.now(), events })
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
