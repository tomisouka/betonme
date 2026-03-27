import React, { useState, useEffect } from 'react'
import { getSportsInSeason, getTodayKey, calcPayout, fetchGamesFromEspn } from './utils/odds.js'
import { SERVER, STORAGE_KEYS, loadAllData, saveAllData, loadState, saveState, loadDogState, saveDogStateServer, loadPropPick, savePropPick, loadPredictions, savePredictions, loadLayHistory, saveLayHistory, getCachedOdds, setCachedOdds, getCacheAge, getCachedData, setCachedData, migrateLocalStorageToServer } from './hooks/useSaveData.js'
import GamesTab from './tabs/GamesTab.jsx'
import LockTab from './tabs/LockTab.jsx'
import DogTab from './tabs/DogTab.jsx'
import ParlaysTab from './tabs/ParlaysTab.jsx'
import PastLayTab from './tabs/PastLayTab.jsx'
import PropsTab from './tabs/PropsTab.jsx'
import MediaTab from './tabs/MediaTab.jsx'
import LiveTab from './tabs/LiveTab.jsx'
import WinsTab from './tabs/WinsTab.jsx'

const API_KEY = '9556a1b199876f898bdc45023a854ed2'

// ─── EXTERNAL API KEYS ────────────────────────────────────────────────────────
// Tank01 props fetcher removed — props handled by PropsTab via the-odds-api

// balldontlie stats fetcher removed — no key configured

// ─── ROOT ─────────────────────────────────────────────────────────────────────
// Shared 1h quota cache so both status components read same value
async function fetchOddsApiQuota(apiKey) {
  try {
    const raw = localStorage.getItem('oddsApiQuota')
    if (raw) {
      const cached = JSON.parse(raw)
      if (Date.now() - cached.ts < 60 * 60 * 1000) return cached
    }
  } catch {}
  try {
    const r = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${apiKey}`)
    const remaining = r.headers.get('x-requests-remaining')
    const used = r.headers.get('x-requests-used')
    if (remaining !== null) {
      const result = { remaining: parseInt(remaining), used: parseInt(used), total: 500, ts: Date.now() }
      localStorage.setItem('oddsApiQuota', JSON.stringify(result))
      return result
    }
  } catch {}
  return null
}

// ─── API STATUS BAR (persistent, shown on all tabs) ──────────────────────────
function ApiStatusBar({ espnOk: espnOkProp = null }) {
  const [quota, setQuota] = React.useState(null)
  const [espnOk, setEspnOk] = React.useState(espnOkProp)
  const [serverOk, setServerOk] = React.useState(null)

  // Sync ESPN status from allGames prop (no separate fetch needed)
  React.useEffect(() => { setEspnOk(espnOkProp) }, [espnOkProp])

  React.useEffect(() => {
    async function check() {
      // Server ping
      try {
        await fetch('http://127.0.0.1:3001/ping')
        setServerOk(true)
      } catch { setServerOk(false) }

      // Odds API quota — 1h cached
      const q = await fetchOddsApiQuota(API_KEY)
      if (q) setQuota(q)
    }
    check()
  }, [])

  const quotaColor = quota === null ? '#444'
    : quota.remaining > 100 ? '#00ff88'
    : quota.remaining > 30  ? '#ffaa44'
    : '#ff4444'

  const dot = (ok) => (
    <span style={{ color: ok === null ? '#333' : ok ? '#00ff88' : '#ff4444', fontSize: '0.6rem' }}>●</span>
  )

  const s = (label, color='#444') => (
    <span style={{ color, fontSize: '0.68rem' }}>{label}</span>
  )

  return (
    <div style={{
      margin: '2rem 0 0',
      padding: '0.65rem 0.9rem',
      background: '#111',
      border: '1px solid #1e1e1e',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.35rem',
    }}>
      <div style={{ fontSize: '0.6rem', color: '#333', fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.1rem' }}>DATA SOURCES</div>

      {/* Row: what each piece uses */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {s('Games / Scores', '#555')}
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {dot(espnOk)}{s('ESPN (free)', espnOk ? '#4c9be8' : '#ff4444')}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {s('Game Lines / Odds', '#555')}
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {dot(espnOk)}{s('DraftKings (free · dk_scraper)', espnOk ? '#00ff88' : '#ff4444')}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {s('Player Props', '#555')}
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {dot(quota !== null)}{s('the-odds-api · DraftKings', quota !== null ? '#8888ff' : '#ff4444')}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {s('App Data', '#555')}
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {dot(serverOk)}{s('Local · savedata.json', serverOk ? '#00ff88' : '#ff4444')}
          </span>
        </div>
      </div>

      {/* Credits */}
      <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: '0.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {s('the-odds-api credits', '#444')}
        <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: quotaColor }}>
          {quota === null ? 'checking...' : `${quota.remaining} / 500 left this month`}
        </span>
      </div>
    </div>
  )
}

// ─── API STATUS PANEL (full detail, shown in Dev Panel) ──────────────────────
function ApiStatusPanel({ espnOk: espnOkProp = null }) {
  const [quota, setQuota] = React.useState(null)
  const [espnOk, setEspnOk] = React.useState(espnOkProp)
  const [serverOk, setServerOk] = React.useState(null)
  const [dataDir, setDataDir] = React.useState(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => { setEspnOk(espnOkProp) }, [espnOkProp])

  React.useEffect(() => {
    async function check() {
      setLoading(true)

      // 1. Check server
      try {
        const r = await fetch('http://127.0.0.1:3001/ping')
        const d = await r.json()
        setServerOk(true)
        setDataDir(d.dataDir)
      } catch { setServerOk(false) }

      // 2. ESPN status from prop — no fetch needed
      // 3. Odds API quota — 1h cached
      const q = await fetchOddsApiQuota(API_KEY)
      if (q) setQuota(q)

      setLoading(false)
    }
    check()
  }, [])

  const row = (label, value, color = '#aaa') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #1a1a1a' }}>
      <span style={{ color: '#555', fontSize: '0.78rem' }}>{label}</span>
      <span style={{ color, fontSize: '0.78rem', fontWeight: 'bold' }}>{value}</span>
    </div>
  )

  const quotaPct = quota ? Math.round((quota.remaining / quota.total) * 100) : null
  const quotaColor = quotaPct === null ? '#555' : quotaPct > 50 ? '#00ff88' : quotaPct > 20 ? '#ffaa44' : '#ff4444'

  return (
    <div style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '0.7rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>📡 API STATUS</div>
      {loading ? (
        <div style={{ color: '#444', fontSize: '0.78rem' }}>Checking...</div>
      ) : (
        <>
          {row('Save Server', serverOk ? '✓ Online' : '✗ Offline', serverOk ? '#00ff88' : '#ff4444')}
          {serverOk && dataDir && row('Data Dir', dataDir.replace('/home/kaneki', '~'), '#555')}
          {row('Games & Scores', espnOk ? '✓ ESPN (free · unlimited)' : '✗ ESPN unreachable', espnOk ? '#00ff88' : '#ff4444')}
          {row('Game Lines / Odds', espnOk ? '✓ DraftKings (free · dk_scraper.py)' : '✗ DK scraper not running', espnOk ? '#00ff88' : '#ff4444')}
          {row('Odds Movement', '✓ DraftKings · every 30min', '#00ff88')}
          {row('Player Props', quota ? `the-odds-api · DraftKings · ${quota.remaining}/500 credits` : '✗ Unreachable', quotaColor)}
          {quota && row('Props resets', 'April 1st', '#555')}
          {row('App Data', serverOk ? '✓ savedata.json · local' : '✗ Server offline', serverOk ? '#00ff88' : '#ff4444')}
        </>
      )}
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('lock')
  const [allGames, setAllGames] = useState([])
  const [loading, setLoading] = useState(false)
  const [cacheAge, setCacheAge] = useState(getCacheAge)
  const [scraping, setScraping] = useState(false)
  const [lastScrape, setLastScrape] = useState(null)
  const [devOpen, setDevOpen] = useState(false)
  const [devPassword, setDevPassword] = useState('')
  const [devUnlocked, setDevUnlocked] = useState(false)
  const [devMsg, setDevMsg] = useState('')
  const [devPending, setDevPending] = useState(null)
  const [todayLock, setTodayLock] = useState(null)
  const [todayDog, setTodayDog] = useState(null)
  const [welcome, setWelcome] = useState(null) // { coins, earnedToday, alreadyClaimed, firstGame }
  const [ticketsOpen, setTicketsOpen] = useState(false)

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
      if (cached) { setAllGames(cached); setCacheAge(getCacheAge()); return cached }
    }
    setLoading(true)
    // Use ESPN for game list — free, unlimited, no API credits used
    // the-odds-api credits are reserved for props and lock odds only
    try {
      const results = await fetchGamesFromEspn()
      setCachedOdds(results)
      setAllGames(results)
      setCacheAge(getCacheAge())
      console.log(`[ESPN] ${results.length} games loaded (0 API credits used)`)
    } catch (e) {
      console.error('[ESPN] fetch failed', e)
    }
    setLoading(false)
  }

  async function globalRefresh() {
    setScraping(true)
    try {
      await fetch(`${SERVER}/scrape-now`, { method: 'POST' })
      setLastScrape(new Date())
    } catch {}
    await fetchOdds(true)
    setScraping(false)
  }


  async function buildWelcome(games) {
    try {
      const res = await fetch('http://127.0.0.1:3001/data')
      const all = await res.json()
      let s = all.app || {}
      const todayKey = getTodayKey()
      const alreadyClaimed = s.lastCoinDate === todayKey

      // ── Login history tracking ─────────────────────────────────────────────
      // loginDates: sorted array of 'YYYY-MM-DD' strings, one per unique day visited
      const loginDates = Array.isArray(s.loginDates) ? [...s.loginDates] : []
      const alreadyLoggedToday = loginDates.includes(todayKey)
      if (!alreadyLoggedToday) {
        loginDates.push(todayKey)
        loginDates.sort()
        s.loginDates = loginDates
      }
      const totalLoginDays = loginDates.length

      // Days since last visit (0 = same-day reload, 1 = yesterday, etc.)
      const prevDates = loginDates.filter(d => d < todayKey)
      const lastVisitKey = prevDates.length > 0 ? prevDates[prevDates.length - 1] : null
      const daysSinceLastVisit = lastVisitKey
        ? Math.round((new Date(todayKey) - new Date(lastVisitKey)) / 86400000)
        : 0

      // ── Coin grant — 1 per day max, no back-claiming missed days ──────────
      const day = new Date().getDay() // 0=Sun,1=Mon,...,6=Sat
      const earnedToday = day === 6 ? 2 : 1  // Saturday = 2, every other day = 1
      if (!alreadyClaimed) {
        s.coins = (s.coins || 0) + earnedToday
        s.lastCoinDate = todayKey
      }

      // Save if anything changed
      if (!alreadyClaimed || !alreadyLoggedToday) {
        await saveState(s)
      }

      // ── Absence message ────────────────────────────────────────────────────
      let absenceMessage = null
      if (daysSinceLastVisit === 0) {
        absenceMessage = null
      } else if (daysSinceLastVisit === 1) {
        absenceMessage = 'Back at it — you were here yesterday. 🔥'
      } else if (daysSinceLastVisit === 2) {
        absenceMessage = 'Took a day off, huh? Welcome back.'
      } else if (daysSinceLastVisit <= 6) {
        absenceMessage = `You\'ve been gone ${daysSinceLastVisit} days. The lines didn\'t wait for you.`
      } else if (daysSinceLastVisit <= 13) {
        absenceMessage = `A week gone. ${daysSinceLastVisit} days of lines you missed. Let\'s catch up.`
      } else if (daysSinceLastVisit <= 29) {
        absenceMessage = `${daysSinceLastVisit} days away. That\'s almost a month of cold picks. Welcome back.`
      } else {
        absenceMessage = `${daysSinceLastVisit} days. You just ghosted the whole operation. Glad you\'re back.`
      }

      const coins = +((s.coins || 0).toFixed(2))
      const todayGames = (games || []).filter(g => g.commence_time?.startsWith(todayKey))
      todayGames.sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))
      const firstGame = todayGames[0] || null

      setWelcome({ coins, earnedToday, alreadyClaimed, firstGame, totalLoginDays, daysSinceLastVisit, absenceMessage, lastVisitKey })
    } catch {
      // server offline — skip welcome
    }
  }

  useEffect(() => {
    migrateLocalStorageToServer()
    fetchOdds().then(games => buildWelcome(games))
    refreshTodayLock()
    refreshTodayDog()

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
    ['odds',    '🎮 Games'],
    ['lock',    '🔒 Lock'],
    ['dogs',    '🐕 Dogs'],
    ['pastlay', '📋 Past Lays'],
    ['parlays', '🎰 Parlays'],
    ['wins',    '🏆 Wins'],
    ['props',   '🎲 Props'],
    ['media',   '📺 Media'],
    ['live',    '⚡ Live'],
  ]

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 'clamp(1rem, 3vw, 2rem)', background: '#0f0f0f', minHeight: '100vh', color: 'white', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem' }}>🎰 BetOnMe</h1>
          <p style={{ color: '#444', margin: 0, fontSize: '0.85rem' }}>Daily lock tracker</p>
          {lastScrape && <p style={{ color: '#333', margin: '0.15rem 0 0', fontSize: '0.7rem' }}>
            Updated {lastScrape.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>}
        </div>
        <button
          onClick={globalRefresh}
          disabled={scraping}
          style={{
            background: scraping ? '#1a1a1a' : '#1a2a1a',
            border: `1px solid ${scraping ? '#333' : '#00ff8844'}`,
            color: scraping ? '#444' : '#00ff88',
            borderRadius: '8px', padding: '0.5rem 1rem',
            cursor: scraping ? 'not-allowed' : 'pointer',
            fontSize: '0.78rem', fontWeight: 'bold',
            display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}
        >
          {scraping ? '⏳ Refreshing...' : '↺ Refresh'}
        </button>
      </div>

      {welcome && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '1rem' }}>
          <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '400px' }}>

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👋</div>
              <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.3rem' }}>Welcome back</h2>
              <p style={{ color: '#555', fontSize: '0.82rem', margin: '0 0 0.5rem' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              {/* Days logged in badge */}
              <div style={{ display: 'inline-block', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '20px', padding: '0.25rem 0.75rem', fontSize: '0.72rem', color: '#888' }}>
                📅 Day {welcome.totalLoginDays} logged in
              </div>
            </div>

            {/* Absence message / first visit */}
            {welcome.lastVisitKey ? (
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#aaa', textAlign: 'center' }}>
                {welcome.absenceMessage && <div style={{ fontStyle: 'italic', marginBottom: '0.4rem' }}>{welcome.absenceMessage}</div>}
                <div style={{ fontSize: '0.72rem', color: '#555' }}>
                  Last login:{' '}
                  <span style={{ color: '#00ff88', fontWeight: 'bold' }}>
                    {welcome.daysSinceLastVisit === 1
                      ? 'yesterday'
                      : welcome.daysSinceLastVisit === 2
                      ? '2 days ago'
                      : welcome.daysSinceLastVisit < 7
                      ? `${welcome.daysSinceLastVisit} days ago`
                      : welcome.daysSinceLastVisit < 14
                      ? '1 week ago'
                      : welcome.daysSinceLastVisit < 21
                      ? '2 weeks ago'
                      : welcome.daysSinceLastVisit < 30
                      ? '3 weeks ago'
                      : welcome.daysSinceLastVisit < 60
                      ? '1 month ago'
                      : `${Math.floor(welcome.daysSinceLastVisit / 30)} months ago`}
                  </span>
                  {' · '}
                  <span style={{ color: '#555' }}>{new Date(welcome.lastVisitKey + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                </div>
              </div>
            ) : (
              <div style={{ background: '#0a1a0a', border: '1px solid #00ff8822', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#aaa', textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', marginBottom: '0.3rem' }}>🎉</div>
                <div style={{ fontWeight: 'bold', color: '#00ff88', marginBottom: '0.2rem' }}>First time here!</div>
                <div style={{ fontSize: '0.75rem', color: '#555' }}>Your picks start today. Make it count.</div>
              </div>
            )}

            {/* Coin status */}
            <div style={{
              background: welcome.alreadyClaimed ? '#1a1a1a' : '#0a2a1a',
              border: `1px solid ${welcome.alreadyClaimed ? '#2a2a2a' : '#00ff8844'}`,
              borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1rem',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#555', marginBottom: '0.3rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>DAILY COIN</div>
                {welcome.alreadyClaimed ? (
                  <div style={{ color: '#555', fontSize: '0.9rem' }}>Already claimed today ✓</div>
                ) : (
                  <div style={{ color: '#00ff88', fontSize: '0.9rem', fontWeight: 'bold' }}>
                    +{welcome.earnedToday} coin{welcome.earnedToday > 1 ? 's' : ''} waiting {welcome.earnedToday > 1 ? '🎉' : ''}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.72rem', color: '#555', marginBottom: '0.2rem' }}>BALANCE</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#fff' }}>🪙 {welcome.coins}</div>
              </div>
            </div>

            {/* First game of the day */}
            {welcome.firstGame ? (
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.75rem' }}>
                <div style={{ fontSize: '0.72rem', color: '#555', marginBottom: '0.5rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>FIRST GAME TODAY</div>
                <div style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '0.3rem' }}>
                  {welcome.firstGame.away_team} <span style={{ color: '#444', fontWeight: 'normal' }}>@</span> {welcome.firstGame.home_team}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#555', fontSize: '0.78rem' }}>{welcome.firstGame.sportLabel}</span>
                  <span style={{ color: '#888', fontSize: '0.78rem' }}>
                    {new Date(welcome.firstGame.commence_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.75rem', color: '#555', fontSize: '0.85rem' }}>
                No games found for today yet.
              </div>
            )}

            <button
              onClick={() => setWelcome(null)}
              style={{ width: '100%', padding: '0.9rem', background: '#00ff88', border: 'none', borderRadius: '10px', color: '#000', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
            >
              Let's go 🔒
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid #1a1a1a', paddingBottom: '1rem', flexWrap: 'wrap' }}>
        {TABS.map(([key, label]) => {
          const isActive = tab === key
          const isLocked = key === 'lock' && !!todayLock
          const isDogged = key === 'dogs' && !!todayDog
          return (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '0.5rem 1.25rem',
              background: isActive ? '#fff' : isLocked ? '#0a2a1a' : isDogged ? '#1a1200' : 'transparent',
              color: isActive ? '#000' : isLocked ? '#00ff88' : isDogged ? '#ffcc00' : '#555',
              border: isActive ? 'none' : isLocked ? '1px solid #00ff8844' : isDogged ? '1px solid #ffcc0044' : '1px solid #2a2a2a',
              borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
            }}>
              {isLocked && !isActive ? '✅ ' : ''}{isDogged && !isActive ? '🐾 ' : ''}{label}
            </button>
          )
        })}
      </div>

      {tab === 'odds'    && <GamesTab allGames={allGames} loading={loading} onRefresh={() => fetchOdds(true)} cacheAge={cacheAge} />}
      {tab === 'lock'    && <LockTab allGames={allGames} loading={loading} onRefresh={() => fetchOdds(true)} cacheAge={cacheAge} onLockChange={refreshTodayLock} />}
      {tab === 'dogs'    && <DogTab allGames={allGames} loading={loading} onDogChange={refreshTodayDog} todayLock={todayLock} />}
      {tab === 'pastlay' && <PastLayTab />}
      {tab === 'wins'    && <WinsTab />}
      {tab === 'parlays' && <ParlaysTab allGames={allGames} loading={loading} todayLock={todayLock} todayDog={todayDog} onLockChange={refreshTodayLock} />}
      {tab === 'props'   && <PropsTab todayLock={todayLock} allGames={allGames} />}
      {tab === 'media'   && <MediaTab />}
      {tab === 'live'    && <LiveTab todayLock={todayLock} todayDog={todayDog} />}

      {/* ── Persistent API Status Bar ── */}
      <ApiStatusBar espnOk={allGames.length > 0} />

      <div style={{ marginTop: '0.5rem', paddingBottom: '2rem', textAlign: 'center', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
        <button onClick={() => setTicketsOpen(true)} style={{
          background: '#1a1a1a', border: '1px solid #444', color: '#888',
          padding: '0.6rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold',
        }}>🎫 Tickets</button>
        <button onClick={() => { setDevOpen(true); setDevUnlocked(false); setDevPassword(''); setDevMsg(''); setDevPending(null) }} style={{
          background: '#1a1a1a', border: '1px solid #444', color: '#888',
          padding: '0.6rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold',
        }}>⚙ Dev Panel</button>
      </div>

      {ticketsOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, overflowY: 'auto', padding: '2rem 1rem' }}>
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: '14px', padding: '2rem', width: '100%', maxWidth: '560px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1rem', color: '#aaa' }}>🎫 Tickets</h2>
              <button onClick={() => setTicketsOpen(false)} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            {[
              {
                heading: '🔴 Broken',
                color: '#ff4444',
                border: '#ff444433',
                tickets: [
                  { id: 'TICKET-001', tab: 'Live', title: 'Live odds fetch broken', desc: 'the-odds-api free tier has no in-play markets. Re-fetches stale pre-game lines. Fix: investigate /v4/sports/{sport}/events/{eventId}/odds on paid tier, or replace with ESPN live scoreboard and drop odds display.' },
                ]
              },
              {
                heading: '🟡 Incomplete',
                color: '#ffdd44',
                border: '#ffdd4433',
                tickets: [
                  { id: 'TICKET-002', tab: 'Games · Lock', title: 'Game cards missing live scores', desc: '✅ FIXED — ESPN badge now shows live score inline: "🔴 Q3 8:42 · LAL 87 – BOS 91". competitors[].score wired into both GamesTab and LockTab.' },
                  { id: 'TICKET-003', tab: 'Parlays', title: 'Dog leg ordering in Predictions', desc: 'Dog leg can appear anywhere in the slip. Should always be leg 2 (after lock). Needs sort on render.' },
                  { id: 'TICKET-004', tab: 'Parlays', title: 'Dog auto-tag in Predictions', desc: 'Dog pick doesn\'t get isDog: true in predictions slip without re-locking. Fix: check todayDog against legs when building slip.' },
                  { id: 'TICKET-005', tab: 'Parlays', title: 'Individual leg odds on Lay slip', desc: 'Lay slip shows team + result but no per-leg odds. Needs odds stored at lock time and displayed per leg.' },
                  { id: 'TICKET-006', tab: 'Parlays', title: 'Yesterday tab in Predictions', desc: 'No way to view yesterday\'s prediction slip. Add a read-only card above today loading predictions[yesterdayKey].' },
                  { id: 'TICKET-007', tab: 'Media', title: 'Media tab not built', desc: 'Placeholder only. Planned: Discord webhook posts picks on lock, Twitter/X embed from manual URL paste in dev panel.' },
                ]
              },
              {
                heading: '🟢 Needs improvement',
                color: '#00ff88',
                border: '#00ff8833',
                tickets: [
                  { id: 'TICKET-008', tab: 'Dogs', title: 'Dog definition threshold', desc: 'Any ML > 0 qualifies. +101 coin-flips show alongside real dogs. Consider +150 minimum. Could be a dev panel setting.' },
                  { id: 'TICKET-009', tab: 'Games', title: 'Game card 7-day team records', desc: 'No historical context on cards. Needs historical results API (SportsDataIO, ActionNetwork, or paid odds-api tier).' },
                  { id: 'TICKET-010', tab: 'Dogs', title: 'Dog tab 7-day underdog record', desc: 'No straight-up win rate shown per underdog. Same API dependency as TICKET-009.' },
                  { id: 'TICKET-011', tab: 'Props', title: 'Player team color split unreliable', desc: 'Heuristic name split breaks on some matchups. Needs real roster API to map player → team.' },
                ]
              },
              {
                heading: '📋 TODO — In-tab notes',
                color: '#bb88ff',
                border: '#bb88ff33',
                tickets: [
                  { id: 'TODO-001', tab: 'Parlays', title: 'Dog leg ordering', desc: 'Dog of the day leg should always appear as leg 2 (after lock) in the predictions slip.' },
                  { id: 'TODO-002', tab: 'Parlays', title: 'Dog auto-tag in predictions', desc: 'Dog pick should auto-tag isDog: true when picked same day — currently requires re-locking predictions.' },
                  { id: 'TODO-003', tab: 'Parlays', title: 'Game matchup display order', desc: 'Always show away team on left, home team on right (e.g. Hornets vs Celtics).' },
                  { id: 'TODO-004', tab: 'Parlays', title: 'Individual leg odds on lay slip', desc: 'Show per-leg odds on the lay slip so the user can see which leg added the most value.' },
                  { id: 'TODO-005', tab: 'Parlays', title: "Yesterday tab in Predictions", desc: "Add a 'Yesterday' tab inside Predictions showing the user's selections from the previous day." },
                  { id: 'TODO-006', tab: 'Dogs', title: '7-day underdog win record', desc: "Show underdog's last 7-day straight-up win record — needs historical results API." },
                  { id: 'TODO-007', tab: 'Props', title: 'Player team color coordination', desc: 'Fav/dog team color split is unreliable — heuristic player split breaks on some matchups. Needs real roster API.' },
                  { id: 'TODO-008', tab: 'Games', title: '7-day team records on cards', desc: 'Show each team\'s last 7-day ML/spread W/L record per game card — needs historical odds + results API.' },
                  { id: 'TODO-009', tab: 'Media', title: 'Discord + Twitter integration', desc: 'Discord: post to a #picks channel via webhook. Twitter/X: dedicated account posts a pick tweet daily, paste URL into dev panel to render via embed script.' },
                ]
              },
              {
                heading: '⬜ Planned — Server',
                color: '#888',
                border: '#33333399',
                tickets: [
                  { id: 'TICKET-012', tab: 'server.js', title: 'Timestamped backup rotation', desc: 'Only one rolling backup exists. Add node-cron to write daily timestamped snapshots, keep 7 days.' },
                  { id: 'TICKET-013', tab: 'server.js', title: 'POST /import endpoint', desc: '/restore-backup only restores the last rolling backup. Need /import to accept any JSON upload.' },
                  { id: 'TICKET-014', tab: 'server.js', title: 'Server error logging', desc: 'Errors go to console.error only and are lost on restart. Add append-only server.log with timestamps.' },
                  { id: 'TICKET-015', tab: 'savedata.json', title: 'Versioned savedata schema', desc: 'No _version field. Future schema changes have no migration path. Add _version: 1 now.' },
                ]
              },
            ].map(({ heading, color, border, tickets }) => (
              <div key={heading} style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color, marginBottom: '0.6rem', letterSpacing: '0.05em' }}>{heading}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {tickets.map(t => (
                    <div key={t.id} style={{ background: '#1a1a1a', border: `1px solid ${border}`, borderRadius: '8px', padding: '0.85rem 1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.3rem' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.88rem', color: '#ddd' }}>{t.title}</span>
                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, marginLeft: '0.75rem' }}>
                          <span style={{ fontSize: '0.65rem', color: '#555', background: '#111', border: '1px solid #2a2a2a', borderRadius: '4px', padding: '0.1rem 0.4rem' }}>{t.id}</span>
                          <span style={{ fontSize: '0.65rem', color, background: '#111', border: `1px solid ${border}`, borderRadius: '4px', padding: '0.1rem 0.4rem' }}>{t.tab}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#666', lineHeight: '1.45' }}>{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#333', marginBottom: '0.4rem', fontWeight: 'bold' }}>✅ RESOLVED</div>
              {[
                'Race condition on startup — write queue added to useSaveData.js',
                'CORS blocking port 5175 — dynamic origin regex in server.js',
                'LockTab loading stale data — sequential init, state passed through',
                'Dog tab accessible before lock — lock gate added to DogTab',
                'App.jsx was 3,051 lines — split into per-tab components',
                'localStorage used for persistent data — migrated to savedata.json',
              ].map((item, i) => (
                <div key={i} style={{ fontSize: '0.75rem', color: '#2a2a2a', marginBottom: '0.2rem' }}>✓ {item}</div>
              ))}
            </div>
          </div>
        </div>
      )}

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
                <ApiStatusPanel espnOk={allGames.length > 0} />
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