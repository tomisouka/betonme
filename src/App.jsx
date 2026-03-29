import React, { useState, useEffect } from 'react'
import { fetchGamesFromEspn, getTodayKey, isSaturday } from './utils/odds.js'
import { loadState, saveState, loadDogState, loadFavPick, loadHatePick, loadPrefs, getCacheAge } from './hooks/useSaveData.js'

import LockTab      from './tabs/LockTab.jsx'
import DogTab       from './tabs/DogTab.jsx'
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
  { id: 'games',     label: '🎮 Games',     gate: null        },
  { id: 'lock',      label: '🔒 Lock',      gate: null        },
  { id: 'dog',       label: '🐕 Dogs',      gate: 'lock'      },
  { id: 'favs',      label: '⭐ Favs',      gate: 'dog'       },
  { id: 'hatewatch', label: '😤 HateWatch', gate: 'favs'      },
  { id: 'pastlay',   label: '📋 Past Lays', gate: null        },
  { id: 'parlays',   label: '🎰 Parlays',   gate: 'hatewatch' },
  { id: 'props',     label: '🎲 Props'    , gate: 'parlays'   },
  { id: 'live',      label: '⚡ Live',      gate: null        },
  { id: 'media',     label: '📺 Media',     gate: null        },
  { id: 'wins',      label: '🏆 Wins',      gate: null        },
]

// Gate messages shown when a tab is locked
const GATE_MSG = {
  lock:      'Set your Lock of the Day first 🔒',
  dog:       'Set your Lock first, then pick your Dog 🐕',
  favs:      'Set your Lock + Dog first ⭐',
  hatewatch: 'Make your Favs pick first 😤',
  parlays:   'Make your HateWatch pick first 🎰',
  props:     'Complete your Parlays pick first 🎲',
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
  const [activeTab, setActiveTab]     = useState('games')
  const [allGames, setAllGames]       = useState([])
  const [loading, setLoading]         = useState(false)
  const [cacheAge, setCacheAge]       = useState(null)
  const [todayLock, setTodayLock]     = useState(null)
  const [todayDog, setTodayDog]       = useState(null)
  const [todayFavPick, setTodayFavPick]   = useState(null)
  const [todayHatePick, setTodayHatePick] = useState(null)
  const [favTeam, setFavTeam]             = useState('')
  const [hateTeam, setHateTeam]           = useState('')
  const [bootState, setBootState]     = useState(null)   // null = loading, false = done, obj = show
  const [showBoot, setShowBoot]       = useState(false)

  async function fetchGames(force = false) {
    setLoading(true)
    try {
      const games = await fetchGamesFromEspn(force)
      setAllGames(games)
      setCacheAge(getCacheAge())
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
    if (tab.gate === 'lock'      && !todayLock)   return 'lock'
    if (tab.gate === 'dog'       && !todayLock)   return 'lock'
    if (tab.gate === 'dog'       && !todayDog)    return 'dog'
    if (tab.gate === 'favs'      && !todayLock)   return 'lock'
    if (tab.gate === 'favs'      && !todayDog)    return 'dog'
    if (tab.gate === 'favs'      && !favCovered)  return 'favs'
    if (tab.gate === 'hatewatch' && !todayLock)   return 'lock'
    if (tab.gate === 'hatewatch' && !todayDog)    return 'dog'
    if (tab.gate === 'hatewatch' && !favCovered)  return 'favs'
    if (tab.gate === 'hatewatch' && !hateCovered) return 'hatewatch'
    if (tab.gate === 'parlays'   && !todayLock)   return 'lock'
    if (tab.gate === 'parlays'   && !todayDog)    return 'dog'
    if (tab.gate === 'parlays'   && !favCovered)  return 'favs'
    if (tab.gate === 'parlays'   && !hateCovered) return 'hatewatch'
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

      {/* Header */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: '0 0 0.15rem', fontSize: '1.25rem' }}>🎰 BetOnMe</h1>
          <p style={{ margin: 0, color: '#444', fontSize: '0.78rem' }}>Daily lock tracker</p>
        </div>
        <button
          onClick={async () => {
            await fetchGames(true)
            refreshLock(); refreshDog(); refreshFavPick(); refreshHatePick(); refreshPrefs()
          }}
          disabled={loading}
          style={{
            fontSize: '0.62rem', padding: '0.28rem 0.65rem',
            background: 'transparent', border: '1px solid #252525',
            borderRadius: '5px', color: loading ? '#333' : '#444',
            cursor: loading ? 'not-allowed' : 'pointer', marginTop: '0.15rem',
          }}
        >
          {loading ? '↺ …' : '↺ Refresh'}
        </button>
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
      {activeTab === 'pastlay'  && <PastLayTab />}
      {activeTab === 'parlays' && (
        isTabLocked('parlays')
          ? <GateWall msg={GATE_MSG[isTabLocked('parlays')]} />
          : <ParlaysTab
          allGames={allGames}
          loading={loading}
          todayLock={todayLock}
          todayDog={todayDog}
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
        />
      )}
      {activeTab === 'live' && (
        <LiveTab
          todayLock={todayLock}
          todayDog={todayDog}
        />
      )}
      {activeTab === 'media' && <MediaTab todayLock={todayLock} allGames={allGames} />}
      {activeTab === 'wins'   && <WinsTab />}
    </div>
  )
}