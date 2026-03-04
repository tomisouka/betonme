import React, { useState, useEffect } from 'react'
import { getSportsInSeason, getTodayKey, calcPayout } from './utils/odds.js'
import { SERVER, STORAGE_KEYS, loadAllData, saveAllData, loadState, saveState, loadDogState, saveDogStateServer, loadPropPick, savePropPick, loadPredictions, savePredictions, loadLayHistory, saveLayHistory, getCachedOdds, setCachedOdds, getCacheAge, getCachedData, setCachedData, migrateLocalStorageToServer } from './hooks/useSaveData.js'
import GamesTab from './tabs/GamesTab.jsx'
import LockTab from './tabs/LockTab.jsx'
import DogTab from './tabs/DogTab.jsx'
import ParlaysTab from './tabs/ParlaysTab.jsx'
import PropsTab from './tabs/PropsTab.jsx'
import MediaTab from './tabs/MediaTab.jsx'
import LiveTab from './tabs/LiveTab.jsx'

const API_KEY = '9556a1b199876f898bdc45023a854ed2'

// ─── EXTERNAL API KEYS ────────────────────────────────────────────────────────
const TANK01_KEY = '96524dc98fmsh11a666178d0c514p12157ajsnd21a47160d69'

// ─── TANK01 PROPS FETCHER ─────────────────────────────────────────────────────
const TANK01_SPORT_ENDPOINTS = {
  NBA: 'https://tank01-fantasy-stats.p.rapidapi.com/getNBABettingOdds',
  NFL: 'https://tank01-fantasy-stats.p.rapidapi.com/getNFLBettingOdds',
  MLB: 'https://tank01-fantasy-stats.p.rapidapi.com/getMLBBettingOdds',
}

async function fetchAndCacheProps() {
  const sports = getSportsInSeason()
  const sportLabels = sports.map(s => s.label)
  const cached = getCachedData(STORAGE_KEYS.PROPS_CACHE) || {}

  for (const label of sportLabels) {
    const endpoint = TANK01_SPORT_ENDPOINTS[label]
    if (!endpoint) continue
    if (cached[label]?.timestamp && Date.now() - cached[label].timestamp < 3 * 60 * 60 * 1000) {
      console.log(`[Props] ${label} cache fresh, skipping`)
      continue
    }
    try {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
      const res = await fetch(`${endpoint}?gameDate=${today}`, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': TANK01_KEY,
          'x-rapidapi-host': endpoint.split('/')[2],
        }
      })
      const data = await res.json()
      cached[label] = { timestamp: Date.now(), data }
      console.log(`[Props] ${label} fetched and cached`, data)
    } catch (e) {
      console.error(`[Props] ${label} fetch failed`, e)
    }
  }
  setCachedData(STORAGE_KEYS.PROPS_CACHE, cached)
}

async function fetchAndCachePlayerStats() {
  const BALLDONTLIE_KEY = null
  if (!BALLDONTLIE_KEY) {
    console.log('[Stats] balldontlie skipped — no API key configured')
    return
  }
  const cached = getCachedData(STORAGE_KEYS.STATS_CACHE)
  if (cached) { console.log('[Stats] Cache fresh, skipping'); return }
  try {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch(`https://api.balldontlie.io/v1/games?dates[]=${today}&per_page=20`, {
      headers: { 'Authorization': BALLDONTLIE_KEY }
    })
    const data = await res.json()
    setCachedData(STORAGE_KEYS.STATS_CACHE, data)
    console.log('[Stats] balldontlie games cached', data)
  } catch (e) {
    console.error('[Stats] balldontlie fetch failed', e)
  }
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('lock')
  const [allGames, setAllGames] = useState([])
  const [loading, setLoading] = useState(false)
  const [cacheAge, setCacheAge] = useState(getCacheAge)
  const [devOpen, setDevOpen] = useState(false)
  const [devPassword, setDevPassword] = useState('')
  const [devUnlocked, setDevUnlocked] = useState(false)
  const [devMsg, setDevMsg] = useState('')
  const [devPending, setDevPending] = useState(null)
  const [todayLock, setTodayLock] = useState(null)
  const [todayDog, setTodayDog] = useState(null)

  async function refreshTodayLock() {
    const s = await loadState()
    setTodayLock(s.picks?.[getTodayKey()] || null)
  }

  async function refreshTodayDog() {
    try {
      const s = await loadDogState()
      setTodayDog(s.picks?.[getTodayKey()] || null)
    } catch { setTodayDog(null) }
  }

  const fetchOdds = async (force = false) => {
    if (!force) {
      const cached = getCachedOdds()
      if (cached) { setAllGames(cached); setCacheAge(getCacheAge()); return }
    }
    setLoading(true)
    const sports = getSportsInSeason()
    const results = []
    for (const sport of sports) {
      try {
        const res = await fetch(`https://api.the-odds-api.com/v4/sports/${sport.key}/odds/?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&bookmakers=betonlineag&oddsFormat=american`)
        const data = await res.json()
        if (Array.isArray(data)) data.forEach(g => results.push({ ...g, sportLabel: sport.label }))
      } catch (e) { }
    }
    setCachedOdds(results)
    setAllGames(results)
    setCacheAge(getCacheAge())
    setLoading(false)
  }

  useEffect(() => {
    migrateLocalStorageToServer()
    fetchOdds()
    refreshTodayLock()
    refreshTodayDog()
    fetchAndCacheProps()
    fetchAndCachePlayerStats()
  }, [])

  async function devAction(action, value) {
    const s = await loadState()
    const todayKey = getTodayKey()
    switch (action) {
      case 'resetLock':
        if (s.picks?.[todayKey]) {
          s.coins = (s.coins || 0) + (s.picks[todayKey].stake || 0)
          delete s.picks[todayKey]
          setDevMsg("✅ Today's lock reset.")
        } else { setDevMsg('⚠ No lock today.') }
        break
      case 'resetDog': {
        const dog = await loadDogState()
        if (dog.picks?.[todayKey]) {
          delete dog.picks[todayKey]
          await saveDogStateServer(dog)
          setDevMsg("✅ Today's dog reset.")
        } else { setDevMsg('⚠ No dog pick today.') }
        return
      }
      case 'setResult':
        if (s.picks?.[todayKey]) {
          s.picks[todayKey].result = value
          s.streak = [...(s.streak || []), value]
          s.streakDates = [...(s.streakDates || []), todayKey]
          if (value === 'W') s.coins = (s.coins || 0) + calcPayout(s.picks[todayKey].odds, s.picks[todayKey].stake)
          setDevMsg(`✅ Set to ${value}.`)
        } else { setDevMsg('⚠ No pick today.') }
        break
      case 'resetProp': {
        const propPick = await loadPropPick()
        if (propPick[todayKey]) {
          delete propPick[todayKey]
          await savePropPick(propPick)
          setDevMsg("✅ Today's prop picks reset.")
        } else { setDevMsg('⚠ No prop picks today.') }
        return
      }
      case 'resetPredictions': {
        const pred = await loadPredictions()
        const lay = await loadLayHistory()
        delete pred[todayKey]
        delete lay[todayKey]
        await savePredictions(pred)
        await saveLayHistory(lay)
        setDevMsg("✅ Today's predictions + lay reset.")
        return
      }
      case 'resetAll':
        await saveAllData({})
        localStorage.removeItem(STORAGE_KEYS.ODDS_CACHE)
        setDevMsg('✅ Wiped. Refreshing...')
        setTimeout(() => window.location.reload(), 1000)
        return
      case 'restoreBackup': {
        try {
          const res = await fetch(`${SERVER}/restore-backup`, { method: 'POST' })
          if (res.ok) { setDevMsg('✅ Backup restored. Refreshing...'); setTimeout(() => window.location.reload(), 1000) }
          else { const e = await res.json(); setDevMsg(`⚠ ${e.error || 'No backup found'}`) }
        } catch { setDevMsg('⚠ Could not reach server') }
        return
      }
      case 'clearHistory':
        s.picks = {}
        s.streak = []
        s.streakDates = []
        setDevMsg('✅ History cleared.')
        break
    }
    await saveState(s)
  }

  const TABS = [
    ['odds',   '🎮 Games'],
    ['lock',   '🔒 Lock'],
    ['dogs',   '🐕 Dogs'],
    ['parlays','🎰 Parlays'],
    ['props',  '🎲 Props'],
    ['media',  '📺 Media'],
    ['live',   '⚡ Live'],
  ]

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', background: '#0f0f0f', minHeight: '100vh', color: 'white', maxWidth: '960px', margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 0.25rem' }}>🎰 BetOnMe</h1>
      <p style={{ color: '#444', marginBottom: '1.5rem', fontSize: '0.85rem' }}>Daily lock tracker</p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid #1a1a1a', paddingBottom: '1rem' }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '0.5rem 1.25rem',
            background: tab === key ? '#fff' : 'transparent',
            color: tab === key ? '#000' : '#555',
            border: tab === key ? 'none' : '1px solid #2a2a2a',
            borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'odds'    && <GamesTab allGames={allGames} loading={loading} onRefresh={() => fetchOdds(true)} cacheAge={cacheAge} />}
      {tab === 'lock'    && <LockTab allGames={allGames} loading={loading} onRefresh={() => fetchOdds(true)} cacheAge={cacheAge} onLockChange={refreshTodayLock} />}
      {tab === 'dogs'    && <DogTab allGames={allGames} loading={loading} onDogChange={refreshTodayDog} />}
      {tab === 'parlays' && <ParlaysTab allGames={allGames} loading={loading} todayLock={todayLock} todayDog={todayDog} onLockChange={refreshTodayLock} />}
      {tab === 'props'   && <PropsTab todayLock={todayLock} allGames={allGames} />}
      {tab === 'media'   && <MediaTab />}
      {tab === 'live'    && <LiveTab todayLock={todayLock} todayDog={todayDog} />}

      <div style={{ marginTop: '4rem', paddingBottom: '2rem', textAlign: 'center' }}>
        <button onClick={() => { setDevOpen(true); setDevUnlocked(false); setDevPassword(''); setDevMsg(''); setDevPending(null) }} style={{
          background: '#1a1a1a', border: '1px solid #444', color: '#888',
          padding: '0.6rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold',
        }}>⚙ Dev Panel</button>
      </div>

      {devOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: '14px', padding: '2rem', width: '100%', maxWidth: '380px' }}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '1rem', color: '#888' }}>⚙ Dev Panel</h2>
            {!devUnlocked ? (
              <>
                <input type="password" placeholder="Password" value={devPassword}
                  onChange={e => setDevPassword(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (devPassword === 'Jesiah') setDevUnlocked(true)
                      else setDevMsg('❌ Wrong password')
                    }
                  }}
                  style={{ width: '100%', padding: '0.75rem', background: '#0f0f0f', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: '0.75rem' }}
                  autoFocus
                />
                {devMsg && <p style={{ color: '#ff4444', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{devMsg}</p>}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={() => setDevOpen(false)} style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: '#888', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={() => { if (devPassword === 'Jesiah') setDevUnlocked(true); else setDevMsg('❌ Wrong password') }}
                    style={{ flex: 1, padding: '0.75rem', background: '#222', border: '1px solid #444', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>Enter</button>
                </div>
              </>
            ) : devPending ? (
              <>
                <div style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.25rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠</div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '0.35rem' }}>{devPending.label}</div>
                  <div style={{ color: '#555', fontSize: '0.78rem' }}>Cannot be undone.</div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={() => { setDevPending(null); setDevMsg('') }} style={{ flex: 1, padding: '0.85rem', background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: '#888', cursor: 'pointer', fontWeight: 'bold' }}>Discard</button>
                  <button onClick={async () => { await devAction(devPending.action, devPending.value); setDevPending(null) }} style={{ flex: 1, padding: '0.85rem', background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '8px', color: '#ff4444', cursor: 'pointer', fontWeight: 'bold' }}>Confirm</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                  <button onClick={() => setDevPending({ action: 'resetLock', label: "Reset Today's Lock" })} style={{ padding: '0.75rem', background: '#1a1a2a', border: '1px solid #4444aa', borderRadius: '8px', color: '#8888ff', cursor: 'pointer', fontWeight: 'bold' }}>🔄 Reset Today's Lock</button>
                  <button onClick={() => setDevPending({ action: 'resetDog', label: "Reset Today's Dog" })} style={{ padding: '0.75rem', background: '#1a1a2a', border: '1px solid #4444aa', borderRadius: '8px', color: '#8888ff', cursor: 'pointer', fontWeight: 'bold' }}>🔄 Reset Today's Dog</button>
                  <button onClick={() => setDevPending({ action: 'resetPredictions', label: "Reset Today's Predictions + Lay" })} style={{ padding: '0.75rem', background: '#1a1a2a', border: '1px solid #4444aa', borderRadius: '8px', color: '#8888ff', cursor: 'pointer', fontWeight: 'bold' }}>🔄 Reset Today's Predictions + Lay</button>
                  <button onClick={() => setDevPending({ action: 'resetProp', label: "Reset Today's Props" })} style={{ padding: '0.75rem', background: '#1a1a2a', border: '1px solid #4444aa', borderRadius: '8px', color: '#8888ff', cursor: 'pointer', fontWeight: 'bold' }}>🔄 Reset Today's Props</button>
                  <button onClick={() => window.open(`${SERVER}/export`, '_blank')} style={{ padding: '0.75rem', background: '#1a2a1a', border: '1px solid #44aa44', borderRadius: '8px', color: '#88ff88', cursor: 'pointer', fontWeight: 'bold' }}>💾 Export savedata.json</button>
                  <button onClick={() => setDevPending({ action: 'restoreBackup', label: 'Restore Last Backup' })} style={{ padding: '0.75rem', background: '#2a1a00', border: '1px solid #aa7700', borderRadius: '8px', color: '#ffaa44', cursor: 'pointer', fontWeight: 'bold' }}>↩ Restore Last Backup</button>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={() => setDevPending({ action: 'setResult', value: 'W', label: "Force WIN on today's lock" })} style={{ flex: 1, padding: '0.75rem', background: '#0a2a1a', border: '1px solid #00ff88', borderRadius: '8px', color: '#00ff88', cursor: 'pointer', fontWeight: 'bold' }}>✅ Force WIN</button>
                    <button onClick={() => setDevPending({ action: 'setResult', value: 'L', label: "Force LOSS on today's lock" })} style={{ flex: 1, padding: '0.75rem', background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '8px', color: '#ff4444', cursor: 'pointer', fontWeight: 'bold' }}>❌ Force LOSS</button>
                  </div>
                  <button onClick={() => setDevPending({ action: 'clearHistory', label: 'Clear all history & streak' })} style={{ padding: '0.75rem', background: '#1a1a1a', border: '1px solid #555', borderRadius: '8px', color: '#aaa', cursor: 'pointer', fontWeight: 'bold' }}>🗑 Clear History & Streak</button>
                  <button onClick={() => setDevPending({ action: 'resetAll', label: 'Reset EVERYTHING — wipe all data' })} style={{ padding: '0.75rem', background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '8px', color: '#ff4444', cursor: 'pointer', fontWeight: 'bold' }}>⚠ Reset Everything</button>
                </div>
                {devMsg && <p style={{ color: '#00ff88', fontSize: '0.85rem', marginBottom: '1rem' }}>{devMsg}</p>}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={() => { setDevOpen(false); setDevPending(null) }} style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: '#888', cursor: 'pointer', fontWeight: 'bold' }}>Exit</button>
                  <button onClick={() => { setDevOpen(false); setDevPending(null); window.location.reload() }} style={{ flex: 1, padding: '0.75rem', background: '#111', border: '1px solid #444', borderRadius: '8px', color: '#aaa', cursor: 'pointer', fontWeight: 'bold' }}>Exit & Reload</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
