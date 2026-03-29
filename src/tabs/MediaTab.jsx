import React, { useState, useEffect, useRef } from 'react'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb'
const MLB_API   = 'https://statsapi.mlb.com/api/v1'
const SERVER    = 'http://127.0.0.1:3001'

// ── Date helpers ──────────────────────────────────────────────────────────────

function getTodayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getYesterdayKey() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fmtDateLabel(key) {
  if (!key) return ''
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const d = new Date(key + 'T12:00:00')
  const [,mm,dd] = key.split('-')
  return `${days[d.getDay()]} ${mm}/${dd}`
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchGamePitchers(espnGameId) {
  try {
    const res  = await fetch(`${ESPN_BASE}/summary?event=${espnGameId}`)
    const data = await res.json()

    const competitors = data.header?.competitions?.[0]?.competitors || []
    const probableMap = {}
    competitors.forEach(c => {
      const side = c.homeAway
      const probable = c.probables?.[0]
      if (probable) {
        probableMap[side] = {
          name: probable.athlete?.displayName || probable.displayName || null,
          id:   probable.athlete?.id || null,
        }
      }
    })

    const todayStatsMap = {}
    const playerGroups = data.boxscore?.players || []
    playerGroups.forEach(teamGroup => {
      const side = teamGroup.homeAway
      ;(teamGroup.statistics || []).forEach(statGroup => {
        if (statGroup.name?.toLowerCase() !== 'pitching') return
        const labels = statGroup.labels || []
        ;(statGroup.athletes || []).forEach(a => {
          const pname = a.athlete?.displayName
          if (!pname) return
          const stats = {}
          labels.forEach((lbl, i) => { stats[lbl] = a.stats?.[i] })
          const matchSide = Object.keys(probableMap).find(s => probableMap[s]?.name === pname)
          if (matchSide) todayStatsMap[matchSide] = stats
        })
      })
    })

    return { probableMap, todayStatsMap }
  } catch {
    return null
  }
}

const _seasonCache = {}
async function fetchSeasonStats(playerName) {
  if (_seasonCache[playerName]) return _seasonCache[playerName]
  try {
    const q = encodeURIComponent(playerName)
    const search = await fetch(`${MLB_API}/people/search?names=${q}&sportId=1`)
    const sdata  = await search.json()
    const person = sdata.people?.[0]
    if (!person) return null

    const year = new Date().getFullYear()
    const statsRes = await fetch(`${MLB_API}/people/${person.id}/stats?stats=season&group=pitching&season=${year}&sportId=1`)
    const statsData = await statsRes.json()
    const splits = statsData.stats?.[0]?.splits
    if (!splits?.length) return null

    const s = splits[0].stat

    // K% = strikeOuts / battersFaced, BB% = baseOnBalls / battersFaced
    const bf = s.battersFaced ?? null
    const kPct  = bf && s.strikeOuts != null  ? ((s.strikeOuts  / bf) * 100).toFixed(1) + '%' : null
    const bbPct = bf && s.baseOnBalls != null ? ((s.baseOnBalls / bf) * 100).toFixed(1) + '%' : null

    // HR/9, K/9, BB/9 — computed from IP
    const ip = parseFloat(s.inningsPitched) || null
    const hr9  = ip && s.homeRuns    != null ? ((s.homeRuns    / ip) * 9).toFixed(2) : null
    const k9   = ip && s.strikeOuts  != null ? ((s.strikeOuts  / ip) * 9).toFixed(2) : null
    const bb9  = ip && s.baseOnBalls != null ? ((s.baseOnBalls / ip) * 9).toFixed(2) : null

    const result = {
      // Core
      wins:              s.wins              ?? null,
      losses:            s.losses            ?? null,
      era:               s.era               ?? null,
      whip:              s.whip              ?? null,
      inningsPitched:    s.inningsPitched    ?? null,
      gamesStarted:      s.gamesStarted      ?? null,
      gamesPlayed:       s.gamesPlayed       ?? null,
      // K/BB raw
      strikeOuts:        s.strikeOuts        ?? null,
      baseOnBalls:       s.baseOnBalls       ?? null,
      hitBatsmen:        s.hitBatsmen        ?? null,
      // Hits/HR allowed
      hits:              s.hits              ?? null,
      homeRuns:          s.homeRuns          ?? null,
      earnedRuns:        s.earnedRuns        ?? null,
      // Batters faced
      battersFaced:      bf,
      // Ratios (per 9)
      k9, bb9, hr9,
      // Percentages
      kPct, bbPct,
      // Advanced
      strikeoutWalkRatio: s.strikeoutWalkRatio ?? null,
      babip:              s.babip             ?? null,
      obp:                s.obp               ?? null,  // OBP against
      slg:                s.slg               ?? null,  // SLG against
      avg:                s.avg               ?? null,  // BAA
      // Saves / holds
      saves:              s.saves             ?? null,
      saveOpportunities:  s.saveOpportunities ?? null,
      holds:              s.holds             ?? null,
      blownSaves:         s.blownSaves        ?? null,
      // Pitch counts (season totals)
      numberOfPitches:    s.numberOfPitches   ?? null,
      strikes:            s.strikes           ?? null,
      balls:              s.balls             ?? null,
      strikePercentage:   s.strikePercentage  ?? null,
    }
    _seasonCache[playerName] = result
    return result
  } catch {
    return null
  }
}

// ── Components ────────────────────────────────────────────────────────────────

function StatPill({ label, value, accent = '#333' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: '#0d0d0d', border: `1px solid ${accent}22`,
      borderRadius: '8px', padding: '0.5rem 0.65rem', minWidth: '48px',
    }}>
      <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#ddd', lineHeight: 1 }}>{value ?? '—'}</span>
      <span style={{ fontSize: '0.5rem', color: '#444', letterSpacing: '0.07em', marginTop: '0.22rem', textTransform: 'uppercase' }}>{label}</span>
    </div>
  )
}

function StatRow({ label, children }) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ fontSize: '0.48rem', color: '#2a2a2a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.32rem' }}>{label}</div>
      <div style={{ display: 'flex', gap: '0.32rem', flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function PitcherCard({ pitcher, teamLabel, teamColor, isLock, compact = false }) {
  const { name, todayStats, seasonStats, loading, error } = pitcher
  if (!name) return null

  const s = seasonStats
  const isReliever = s && s.gamesStarted != null && s.gamesPlayed != null && s.gamesStarted < s.gamesPlayed / 2

  return (
    <div style={{
      background: '#0f0f0f', border: `1px solid ${teamColor}22`,
      borderRadius: '10px', padding: compact ? '0.75rem 0.9rem' : '1rem 1.1rem',
      marginBottom: '0.6rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
        <div>
          <div style={{ fontSize: '0.52rem', color: teamColor, letterSpacing: '0.1em', fontWeight: 'bold', marginBottom: '0.18rem' }}>
            {isLock ? '🔒' : '🐕'} {teamLabel.toUpperCase()} · {isReliever ? 'RP' : 'SP'}
          </div>
          <div style={{ fontSize: compact ? '0.85rem' : '0.92rem', fontWeight: 'bold', color: '#eee' }}>{name}</div>
          {s && (
            <div style={{ fontSize: '0.6rem', color: '#333', marginTop: '0.15rem' }}>
              {s.gamesStarted != null ? `${s.gamesPlayed}G · ${s.gamesStarted}GS` : `${s.gamesPlayed ?? '—'}G`}
              {s.battersFaced != null ? ` · ${s.battersFaced} BF` : ''}
            </div>
          )}
        </div>
        {loading && <div style={{ fontSize: '0.58rem', color: '#333' }}>loading…</div>}
        {error && !loading && <div style={{ fontSize: '0.55rem', color: '#ff444455' }}>unavailable</div>}
      </div>

      {/* Today's game line */}
      {todayStats && (
        <StatRow label="game line">
          <StatPill label="IP" value={todayStats.IP} accent={teamColor} />
          <StatPill label="K"  value={todayStats.SO ?? todayStats.K} accent={teamColor} />
          <StatPill label="H"  value={todayStats.H}  accent={teamColor} />
          <StatPill label="ER" value={todayStats.ER} accent={teamColor} />
          <StatPill label="BB" value={todayStats.BB} accent={teamColor} />
          {todayStats.P  && <StatPill label="P"  value={todayStats.P}  accent={teamColor} />}
          {todayStats.S  && <StatPill label="S"  value={todayStats.S}  accent={teamColor} />}
        </StatRow>
      )}
      {!todayStats && !loading && (
        <div style={{ fontSize: '0.63rem', color: '#2a2a2a', marginBottom: '0.65rem' }}>
          Live line appears once game starts
        </div>
      )}

      {s && (
        <>
          {/* Core */}
          <StatRow label={`${new Date().getFullYear()} season — core`}>
            <StatPill label="W-L"  value={s.wins != null ? `${s.wins}-${s.losses}` : null} />
            <StatPill label="ERA"  value={s.era} />
            <StatPill label="WHIP" value={s.whip} />
            <StatPill label="IP"   value={s.inningsPitched} />
            {isReliever && s.saves != null && <StatPill label="SV"  value={s.saves} />}
            {isReliever && s.holds != null && <StatPill label="HLD" value={s.holds} />}
            {isReliever && s.blownSaves != null && <StatPill label="BS" value={s.blownSaves} />}
            {isReliever && s.saveOpportunities != null && <StatPill label="SVO" value={s.saveOpportunities} />}
          </StatRow>

          {/* Raw counting */}
          <StatRow label="counting stats">
            <StatPill label="K"   value={s.strikeOuts} />
            <StatPill label="BB"  value={s.baseOnBalls} />
            <StatPill label="H"   value={s.hits} />
            <StatPill label="HR"  value={s.homeRuns} />
            <StatPill label="ER"  value={s.earnedRuns} />
            {s.hitBatsmen != null && <StatPill label="HBP" value={s.hitBatsmen} />}
          </StatRow>

          {/* Per 9 */}
          <StatRow label="per 9 innings">
            <StatPill label="K/9"  value={s.k9} />
            <StatPill label="BB/9" value={s.bb9} />
            <StatPill label="HR/9" value={s.hr9} />
          </StatRow>

          {/* Rates */}
          <StatRow label="rates & advanced">
            <StatPill label="K%"    value={s.kPct} />
            <StatPill label="BB%"   value={s.bbPct} />
            <StatPill label="BAA"   value={s.avg} />
            <StatPill label="BABIP" value={s.babip} />
            {s.strikeoutWalkRatio != null && <StatPill label="K/BB" value={parseFloat(s.strikeoutWalkRatio).toFixed(2)} />}
          </StatRow>

          {/* Pitch counts */}
          {(s.numberOfPitches != null || s.strikePercentage != null) && (
            <StatRow label="pitch totals">
              {s.numberOfPitches  != null && <StatPill label="Pitches" value={s.numberOfPitches} />}
              {s.strikes          != null && <StatPill label="Strikes" value={s.strikes} />}
              {s.balls            != null && <StatPill label="Balls"   value={s.balls} />}
              {s.strikePercentage != null && <StatPill label="S%"      value={parseFloat(s.strikePercentage).toFixed(1) + '%'} />}
            </StatRow>
          )}
        </>
      )}
    </div>
  )
}

function GameBanner({ pick, dateLabel, showResult = false }) {
  if (!pick) return null
  const homeShort = (pick.home || '').split(' ').pop()
  const awayShort = (pick.away || '').split(' ').pop()
  const lockShort = (pick.team || '').split(' ').pop()
  const isLockHome = homeShort.toLowerCase() === lockShort.toLowerCase() ||
    (pick.home || '').toLowerCase().includes(lockShort.toLowerCase())

  const resultColor = pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#444'

  return (
    <div style={{
      background: '#111', border: '1px solid #1a1a1a', borderRadius: '12px',
      padding: '0.8rem 1rem', marginBottom: '1rem',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        {dateLabel && (
          <div style={{ fontSize: '0.52rem', color: '#333', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
            ⚾ MLB · {dateLabel}
          </div>
        )}
        <div style={{ fontSize: '0.88rem', fontWeight: 'bold', color: '#ccc' }}>
          <span style={{ color: isLockHome ? '#777' : '#fff' }}>{awayShort}</span>
          <span style={{ color: '#2a2a2a', margin: '0 0.35rem' }}>@</span>
          <span style={{ color: isLockHome ? '#fff' : '#777' }}>{homeShort}</span>
        </div>
      </div>
      {showResult && pick.result && (
        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: resultColor }}>
          {pick.result === 'W' ? '✅ W' : '❌ L'}
        </div>
      )}
    </div>
  )
}

function NoProbableCard({ teamShort }) {
  return (
    <div style={{
      background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: '10px',
      padding: '0.75rem 0.9rem', marginBottom: '0.6rem',
    }}>
      <div style={{ fontSize: '0.7rem', color: '#2a2a2a' }}>
        No probable starter listed for {teamShort}
      </div>
    </div>
  )
}

// ── Pitcher fetch hook ────────────────────────────────────────────────────────

function usePitcherData(espnGameId, active) {
  const [pitchers, setPitchers] = useState({})
  const [fetchState, setFetchState] = useState('idle')
  const fetchedRef = useRef(false)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!espnGameId || !active) return
    if (fetchedRef.current) return
    fetchedRef.current = true
    setFetchState('loading')

    ;(async () => {
      const espnData = await fetchGamePitchers(espnGameId)
      if (!espnData) { setFetchState('error'); return }

      const { probableMap, todayStatsMap } = espnData
      const initial = {}
      ;['home', 'away'].forEach(side => {
        const p = probableMap[side]
        initial[side] = {
          name: p?.name || null, todayStats: todayStatsMap[side] || null,
          seasonStats: null, loading: !!p?.name, error: !p?.name,
        }
      })
      setPitchers(initial)
      setFetchState('done')

      await Promise.all(['home', 'away'].map(async side => {
        const name = probableMap[side]?.name
        if (!name) return
        const season = await fetchSeasonStats(name)
        setPitchers(prev => ({
          ...prev,
          [side]: { ...prev[side], seasonStats: season, loading: false, error: !season },
        }))
      }))
    })()
  }, [espnGameId, active, refreshTick])

  function refresh() {
    fetchedRef.current = false
    setPitchers({})
    setFetchState('idle')
    setRefreshTick(t => t + 1)
  }

  return { pitchers, fetchState, refresh }
}

// ── TODAY sub-tab ─────────────────────────────────────────────────────────────

function TodayTab({ todayLock, allGames }) {
  const espnGameId = todayLock?.gameId || null
  const { pitchers, fetchState, refresh } = usePitcherData(espnGameId, true)

  const homeTeam  = todayLock?.home || ''
  const awayTeam  = todayLock?.away || ''
  const homeShort = homeTeam.split(' ').pop()
  const awayShort = awayTeam.split(' ').pop()
  const lockShort = (todayLock?.team || '').split(' ').pop()
  const isLockHome = (todayLock?.home || '').toLowerCase().includes(lockShort.toLowerCase())
  const lockColor  = '#4c9be8'
  const oppColor   = '#666'

  if (!espnGameId) {
    return (
      <div style={{ textAlign: 'center', padding: '3.5rem 0', color: '#2a2a2a' }}>
        <div style={{ fontSize: '1.8rem', marginBottom: '0.6rem' }}>🔒</div>
        <div style={{ fontSize: '0.82rem' }}>Set your lock of the day first.</div>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button onClick={refresh} disabled={fetchState === 'loading'} style={{
          fontSize: '0.6rem', padding: '0.25rem 0.6rem', background: 'transparent',
          border: '1px solid #252525', borderRadius: '5px',
          color: fetchState === 'loading' ? '#333' : '#444',
          cursor: fetchState === 'loading' ? 'not-allowed' : 'pointer',
        }}>
          {fetchState === 'loading' ? '↺ …' : '↺ Pitchers'}
        </button>
      </div>
      <GameBanner pick={todayLock} dateLabel="🔒 LOCK OF THE DAY" showResult={false} />

      {fetchState === 'loading' && (
        <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#333', fontSize: '0.8rem' }}>
          Fetching pitching matchup…
        </div>
      )}
      {fetchState === 'error' && (
        <div style={{ textAlign: 'center', padding: '2rem 0', color: '#333', fontSize: '0.78rem' }}>
          Couldn't load from ESPN.
          <button onClick={refresh} style={{ display: 'block', margin: '0.75rem auto 0', fontSize: '0.62rem', padding: '0.3rem 0.7rem', background: 'transparent', border: '1px solid #252525', borderRadius: '5px', color: '#444', cursor: 'pointer' }}>
            ↺ Retry
          </button>
        </div>
      )}
      {fetchState === 'done' && (
        <>
          {pitchers.away?.name
            ? <PitcherCard pitcher={pitchers.away} teamLabel={awayShort} teamColor={isLockHome ? oppColor : lockColor} isLock={!isLockHome} />
            : <NoProbableCard teamShort={awayShort} />
          }
          {pitchers.home?.name
            ? <PitcherCard pitcher={pitchers.home} teamLabel={homeShort} teamColor={isLockHome ? lockColor : oppColor} isLock={isLockHome} />
            : <NoProbableCard teamShort={homeShort} />
          }
          <div style={{ fontSize: '0.56rem', color: '#1e1e1e', textAlign: 'center', marginTop: '0.75rem' }}>
            ESPN · MLB Stats API
          </div>
        </>
      )}
    </>
  )
}

// ── YESTERDAY sub-tab ─────────────────────────────────────────────────────────

function YesterdayTab() {
  const [pick, setPick]         = useState(null)
  const [loaded, setLoaded]     = useState(false)
  const { pitchers, fetchState } = usePitcherData(pick?.gameId, loaded && !!pick?.gameId)

  useEffect(() => {
    const yKey = getYesterdayKey()
    fetch(`${SERVER}/data`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const p = d?.app?.picks?.[yKey] || null
        setPick(p)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  if (!loaded) return (
    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#333', fontSize: '0.8rem' }}>Loading…</div>
  )

  if (!pick) return (
    <div style={{ textAlign: 'center', padding: '3.5rem 0', color: '#2a2a2a' }}>
      <div style={{ fontSize: '1.8rem', marginBottom: '0.6rem' }}>📅</div>
      <div style={{ fontSize: '0.82rem' }}>No lock pick for yesterday.</div>
    </div>
  )

  const homeShort = (pick.home || '').split(' ').pop()
  const awayShort = (pick.away || '').split(' ').pop()
  const lockShort = (pick.team || '').split(' ').pop()
  const isLockHome = (pick.home || '').toLowerCase().includes(lockShort.toLowerCase())
  const lockColor  = '#4c9be8'
  const oppColor   = '#666'

  return (
    <>
      <GameBanner pick={pick} dateLabel={`${fmtDateLabel(getYesterdayKey())} · YESTERDAY`} showResult={true} />

      {fetchState === 'loading' && (
        <div style={{ textAlign: 'center', padding: '2rem 0', color: '#333', fontSize: '0.8rem' }}>Fetching pitchers…</div>
      )}
      {fetchState === 'done' && (
        <>
          {pitchers.away?.name
            ? <PitcherCard pitcher={pitchers.away} teamLabel={awayShort} teamColor={isLockHome ? oppColor : lockColor} isLock={!isLockHome} compact />
            : <NoProbableCard teamShort={awayShort} />
          }
          {pitchers.home?.name
            ? <PitcherCard pitcher={pitchers.home} teamLabel={homeShort} teamColor={isLockHome ? lockColor : oppColor} isLock={isLockHome} compact />
            : <NoProbableCard teamShort={homeShort} />
          }
        </>
      )}
      {fetchState === 'error' && (
        <div style={{ textAlign: 'center', padding: '1.5rem 0', color: '#333', fontSize: '0.75rem' }}>
          Pitcher data unavailable for this game.
        </div>
      )}
    </>
  )
}

// ── HISTORY sub-tab ───────────────────────────────────────────────────────────

function HistoryRow({ date, pick }) {
  const [expanded, setExpanded] = useState(false)
  const [pitcherData, setPitcherData] = useState(null)
  const [pitcherState, setPitcherState] = useState('idle')
  const fetchedRef = useRef(false)

  const homeShort = (pick.home || '').split(' ').pop()
  const awayShort = (pick.away || '').split(' ').pop()
  const lockShort = (pick.team || '').split(' ').pop()
  const isLockHome = (pick.home || '').toLowerCase().includes(lockShort.toLowerCase())
  const resultColor = pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#333'
  const lockColor   = '#4c9be8'
  const oppColor    = '#555'

  async function load() {
    if (fetchedRef.current) return
    fetchedRef.current = true
    setPitcherState('loading')

    const espnData = await fetchGamePitchers(pick.gameId)
    if (!espnData) { setPitcherState('error'); return }

    const { probableMap, todayStatsMap } = espnData
    const result = {}
    ;['home', 'away'].forEach(side => {
      const p = probableMap[side]
      result[side] = {
        name: p?.name || null, todayStats: todayStatsMap[side] || null,
        seasonStats: null, loading: !!p?.name, error: !p?.name,
      }
    })
    setPitcherData(result)
    setPitcherState('done')

    // Season stats
    await Promise.all(['home', 'away'].map(async side => {
      const name = probableMap[side]?.name
      if (!name) return
      const season = await fetchSeasonStats(name)
      setPitcherData(prev => prev ? ({
        ...prev,
        [side]: { ...prev[side], seasonStats: season, loading: false, error: !season },
      }) : prev)
    }))
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    if (next) load()
  }

  return (
    <div style={{ borderBottom: '1px solid #111', paddingBottom: '0.1rem', marginBottom: '0.1rem' }}>
      <button onClick={toggle} style={{
        width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '0.7rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', color: '#333' }}>{fmtDateLabel(date)}</span>
          <span style={{ fontSize: '0.75rem', color: '#666' }}>
            <span style={{ color: isLockHome ? '#555' : '#aaa' }}>{awayShort}</span>
            <span style={{ color: '#252525', margin: '0 0.25rem' }}>@</span>
            <span style={{ color: isLockHome ? '#aaa' : '#555' }}>{homeShort}</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          {pick.result && (
            <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: resultColor }}>
              {pick.result === 'W' ? '✅' : '❌'}
            </span>
          )}
          <span style={{ fontSize: '0.62rem', color: '#333' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div style={{ paddingBottom: '0.75rem' }}>
          {pitcherState === 'loading' && (
            <div style={{ fontSize: '0.7rem', color: '#333', padding: '0.5rem 0' }}>Fetching pitchers…</div>
          )}
          {pitcherState === 'error' && (
            <div style={{ fontSize: '0.7rem', color: '#333', padding: '0.5rem 0' }}>Pitcher data unavailable.</div>
          )}
          {pitcherState === 'done' && pitcherData && (
            <>
              {pitcherData.away?.name
                ? <PitcherCard pitcher={pitcherData.away} teamLabel={awayShort} teamColor={isLockHome ? oppColor : lockColor} isLock={!isLockHome} compact />
                : <NoProbableCard teamShort={awayShort} />
              }
              {pitcherData.home?.name
                ? <PitcherCard pitcher={pitcherData.home} teamLabel={homeShort} teamColor={isLockHome ? lockColor : oppColor} isLock={isLockHome} compact />
                : <NoProbableCard teamShort={homeShort} />
              }
            </>
          )}
        </div>
      )}
    </div>
  )
}

function HistoryTab() {
  const [picks, setPicks] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const todayKey = getTodayKey()
    const yKey     = getYesterdayKey()
    fetch(`${SERVER}/data`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const allPicks = d?.app?.picks || {}
        // MLB only, not today or yesterday, has gameId, sorted newest first
        const rows = Object.entries(allPicks)
          .filter(([date, p]) =>
            date !== todayKey &&
            date !== yKey &&
            p?.sport === 'MLB' &&
            p?.gameId
          )
          .sort(([a], [b]) => b.localeCompare(a))
        setPicks(rows)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  if (!loaded) return (
    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#333', fontSize: '0.8rem' }}>Loading history…</div>
  )

  if (!picks.length) return (
    <div style={{ textAlign: 'center', padding: '3.5rem 0', color: '#2a2a2a' }}>
      <div style={{ fontSize: '1.8rem', marginBottom: '0.6rem' }}>📋</div>
      <div style={{ fontSize: '0.82rem' }}>No MLB history yet.</div>
    </div>
  )

  return (
    <div>
      {picks.map(([date, pick]) => (
        <HistoryRow key={date} date={date} pick={pick} />
      ))}
    </div>
  )
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export default function MediaTab({ todayLock, allGames }) {
  const [subTab, setSubTab] = useState('today')

  const subTabs = [
    { id: 'today',     label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'history',   label: 'History' },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', color: '#aaa' }}>📺 MEDIA</h2>
        <div style={{ fontSize: '0.75rem', color: '#555' }}>Starting pitcher matchup — lock of the day</div>
      </div>

      {/* Sub-tab nav */}
      <div style={{
        display: 'flex', gap: '0.35rem', marginBottom: '1.25rem',
        borderBottom: '1px solid #1a1a1a', paddingBottom: '0.75rem',
      }}>
        {subTabs.map(({ id, label }) => (
          <button key={id} onClick={() => setSubTab(id)} style={{
            padding: '0.3rem 0.85rem', borderRadius: '6px', cursor: 'pointer',
            fontSize: '0.72rem', fontWeight: subTab === id ? 'bold' : 'normal',
            background: subTab === id ? '#1a1a1a' : 'transparent',
            border: subTab === id ? '1px solid #2a2a2a' : '1px solid transparent',
            color: subTab === id ? '#aaa' : '#444',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {subTab === 'today'     && <TodayTab todayLock={todayLock} allGames={allGames} />}
      {subTab === 'yesterday' && <YesterdayTab />}
      {subTab === 'history'   && <HistoryTab />}
    </div>
  )
}
