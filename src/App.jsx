import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { fetchGamesFromEspn, getTodayKey, getDoubleheaderGameIds } from './utils/odds.js'
import { loadState, saveState, loadDogState, loadSuperDogState, loadFavPick, loadHatePick, loadPrefs, loadPropPick, getCacheAge, SERVER } from './hooks/useSaveData.js'

import LockTab      from './tabs/LockTab.jsx'
import DogTab       from './tabs/DogTab.jsx'
import SuperDogTab  from './tabs/SuperDogTab.jsx'
import GamesTab     from './tabs/GamesTab.jsx'
import ParlaysTab   from './tabs/ParlaysTab.jsx'
import PropsTab     from './tabs/PropsTab.jsx'
import LiveTab      from './tabs/LiveTab.jsx'
import WinsTab      from './tabs/WinsTab.jsx'
import PastLayTab   from './tabs/PastLayTab.jsx'
import MediaTab     from './tabs/MediaTab.jsx'
import FavsTab      from './tabs/FavsTab.jsx'
import HateWatchTab from './tabs/HateWatchTab.jsx'

const TABS = [
  { id: 'pastlay',   label: '📋 Past Lays', gate: null        },
  { id: 'games',     label: '🎮 Games',     gate: null        },
  { id: 'lock',      label: '🔒 Lock',      gate: null        },
  { id: 'dog',       label: '🐕 Dogs',      gate: 'lock'      },
  { id: 'superdog',  label: '⚡ Super Dog', gate: 'dog'       },
  { id: 'favs',      label: '⭐ Favs',      gate: 'superdog'  },
  { id: 'hatewatch', label: '😤 HateWatch', gate: 'favs'      },
  { id: 'props',     label: '🎲 Props',     gate: 'hatewatch' },
  { id: 'parlays',   label: '🎰 Parlays',   gate: 'props'     },
  { id: 'media',     label: '📺 Media',     gate: null        },
  { id: 'live',      label: '⚡ Live',      gate: null        },
  { id: 'wins',      label: '🏆 Wins',      gate: null        },
]

// Gate messages shown when a tab is locked
const GATE_MSG = {
  lock:      'Set your Lock of the Day first 🔒',
  dog:       'Set your Lock first, then pick your Dog (or skip) 🐕',
  superdog:  'Set your Lock + Dog first, then pick your Super Dog ⚡',
  favs:      'Set your Lock → Dog → Super Dog first ⭐',
  hatewatch: 'Set your Lock → Dog → Super Dog → Favs first 😤',
  props:     'Complete Lock → Dog → Super Dog → Favs → HateWatch first 🎲',
  parlays:   'Complete Lock → Dog → Super Dog → Favs → HateWatch → Props first 🎰',
}

// ── Gate wall — shown when a tab's prerequisite isn't met ────────────────────
function GateWall({ msg }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center',
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔒</div>
      <div style={{ fontSize: '0.9rem', color: '#555', fontWeight: 'bold' }}>{msg}</div>
    </div>
  )
}

// ── Boot overlay — shows briefly on app open with coin balance + streak ────────
function BootOverlay({ appState, onDismiss }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 400)
    }, 30000)
    return () => clearTimeout(t)
  }, [])

  const coins   = appState.coins || 0
  const streak  = appState.streak || []
  const streakDates = appState.streakDates || []
  const todayPick   = appState.picks?.[getTodayKey()] ?? null

  const streakInfo = (() => {
    if (!streak.length) return null
    const last = streak[streak.length - 1]
    let count = 0
    for (let i = streak.length - 1; i >= 0; i--) {
      if (streak[i] === last) count++; else break
    }
    return { type: last, count }
  })()

  const todayCoins  = 1
  const hasPick     = !!todayPick

  return (
    <div
      onClick={() => { setVisible(false); setTimeout(onDismiss, 300) }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease',
        cursor: 'pointer',
      }}
    >
      <div style={{
        background: '#141414',
        border: '1px solid #222',
        borderRadius: '16px',
        padding: '2rem 2.5rem',
        textAlign: 'center',
        maxWidth: '320px',
        width: '100%',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎰</div>
        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff', marginBottom: '0.2rem' }}>
          Welcome back
        </div>
        <div style={{ fontSize: '0.72rem', color: '#444', marginBottom: '1.5rem' }}>
          tap anywhere to dismiss
        </div>

        {/* Coin balance */}
        <div style={{
          background: '#0f0f0f', border: '1px solid #1e1e1e',
          borderRadius: '10px', padding: '0.9rem 1.25rem',
          marginBottom: '0.75rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.72rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.05em' }}>
            COINS
          </span>
          <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#fff' }}>
            🪙 {+coins.toFixed(2)}
          </span>
        </div>

        {/* Daily coin grant status */}
        <div style={{
          background: '#0f0f0f', border: '1px solid #1e1e1e',
          borderRadius: '10px', padding: '0.9rem 1.25rem',
          marginBottom: '0.75rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.72rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.05em' }}>
            TODAY'S COIN
          </span>
          <span style={{ fontSize: '0.9rem', color: '#00ff88' }}>
            +{todayCoins}
          </span>
        </div>

        {/* Streak */}
        {streakInfo && (
          <div style={{
            background: '#0f0f0f', border: '1px solid #1e1e1e',
            borderRadius: '10px', padding: '0.9rem 1.25rem',
            marginBottom: '0.75rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.72rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.05em' }}>
              STREAK
            </span>
            <span style={{ fontSize: '0.9rem', color: streakInfo.type === 'W' ? '#00ff88' : '#ff4444', fontWeight: 'bold' }}>
              {streakInfo.type === 'W' ? '🔥' : '❄️'} {streakInfo.count} {streakInfo.type}
            </span>
          </div>
        )}

        {/* Last login */}
        {/* Login streak — only show at 3+ consecutive days */}
        {(appState._loginStreak || 0) >= 3 && (
          <div style={{
            background: '#0f0f0f', border: '1px solid #1e1e1e',
            borderRadius: '10px', padding: '0.9rem 1.25rem',
            marginBottom: '0.75rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.72rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.05em' }}>
              LOGIN STREAK
            </span>
            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#f5a623' }}>
              {appState._loginStreak >= 30 ? '👑' : appState._loginStreak >= 14 ? '🔥' : '⚡'} {appState._loginStreak} days
            </span>
          </div>
        )}

        {appState._prevLoginDate && (
          <div style={{
            background: '#0f0f0f', border: '1px solid #1e1e1e',
            borderRadius: '10px', padding: '0.9rem 1.25rem',
            marginBottom: '0.75rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.72rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.05em' }}>
              LAST LOGIN
            </span>
            <span style={{ fontSize: '0.85rem', color: '#444' }}>
              {(() => {
                const [, mm, dd] = appState._prevLoginDate.split('-')
                return `${mm}/${dd}`
              })()}
            </span>
          </div>
        )}

        {/* Today's pick status */}
        <div style={{
          fontSize: '0.72rem',
          color: hasPick ? '#00ff88' : '#555',
          marginTop: '0.5rem',
        }}>
          {hasPick
            ? `🔒 Locked — ${todayPick.team?.split(' ').pop()} ${todayPick.odds > 0 ? '+' : ''}${todayPick.odds}`
            : 'No lock yet today'}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab]     = useState('pastlay')
  const [allGames, setAllGames]       = useState([])
  const doubleheaderIds = useMemo(() => getDoubleheaderGameIds(allGames), [allGames])

  // Preserve scroll position across background data refreshes (live polling, auto-refresh).
  // Without this, setAllGames() triggers a re-render that resets window scroll to top.
  const scrollPosRef = useRef(0)
  const isBackgroundRefresh = useRef(false)

  // Snapshot scroll before any background refresh
  function saveScroll() {
    scrollPosRef.current = window.scrollY
  }
  // Restore after render settles
  function restoreScroll() {
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollPosRef.current, behavior: 'instant' })
    })
  }
  const [loading, setLoading]         = useState(false)
  const [cacheAge, setCacheAge]       = useState(null)
  const [todayLock, setTodayLock]     = useState(null)
  const [todayDog, setTodayDog]       = useState(undefined)
  const [allInHistory, setAllInHistory] = useState({})
  const [todaySuperDog, setTodaySuperDog] = useState(undefined)
  const [todayFavPick, setTodayFavPick]   = useState(null)
  const [todayHatePick, setTodayHatePick] = useState(null)
  const [todayPropPick, setTodayPropPick] = useState(undefined)
  const [favTeam, setFavTeam]             = useState('')
  const [hateTeam, setHateTeam]           = useState('')
  const [bootState, setBootState]     = useState(null)
  const [showBoot, setShowBoot]       = useState(false)
  const [refreshKey, setRefreshKey]     = useState(0)
  const [refreshed, setRefreshed]     = useState(false)
  const [showDevPanel, setShowDevPanel] = useState(false)
  const [devPwInput, setDevPwInput]   = useState('')
  const [devPwError, setDevPwError]   = useState(false)
  const [devData, setDevData]         = useState(null)
  const [devUnlocked, setDevUnlocked] = useState(false)
  const tryDevUnlock = async () => {
    const r = await fetch(`${SERVER}/dev-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: devPwInput }),
    }).then(r => r.json()).catch(() => ({ ok: false }))
    if (r.ok) {
      setDevUnlocked(true)
      import('./hooks/useSaveData.js').then(m => m.loadAllData()).then(d => setDevData(d))
    } else { setDevPwError(true) }
  }

  async function fetchGames(force = false, background = false) {
    if (background) saveScroll()
    setLoading(true)
    try {
      const games = await fetchGamesFromEspn(force)
      setAllGames(games)
      setCacheAge(getCacheAge())
      setRefreshed(true)
      setTimeout(() => setRefreshed(false), 2000)
    } catch (e) {
      console.error('[App] fetchGames failed', e)
    } finally {
      setLoading(false)
      if (background) restoreScroll()
    }
  }

  async function refreshLock() {
    try {
      const state = await loadState()
      const pick  = state.picks?.[getTodayKey()] ?? null
      setTodayLock(pick)
    } catch { setTodayLock(null) }
  }

  async function refreshDog() {
    try {
      const state = await loadDogState()
      const pick  = state.picks?.[getTodayKey()]
      // noDog flag means explicitly skipped → null (gate passes)
      // pick exists → pick object (gate passes)
      // nothing yet → null (same as not picked — gate needs lock)
      setTodayDog(pick !== undefined ? pick : null)
    } catch { setTodayDog(null) }
  }

  async function refreshSuperDog() {
    try {
      const state = await loadSuperDogState()
      const pick  = state.picks?.[getTodayKey()] ?? null
      setTodaySuperDog(pick)
    } catch { setTodaySuperDog(null) }
  }

  async function refreshFavPick() {
    try {
      const state = await loadFavPick()
      const pick  = state[getTodayKey()] ?? null
      setTodayFavPick(pick)
    } catch { setTodayFavPick(null) }
  }

  async function refreshHatePick() {
    try {
      const state = await loadHatePick()
      const pick  = state[getTodayKey()] ?? null
      setTodayHatePick(pick)
    } catch { setTodayHatePick(null) }
  }

  async function refreshPropPick() {
    try {
      const picks = await loadPropPick()
      const todayPicks = picks[getTodayKey()]
      // todayPicks is the day's entry: object (has picks or _skipped) or undefined (nothing today)
      // We set null when nothing for today so gate passes — user doesn't have to do props if none available
      setTodayPropPick(todayPicks ?? null)
    } catch { setTodayPropPick(null) }
  }

  async function refreshPrefs() {
    try {
      const prefs = await loadPrefs()
      if (prefs?.favTeam_MLB)  setFavTeam(prefs.favTeam_MLB)
      if (prefs?.hateTeam_MLB) setHateTeam(prefs.hateTeam_MLB)
    } catch {}
  }

  useEffect(() => {
    fetchGames()
    refreshLock()
    refreshDog()
    refreshSuperDog()
    refreshFavPick()
    refreshHatePick()
    refreshPropPick()
    refreshPrefs()
    fetch(`${SERVER}/parlays/allin`)
      .then(r => r.json())
      .then(ai => setAllInHistory(ai || {}))
      .catch(() => {})

    // Load app state for boot overlay — snapshot lastCoinDate BEFORE LockTab updates it
    loadState().then(state => {
      const prevLoginDate = state.lastCoinDate || null

      // ── Login streak tracking ──────────────────────────────────────────────
      const today = getTodayKey()
      let loginDates = state.loginDates || []

      // Only append today if not already recorded
      if (!loginDates.includes(today)) {
        loginDates = [...loginDates, today].slice(-60) // keep last 60 days max
        // Write back asynchronously — fire and forget
        saveState({ ...state, loginDates }).catch(() => {})
      }

      // Compute consecutive login streak (must include today or yesterday)
      const loginStreak = (() => {
        if (!loginDates.length) return 0
        const sorted = [...loginDates].sort()
        const last = sorted[sorted.length - 1]
        // Only count if last login was today or yesterday
        const yesterday = (() => {
          const d = new Date(); d.setDate(d.getDate() - 1)
          return d.toISOString().slice(0, 10)
        })()
        if (last !== today && last !== yesterday) return 0
        let count = 1
        for (let i = sorted.length - 2; i >= 0; i--) {
          const curr = new Date(sorted[i + 1])
          const prev = new Date(sorted[i])
          const diff = (curr - prev) / 86400000
          if (diff === 1) count++; else break
        }
        return count
      })()

      setBootState({ ...state, _prevLoginDate: prevLoginDate, _loginStreak: loginStreak })
      setShowBoot(true)
      const pick = state.picks?.[today] ?? null
      setTodayLock(pick)
    }).catch(() => {
      setShowBoot(false)
    })
  }, [])

  // ── Live game auto-poll ────────────────────────────────────────────────────
  // Polls fetchGames every 30s while any of today's games are live or starting soon.
  // Uses a ref to track shouldPoll so the interval is created once and never churned —
  // previously [allGames] as dep meant every poll → new array ref → interval torn down
  // and rebuilt, causing a full ParlaysTab re-render on every cycle.
  const shouldPollRef = useRef(false)

  useEffect(() => {
    const hasLive = allGames.some(g => g.espnStatus?.type?.state === 'in')
    const hasSoon = allGames.some(g => {
      const state = g.espnStatus?.type?.state
      const completed = g.espnStatus?.type?.completed
      if (state === 'post' || completed) return false
      if (state === 'in') return false
      const start = g.commence_time ? new Date(g.commence_time) : null
      if (!start) return false
      return (start - Date.now()) < 3 * 60 * 60 * 1000
    })
    shouldPollRef.current = hasLive || hasSoon
  }, [allGames])

  useEffect(() => {
    const interval = setInterval(() => {
      if (shouldPollRef.current) fetchGames(true, true)
    }, 30000)
    return () => clearInterval(interval)
  }, [])  // ← runs once, never rebuilds the interval

  // Check if a team name from a pick matches a saved fav/hate team preference
  function pickTeamMatchesSaved(pickTeam, savedTeam) {
    if (!pickTeam || !savedTeam) return false
    const p = pickTeam.toLowerCase()
    const s = savedTeam.toLowerCase()
    if (p === s) return true
    const pLast = p.split(' ').pop()
    const sLast = s.split(' ').pop()
    if (pLast === sLast) return true
    return p.includes(sLast) || s.includes(pLast)
  }

  // Fav is "covered" if fav team was picked in lock OR dog OR a standalone favPick
  const favCovered = !!(
    todayFavPick ||
    (favTeam && todayLock && pickTeamMatchesSaved(todayLock.team, favTeam)) ||
    (favTeam && todayDog  && pickTeamMatchesSaved(todayDog.team,  favTeam))
  )

  // Hate is "covered" if hate team is involved in lock/dog game (as picked OR opponent) OR standalone hatePick
  const hateCovered = !!(
    todayHatePick ||
    (hateTeam && todayLock && (
      pickTeamMatchesSaved(todayLock.team, hateTeam) ||
      pickTeamMatchesSaved(todayLock.home, hateTeam) ||
      pickTeamMatchesSaved(todayLock.away, hateTeam)
    )) ||
    (hateTeam && todayDog && (
      pickTeamMatchesSaved(todayDog.team, hateTeam) ||
      pickTeamMatchesSaved(todayDog.home, hateTeam) ||
      pickTeamMatchesSaved(todayDog.away, hateTeam)
    ))
  )

  // Returns the unmet gate requirement for a tab, or null if open
  // undefined  = not yet loaded / decided  → blocks
  // null       = explicitly skipped / no pick today → passes
  // object     = real pick → passes
  function isTabLocked(tabId) {
    const tab = TABS.find(t => t.id === tabId)
    if (!tab?.gate) return null
    if (tab.gate === 'lock'      && !todayLock)                  return 'lock'
    // dog gate: needs lock; dog undefined means not decided yet
    if (tab.gate === 'dog'       && !todayLock)                  return 'lock'
    if (tab.gate === 'dog'       && todayDog === undefined)      return 'dog'
    // superdog gate: needs lock + dog decided
    if (tab.gate === 'superdog'  && !todayLock)                  return 'lock'
    if (tab.gate === 'superdog'  && todayDog === undefined)      return 'dog'
    // favs gate: needs lock + dog + superdog decided
    if (tab.gate === 'favs'      && !todayLock)                  return 'lock'
    if (tab.gate === 'favs'      && todayDog === undefined)      return 'dog'
    if (tab.gate === 'favs'      && todaySuperDog === undefined) return 'superdog'
    if (tab.gate === 'favs'      && !favCovered)                 return 'favs'
    // hatewatch gate: needs lock + dog + superdog + favs
    if (tab.gate === 'hatewatch' && !todayLock)                  return 'lock'
    if (tab.gate === 'hatewatch' && todayDog === undefined)      return 'dog'
    if (tab.gate === 'hatewatch' && todaySuperDog === undefined) return 'superdog'
    if (tab.gate === 'hatewatch' && !favCovered)                 return 'favs'
    if (tab.gate === 'hatewatch' && !hateCovered)                return 'hatewatch'
    // props gate: needs full chain through hatewatch
    if (tab.gate === 'props'     && !todayLock)                  return 'lock'
    if (tab.gate === 'props'     && todayDog === undefined)      return 'dog'
    if (tab.gate === 'props'     && todaySuperDog === undefined) return 'superdog'
    if (tab.gate === 'props'     && !favCovered)                 return 'favs'
    if (tab.gate === 'props'     && !hateCovered)                return 'hatewatch'
    // parlays gate: needs full chain through props
    if (tab.gate === 'parlays'   && !todayLock)                  return 'lock'
    if (tab.gate === 'parlays'   && todayDog === undefined)      return 'dog'
    if (tab.gate === 'parlays'   && todaySuperDog === undefined) return 'superdog'
    if (tab.gate === 'parlays'   && !favCovered)                 return 'favs'
    if (tab.gate === 'parlays'   && !hateCovered)                return 'hatewatch'
    if (tab.gate === 'parlays'   && todayPropPick === undefined) return 'props'
    return null
  }

  const tabStyle = (id) => {
    const locked = !!isTabLocked(id)
    const active = activeTab === id
    return {
      padding: '0.45rem 0.9rem',
      fontSize: '0.78rem',
      fontWeight: 'bold',
      cursor: locked ? 'default' : 'pointer',
      borderRadius: '6px',
      border: active ? 'none' : '1px solid #2a2a2a',
      background: active ? '#fff' : 'transparent',
      color: active ? '#000' : locked ? '#333' : '#555',
      whiteSpace: 'nowrap',
      opacity: locked ? 0.45 : 1,
    }
  }

  return (
    <div style={{
      fontFamily: 'sans-serif',
      padding: '1.5rem',
      background: '#0f0f0f',
      minHeight: '100vh',
      color: 'white',
      maxWidth: '960px',
      margin: '0 auto',
    }}>
      {/* Boot overlay */}
      {showBoot && bootState && (
        <BootOverlay appState={bootState} onDismiss={() => setShowBoot(false)} />
      )}

      {/* Dev Panel Modal */}
      {showDevPanel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => { setShowDevPanel(false); setDevUnlocked(false); setDevPwInput(''); setDevPwError(false) }}>
          <div style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '14px', padding: '1.5rem', width: '100%', maxWidth: '480px', maxHeight: '80vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#888' }}>🛠 Dev Panel</div>
              <button onClick={() => { setShowDevPanel(false); setDevUnlocked(false); setDevPwInput(''); setDevPwError(false) }}
                style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '50%', width: '28px', height: '28px', color: '#555', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
            </div>
            {!devUnlocked ? (
              <div>
                <div style={{ fontSize: '0.78rem', color: '#555', marginBottom: '0.75rem' }}>Enter dev password to continue.</div>
                <input
                  type="password"
                  value={devPwInput}
                  onChange={e => { setDevPwInput(e.target.value); setDevPwError(false) }}
                  onKeyDown={e => { if (e.key === 'Enter') tryDevUnlock() }}
                  placeholder="Password"
                  style={{ width: '100%', padding: '0.65rem 0.9rem', background: '#111', border: `1px solid ${devPwError ? '#ff4444' : '#2a2a2a'}`, borderRadius: '8px', color: '#fff', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                  autoFocus
                />
                {devPwError && <div style={{ color: '#ff4444', fontSize: '0.72rem', marginTop: '0.4rem' }}>Wrong password.</div>}
                <button onClick={tryDevUnlock} style={{ marginTop: '0.75rem', width: '100%', padding: '0.6rem', background: '#1a1a2a', border: '1px solid #4444aa', borderRadius: '8px', color: '#8888ff', cursor: 'pointer', fontWeight: 'bold' }}>
                  Unlock
                </button>
              </div>
            ) : (
              <div>
                {/* Server status */}
                <div style={{ fontSize: '0.65rem', color: '#555', letterSpacing: '0.08em', marginBottom: '0.5rem', fontWeight: 'bold' }}>SERVER</div>
                <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.78rem', color: '#666' }}>
                  {SERVER} · <span style={{ color: '#00ff88' }}>node server.js</span>
                </div>
                {/* Data explorer */}
                <div style={{ fontSize: '0.65rem', color: '#555', letterSpacing: '0.08em', marginBottom: '0.5rem', fontWeight: 'bold' }}>SAVEDATA KEYS</div>
                <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '0.5rem 0.75rem', marginBottom: '1rem' }}>
                  {devData ? Object.entries(devData).map(([k, v]) => {
                    const isObj = v && typeof v === 'object'
                    const subKeys = isObj ? Object.keys(v) : []
                    const isDeletableKey = !['_version', '_savedAt', 'prefs'].includes(k)

                    // Map devData key → server endpoint for delete
                    async function deleteEntry(dataKey, dateKey) {
                      const { SERVER } = await import('./hooks/useSaveData.js')
                      const pickTypeMap = { app: 'lock', dog: 'dog', superdog: 'superdog', ouPick: 'ou', hatePick: 'hate', favPick: 'fav' }
                      const parlayTypeMap = { lay: 'lay', predictions: 'prediction', allIn: 'allin' }
                      if (pickTypeMap[dataKey]) {
                        await fetch(`${SERVER}/picks/${pickTypeMap[dataKey]}/${dateKey}`, { method: 'DELETE' })
                      } else if (parlayTypeMap[dataKey]) {
                        await fetch(`${SERVER}/parlays/${parlayTypeMap[dataKey]}/${dateKey}`, { method: 'DELETE' })
                      } else if (dataKey === 'propPick') {
                        await fetch(`${SERVER}/props/${dateKey}`, { method: 'DELETE' })
                      } else if (dataKey === 'f5') {
                        await fetch(`${SERVER}/f5/${dateKey}`, { method: 'DELETE' })
                      }
                    }

                    return (
                      <div key={k} style={{ borderBottom: '1px solid #111' }}>
                        {/* Key row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', padding: '0.35rem 0', gap: '0.5rem' }}>
                          <span
                            style={{ color: '#8888ff', cursor: isObj ? 'pointer' : 'default', flex: 1 }}
                            onClick={() => {
                              setDevData(prev => ({ ...prev, [`__expanded_${k}`]: !prev[`__expanded_${k}`] }))
                            }}
                          >
                            {isObj ? (devData[`__expanded_${k}`] ? '▾' : '▸') : '·'} {k}
                          </span>
                          <span style={{ color: '#444' }}>{isObj ? `{${subKeys.filter(x => !x.startsWith('__')).length} keys}` : String(v)}</span>
                          {isDeletableKey && isObj && (
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete ALL entries in "${k}"?`)) return
                                const { loadAllData } = await import('./hooks/useSaveData.js')
                                // Delete each date entry individually
                                const realKeys = subKeys.filter(x => !x.startsWith('__') && /^\d{4}-\d{2}-\d{2}$/.test(x))
                                await Promise.all(realKeys.map(dateKey => deleteEntry(k, dateKey)))
                                const fresh = await loadAllData()
                                setDevData(prev => {
                                  const expanded = Object.fromEntries(Object.entries(prev).filter(([key]) => key.startsWith('__')))
                                  return { ...fresh, ...expanded }
                                })
                              }}
                              style={{ fontSize: '0.6rem', padding: '0.15rem 0.45rem', background: '#2a0a0a', border: '1px solid #ff444433', borderRadius: '4px', color: '#ff4444', cursor: 'pointer' }}
                            >✕ all</button>
                          )}
                        </div>
                        {/* Expanded sub-keys (dates) */}
                        {isObj && devData[`__expanded_${k}`] && subKeys.filter(x => !x.startsWith('__')).sort().reverse().map(dateKey => {
                          const dateVal = v[dateKey]
                          const isDeep = dateVal && typeof dateVal === 'object' && !Array.isArray(dateVal)
                          const deepKeys = isDeep ? Object.keys(dateVal) : []
                          const expandedDeep = devData[`__expanded_${k}_${dateKey}`]
                          return (
                            <div key={dateKey}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', padding: '0.25rem 0 0.25rem 1rem', borderTop: '1px solid #0f0f0f', gap: '0.5rem' }}>
                                <span
                                  style={{ color: '#555', minWidth: '80px', cursor: isDeep ? 'pointer' : 'default' }}
                                  onClick={() => isDeep && setDevData(prev => ({ ...prev, [`__expanded_${k}_${dateKey}`]: !prev[`__expanded_${k}_${dateKey}`] }))}
                                >
                                  {isDeep ? (expandedDeep ? '▾' : '▸') : '·'} {dateKey}
                                </span>
                                <span style={{ color: '#444', fontSize: '0.6rem', flex: 1, marginLeft: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {isDeep
                                    ? (() => {
                                        const obj = dateVal
                                        if (obj.team) return `${obj.team} · ${obj.odds > 0 ? '+' : ''}${obj.odds} · ${obj.result ?? 'pending'}`
                                        if (obj.legs) return `${obj.legs.length} legs · ${obj.overallResult ?? 'pending'}`
                                        if (obj.picks) return `${Object.keys(obj.picks).length} picks`
                                        if (obj.player) return `${obj.player} · ${obj.line}`
                                        return `{${deepKeys.length} entries}`
                                      })()
                                    : String(dateVal).slice(0, 50)}
                                </span>
                                <button
                                  onClick={async () => {
                                    if (!confirm(`Delete "${k}" → "${dateKey}"?`)) return
                                    const { loadAllData } = await import('./hooks/useSaveData.js')
                                    await deleteEntry(k, dateKey)
                                    const fresh = await loadAllData()
                                    setDevData(prev => {
                                      const expanded = Object.fromEntries(Object.entries(prev).filter(([key]) => key.startsWith('__')))
                                      return { ...fresh, ...expanded }
                                    })
                                  }}
                                  style={{ fontSize: '0.58rem', padding: '0.12rem 0.4rem', background: '#1a0808', border: '1px solid #ff444422', borderRadius: '3px', color: '#ff4444', cursor: 'pointer' }}
                                >✕</button>
                              </div>
                              {/* Third level - individual prop entries */}
                              {isDeep && expandedDeep && deepKeys.filter(sk => !sk.startsWith('_')).map(subKey => {
                                const subVal = dateVal[subKey]
                                return (
                                  <div key={subKey} style={{ display: 'flex', alignItems: 'center', fontSize: '0.62rem', padding: '0.2rem 0 0.2rem 2rem', borderTop: '1px solid #0a0a0a', gap: '0.5rem' }}>
                                    <span style={{ color: '#444', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {typeof subVal === 'object' && subVal !== null
                                        ? (subVal.player || subVal.team || subVal.name || subKey.split('||')[0] || subKey)
                                        : String(subVal)}
                                    </span>
                                    <span style={{ color: '#333', flexShrink: 0 }}>
                                      {typeof subVal === 'object' && subVal !== null
                                        ? `${subVal.line ?? subVal.point ?? ''} · ${subVal.side ?? subVal.name ?? ''} · ${subVal.odds != null ? (subVal.odds > 0 ? '+' : '') + subVal.odds : ''}`
                                        : ''}
                                    </span>
                                    <span style={{ color: subVal?.result === 'W' ? '#00ff88' : subVal?.result === 'L' ? '#ff4444' : '#333', flexShrink: 0, fontSize: '0.58rem' }}>
                                      {subVal?.result ?? 'pending'}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    )
                  }) : <div style={{ color: '#333', fontSize: '0.72rem' }}>Loading...</div>}
                </div>
                {/* Quick actions */}
                <div style={{ fontSize: '0.65rem', color: '#555', letterSpacing: '0.08em', marginBottom: '0.5rem', fontWeight: 'bold' }}>QUICK ACTIONS</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button onClick={() => import('./hooks/useSaveData.js').then(m => m.loadAllData()).then(d => setDevData(d))}
                    style={{ fontSize: '0.72rem', padding: '0.4rem 0.8rem', background: '#111', border: '1px solid #2a2a2a', borderRadius: '6px', color: '#888', cursor: 'pointer' }}>
                    ↺ Reload Data
                  </button>
                  <button onClick={() => navigator.clipboard?.writeText(JSON.stringify(devData, null, 2))}
                    style={{ fontSize: '0.72rem', padding: '0.4rem 0.8rem', background: '#111', border: '1px solid #2a2a2a', borderRadius: '6px', color: '#888', cursor: 'pointer' }}>
                    📋 Copy JSON
                  </button>
                  <button onClick={() => fetch(`${SERVER}/export`).then(r => r.json()).then(d => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], {type:'application/json'})); a.download = 'betonme-export.json'; a.click() })}
                  // STEP MARKER: step 3/6 in progress — file 2 of 5 (App.jsx) done, both occurrences fixed.
                  // Next: FavsTab.jsx, HateWatchTab.jsx, checkbetonme.sh.
                    style={{ fontSize: '0.72rem', padding: '0.4rem 0.8rem', background: '#0a2a1a', border: '1px solid #00ff8833', borderRadius: '6px', color: '#00ff88', cursor: 'pointer' }}>
                    ⬇ Export
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: '0 0 0.15rem', fontSize: '1.25rem' }}>🎰 BetOnMe</h1>
          <p style={{ margin: 0, color: '#444', fontSize: '0.78rem' }}>Daily lock tracker</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.15rem' }}>
          <button
            onClick={() => setShowDevPanel(true)}
            style={{
              fontSize: '0.62rem', padding: '0.28rem 0.55rem',
              background: 'transparent', border: '1px solid #1e1e1e',
              borderRadius: '5px', color: '#333', cursor: 'pointer',
            }}
            title="Dev Panel"
          >🛠</button>
          <button
            onClick={async () => {
              await fetchGames(true)
              refreshLock(); refreshDog(); refreshSuperDog(); refreshFavPick(); refreshHatePick(); refreshPropPick(); refreshPrefs()
            }}
            disabled={loading}
            style={{
              fontSize: '0.62rem', padding: '0.28rem 0.65rem',
              background: refreshed ? '#0a2a1a' : 'transparent',
              border: `1px solid ${refreshed ? '#00ff8844' : '#252525'}`,
              borderRadius: '5px',
              color: loading ? '#333' : refreshed ? '#00ff88' : '#444',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
            }}
          >
            {loading ? '↺ …' : refreshed ? '✓ Updated' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {/* Tab Nav */}
      <div style={{
        display: 'flex',
        gap: '0.4rem',
        flexWrap: 'wrap',
        marginBottom: '1.75rem',
        borderBottom: '1px solid #1a1a1a',
        paddingBottom: '1rem',
      }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => { if (!isTabLocked(id)) setActiveTab(id) }}
            style={tabStyle(id)}
            title={isTabLocked(id) ? GATE_MSG[isTabLocked(id)] : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'games' && (
        <GamesTab
          allGames={allGames}
          doubleheaderIds={doubleheaderIds}
          loading={loading}
          onRefresh={() => fetchGames(true)}
          cacheAge={cacheAge}
        />
      )}
      {activeTab === 'lock' && (
        <LockTab
          allGames={allGames}
          doubleheaderIds={doubleheaderIds}
          loading={loading}
          onRefresh={() => fetchGames(true)}
          cacheAge={cacheAge}
          onLockChange={refreshLock}
        />
      )}
      {activeTab === 'dog' && (
        isTabLocked('dog')
          ? <GateWall msg={GATE_MSG[isTabLocked('dog')]} />
          : <DogTab
          allGames={allGames}
          doubleheaderIds={doubleheaderIds}
          loading={loading}
          onDogChange={refreshDog}
          todayLock={todayLock}
        />
      )}
      {activeTab === 'superdog' && (
        isTabLocked('superdog')
          ? <GateWall msg={GATE_MSG[isTabLocked('superdog')]} />
          : <SuperDogTab
          allGames={allGames}
          doubleheaderIds={doubleheaderIds}
          loading={loading}
          onSuperDogChange={refreshSuperDog}
          todayFavPick={todayFavPick}
          todayHatePick={todayHatePick}
        />
      )}
      {activeTab === 'favs' && (
        isTabLocked('favs')
          ? <GateWall msg={GATE_MSG[isTabLocked('favs')]} />
          : <FavsTab
          allGames={allGames}
          doubleheaderIds={doubleheaderIds}
          todayLock={todayLock}
          todayDog={todayDog}
          todayFavPick={todayFavPick}
          onFavPickChange={refreshFavPick}
          onTeamChange={refreshPrefs}
        />
      )}
      {activeTab === 'hatewatch' && (
        isTabLocked('hatewatch')
          ? <GateWall msg={GATE_MSG[isTabLocked('hatewatch')]} />
          : <HateWatchTab
          allGames={allGames}
          doubleheaderIds={doubleheaderIds}
          todayLock={todayLock}
          todayDog={todayDog}
          todaySuperDog={todaySuperDog}
          todayHatePick={todayHatePick}
          onHatePickChange={refreshHatePick}
          onTeamChange={refreshPrefs}
        />
      )}
      {activeTab === 'pastlay'  && <PastLayTab key={refreshKey} todayLock={todayLock} allGames={allGames} onRefresh={() => { refreshLock(); refreshDog(); refreshSuperDog(); }} />}
      {activeTab === 'parlays' && (
        isTabLocked('parlays')
          ? <GateWall msg={GATE_MSG[isTabLocked('parlays')]} />
          : <ParlaysTab
          allGames={allGames}
          doubleheaderIds={doubleheaderIds}
          loading={loading}
          todayLock={todayLock}
          todayDog={todayDog}
          todaySuperDog={todaySuperDog}
          onLockChange={refreshLock}
          onSuperDogChange={refreshSuperDog}
          allInHistoryProp={allInHistory}
          onAllInHistoryChange={setAllInHistory}
        />
      )}
      {activeTab === 'props' && (
        isTabLocked('props')
          ? <GateWall msg={GATE_MSG[isTabLocked('props')]} />
          : <PropsTab
          allGames={allGames}
          doubleheaderIds={doubleheaderIds}
          todayLock={todayLock}
          todayDog={todayDog}
          onRefresh={() => fetchGames(true)}
          onPropsChange={refreshPropPick}
        />
      )}
      {activeTab === 'live' && (
        <LiveTab
          todayLock={todayLock}
          todayDog={todayDog}
          allGames={allGames}
          doubleheaderIds={doubleheaderIds}
        />
      )}
      {activeTab === 'media' && <MediaTab todayLock={todayLock} allGames={allGames} />}
      {activeTab === 'wins'   && <WinsTab />}
    </div>
  )
}