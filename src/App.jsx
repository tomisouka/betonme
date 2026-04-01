import React, { useState, useEffect } from 'react'
import { fetchGamesFromEspn, getTodayKey, isSaturday } from './utils/odds.js'
import { loadState, saveState, loadDogState, loadSuperDogState, loadFavPick, loadHatePick, loadPrefs, getCacheAge } from './hooks/useSaveData.js'

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
  { id: 'parlays',   label: '🎰 Parlays',   gate: 'hatewatch' },
  { id: 'media',     label: '📺 Media',     gate: null        },
  { id: 'live',      label: '⚡ Live',      gate: null        },
  { id: 'wins',      label: '🏆 Wins',      gate: null        },
]

// Gate messages shown when a tab is locked
const GATE_MSG = {
  lock:      'Set your Lock of the Day first 🔒',
  dog:       'Set your Lock first, then pick your Dog 🐕',
  superdog:  'Set your Lock + Dog first, then pick your Super Dog ⚡',
  favs:      'Set your Lock → Dog → Super Dog first ⭐',
  hatewatch: 'Set your Lock → Dog → Super Dog → Favs first 😤',
  parlays:   'Complete Lock → Dog → Super Dog → Favs → HateWatch first 🎰',
  props:     'Make your HateWatch pick first 🎲',
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

  const todayCoins  = isSaturday() ? 2 : 1
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
            +{todayCoins} {isSaturday() ? '(Sat bonus)' : ''}
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
  const [loading, setLoading]         = useState(false)
  const [cacheAge, setCacheAge]       = useState(null)
  const [todayLock, setTodayLock]     = useState(null)
  const [todayDog, setTodayDog]       = useState(null)
  const [todaySuperDog, setTodaySuperDog] = useState(undefined)
  const [todayFavPick, setTodayFavPick]   = useState(null)
  const [todayHatePick, setTodayHatePick] = useState(null)
  const [favTeam, setFavTeam]             = useState('')
  const [hateTeam, setHateTeam]           = useState('')
  const [bootState, setBootState]     = useState(null)
  const [showBoot, setShowBoot]       = useState(false)
  const [refreshed, setRefreshed]     = useState(false)
  const [showDevPanel, setShowDevPanel] = useState(false)
  const [devPwInput, setDevPwInput]   = useState('')
  const [devPwError, setDevPwError]   = useState(false)
  const [devData, setDevData]         = useState(null)
  const [devUnlocked, setDevUnlocked] = useState(false)

  async function fetchGames(force = false) {
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
      const pick  = state.picks?.[getTodayKey()] ?? null
      setTodayDog(pick)
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
    refreshPrefs()

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

  // Hate is "covered" if hate team was picked in lock OR dog OR a standalone hatePick
  const hateCovered = !!(
    todayHatePick ||
    (hateTeam && todayLock && pickTeamMatchesSaved(todayLock.team, hateTeam)) ||
    (hateTeam && todayDog  && pickTeamMatchesSaved(todayDog.team,  hateTeam))
  )

  // Returns the unmet gate requirement for a tab, or null if open
  function isTabLocked(tabId) {
    const tab = TABS.find(t => t.id === tabId)
    if (!tab?.gate) return null
    if (tab.gate === 'lock'      && !todayLock)      return 'lock'
    // dog gate: needs lock
    if (tab.gate === 'dog'       && !todayLock)      return 'lock'
    if (tab.gate === 'dog'       && !todayDog)       return 'dog'
    // superdog gate: needs lock + dog (superdog tab itself just needs lock+dog to open)
    if (tab.gate === 'superdog'  && !todayLock)      return 'lock'
    if (tab.gate === 'superdog'  && !todayDog)       return 'dog'
    // favs gate: needs lock + dog + superdog pick (if no eligible games today superdog=null counts as done)
    if (tab.gate === 'favs'      && !todayLock)      return 'lock'
    if (tab.gate === 'favs'      && !todayDog)       return 'dog'
    if (tab.gate === 'favs'      && todaySuperDog === undefined) return 'superdog'
    if (tab.gate === 'favs'      && !favCovered)     return 'favs'
    // hatewatch gate: needs lock + dog + superdog + favs
    if (tab.gate === 'hatewatch' && !todayLock)      return 'lock'
    if (tab.gate === 'hatewatch' && !todayDog)       return 'dog'
    if (tab.gate === 'hatewatch' && todaySuperDog === undefined) return 'superdog'
    if (tab.gate === 'hatewatch' && !favCovered)     return 'favs'
    if (tab.gate === 'hatewatch' && !hateCovered)    return 'hatewatch'
    // parlays gate: needs full chain
    if (tab.gate === 'parlays'   && !todayLock)      return 'lock'
    if (tab.gate === 'parlays'   && !todayDog)       return 'dog'
    if (tab.gate === 'parlays'   && todaySuperDog === undefined) return 'superdog'
    if (tab.gate === 'parlays'   && !favCovered)     return 'favs'
    if (tab.gate === 'parlays'   && !hateCovered)    return 'hatewatch'
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
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (devPwInput === 'Jesiah') {
                        setDevUnlocked(true)
                        import('./hooks/useSaveData.js').then(m => m.loadAllData()).then(d => setDevData(d))
                      } else { setDevPwError(true) }
                    }
                  }}
                  placeholder="Password"
                  style={{ width: '100%', padding: '0.65rem 0.9rem', background: '#111', border: `1px solid ${devPwError ? '#ff4444' : '#2a2a2a'}`, borderRadius: '8px', color: '#fff', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                  autoFocus
                />
                {devPwError && <div style={{ color: '#ff4444', fontSize: '0.72rem', marginTop: '0.4rem' }}>Wrong password.</div>}
                <button onClick={() => {
                  if (devPwInput === 'Jesiah') { setDevUnlocked(true); import('./hooks/useSaveData.js').then(m => m.loadAllData()).then(d => setDevData(d)) }
                  else setDevPwError(true)
                }} style={{ marginTop: '0.75rem', width: '100%', padding: '0.6rem', background: '#1a1a2a', border: '1px solid #4444aa', borderRadius: '8px', color: '#8888ff', cursor: 'pointer', fontWeight: 'bold' }}>
                  Unlock
                </button>
              </div>
            ) : (
              <div>
                {/* Server status */}
                <div style={{ fontSize: '0.65rem', color: '#555', letterSpacing: '0.08em', marginBottom: '0.5rem', fontWeight: 'bold' }}>SERVER</div>
                <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.78rem', color: '#666' }}>
                  http://127.0.0.1:3001 · <span style={{ color: '#00ff88' }}>node server.js</span>
                </div>
                {/* Data explorer */}
                <div style={{ fontSize: '0.65rem', color: '#555', letterSpacing: '0.08em', marginBottom: '0.5rem', fontWeight: 'bold' }}>SAVEDATA KEYS</div>
                <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  {devData ? Object.entries(devData).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', padding: '0.2rem 0', borderBottom: '1px solid #111', color: '#555' }}>
                      <span style={{ color: '#8888ff' }}>{k}</span>
                      <span style={{ color: '#444' }}>{typeof v === 'object' ? `{${Object.keys(v || {}).length} keys}` : String(v)}</span>
                    </div>
                  )) : <div style={{ color: '#333', fontSize: '0.72rem' }}>Loading...</div>}
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
                  <button onClick={() => fetch('http://127.0.0.1:3001/export').then(r => r.json()).then(d => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], {type:'application/json'})); a.download = 'savedata-export.json'; a.click() })}
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
              refreshLock(); refreshDog(); refreshSuperDog(); refreshFavPick(); refreshHatePick(); refreshPrefs()
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
          loading={loading}
          onRefresh={() => fetchGames(true)}
          cacheAge={cacheAge}
        />
      )}
      {activeTab === 'lock' && (
        <LockTab
          allGames={allGames}
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
          loading={loading}
          onSuperDogChange={refreshSuperDog}
        />
      )}
      {activeTab === 'favs' && (
        isTabLocked('favs')
          ? <GateWall msg={GATE_MSG[isTabLocked('favs')]} />
          : <FavsTab
          allGames={allGames}
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
          todayLock={todayLock}
          todayDog={todayDog}
          todayHatePick={todayHatePick}
          onHatePickChange={refreshHatePick}
          onTeamChange={refreshPrefs}
        />
      )}
      {activeTab === 'pastlay'  && <PastLayTab todayLock={todayLock} onRefresh={() => { refreshLock(); refreshDog(); refreshSuperDog(); }} />}
      {activeTab === 'parlays' && (
        isTabLocked('parlays')
          ? <GateWall msg={GATE_MSG[isTabLocked('parlays')]} />
          : <ParlaysTab
          allGames={allGames}
          loading={loading}
          todayLock={todayLock}
          todayDog={todayDog}
          todaySuperDog={todaySuperDog}
          onLockChange={refreshLock}
        />
      )}
      {activeTab === 'props' && (
        isTabLocked('props')
          ? <GateWall msg={GATE_MSG[isTabLocked('props')]} />
          : <PropsTab
          allGames={allGames}
          todayLock={todayLock}
          todayDog={todayDog}
          onRefresh={() => fetchGames(true)}
        />
      )}
      {activeTab === 'live' && (
        <LiveTab
          todayLock={todayLock}
          todayDog={todayDog}
          allGames={allGames}
        />
      )}
      {activeTab === 'media' && <MediaTab todayLock={todayLock} allGames={allGames} />}
      {activeTab === 'wins'   && <WinsTab />}
    </div>
  )
}