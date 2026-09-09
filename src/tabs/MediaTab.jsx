import React, { useState, useEffect, useRef } from 'react'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb'
const MLB_API   = 'https://statsapi.mlb.com/api/v1'
const SERVER    = import.meta.env.VITE_SERVER_HOST || 'http://127.0.0.1:3001'

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
      const side = teamGroup.team?.homeAway || teamGroup.homeAway
      ;(teamGroup.statistics || []).forEach(statGroup => {
        const sgType = (statGroup.type || statGroup.name || '').toLowerCase()
        if (sgType !== 'pitching') return
        const labels = statGroup.labels || []
        ;(statGroup.athletes || []).forEach(a => {
          const pname = a.athlete?.displayName
          if (!pname) return
          const stats = {}
          labels.forEach((lbl, i) => { stats[lbl] = a.stats?.[i] })

          // ESPN sometimes returns pitch count as "PC-ST" (e.g. "94-62") instead of
          // separate "P" and "S" columns — split it here
          if (stats['PC-ST'] && typeof stats['PC-ST'] === 'string' && stats['PC-ST'].includes('-')) {
            const [pc, st] = stats['PC-ST'].split('-')
            if (!stats.P && pc) stats.P = pc
            if (!stats.S && st) stats.S = st
          }
          // Also handle label variants
          if (!stats.P && stats['PC'])  stats.P = stats['PC']
          if (!stats.P && stats['#P'])  stats.P = stats['#P']

          const matchSide = Object.keys(probableMap).find(s => probableMap[s]?.name === pname)
          if (matchSide) todayStatsMap[matchSide] = stats
        })
      })
    })

    // ── Batting lineups ──────────────────────────────────────────────────────
    // ESPN: playerGroups[0] = away, playerGroups[1] = home (index is reliable;
    // teamGroup.team?.homeAway is undefined in practice)
    const batterMap = { home: [], away: [] }
    const SIDE_BY_INDEX = ['away', 'home']
    playerGroups.forEach((teamGroup, tgIdx) => {
      const side = teamGroup.team?.homeAway || teamGroup.homeAway || SIDE_BY_INDEX[tgIdx]
      if (!batterMap[side]) return
      ;(teamGroup.statistics || []).forEach(statGroup => {
        const sgType = (statGroup.type || statGroup.name || statGroup.abbreviation || '').toLowerCase()
        if (!sgType.includes('batting') && !sgType.includes('hitting')) return
        const labels = statGroup.labels || []
        ;(statGroup.athletes || []).forEach(a => {
          const ath = a.athlete || {}
          if (!ath.displayName) return
          // ESPN labels for batting: ["H-AB","AB","R","H","RBI","HR","BB","K","#P","AVG","OBP","SLG"]
          const stats = {}
          labels.forEach((lbl, i) => { stats[lbl] = a.stats?.[i] })
          batterMap[side].push({
            name:     ath.displayName,
            espnId:   ath.id || null,
            batOrder: a.batOrder != null ? parseInt(a.batOrder, 10) : null,
            position: ath.position?.abbreviation || ath.position?.name || null,
            stats,  // keys: H-AB, AB, R, H, RBI, HR, BB, K, #P, AVG, OBP, SLG
          })
        })
      })
      batterMap[side].sort((a, b) => (a.batOrder ?? 99) - (b.batOrder ?? 99))
    })

    return { probableMap, todayStatsMap, batterMap }
  } catch {
    return null
  }
}

const _seasonCache = {}
async function fetchSeasonStats(playerName) {
  if (_seasonCache[playerName]) return _seasonCache[playerName]
  try {
    // Try full name first, then last name only as fallback
    const trySearch = async (q) => {
      const res = await fetch(`${MLB_API}/people/search?names=${encodeURIComponent(q)}&sportId=1`)
      const d = await res.json()
      return d.people?.[0] || null
    }
    let person = await trySearch(playerName)
    if (!person) {
      const lastName = playerName.split(' ').slice(1).join(' ')
      if (lastName) person = await trySearch(lastName)
    }
    if (!person) return null

    const year = new Date().getFullYear()
    const statsRes = await fetch(`${MLB_API}/people/${person.id}/stats?stats=season&group=pitching&season=${year}&sportId=1`)
    const statsData = await statsRes.json()
    const splits = statsData.stats?.[0]?.splits
    // If no splits yet (early season / new player), return a skeleton with just personId
    if (!splits?.length) {
      const skeleton = { personId: person.id, _noStats: true }
      _seasonCache[playerName] = skeleton
      return skeleton
    }

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
      // MLB person id — used for highlight filtering
      personId: person.id,
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

// ── Batter season stats ───────────────────────────────────────────────────────

const _batterCache = {}
async function fetchBatterSeasonStats(playerName) {
  if (_batterCache[playerName]) return _batterCache[playerName]
  try {
    const trySearch = async (q) => {
      const res = await fetch(`${MLB_API}/people/search?names=${encodeURIComponent(q)}&sportId=1`)
      const d = await res.json()
      return d.people?.[0] || null
    }
    let person = await trySearch(playerName)
    if (!person) {
      const lastName = playerName.split(' ').slice(1).join(' ')
      if (lastName) person = await trySearch(lastName)
    }
    if (!person) return null

    const year = new Date().getFullYear()
    const statsRes = await fetch(`${MLB_API}/people/${person.id}/stats?stats=season&group=hitting&season=${year}&sportId=1`)
    const statsData = await statsRes.json()
    const splits = statsData.stats?.[0]?.splits
    if (!splits?.length) {
      const skeleton = { personId: person.id, _noStats: true }
      _batterCache[playerName] = skeleton
      return skeleton
    }

    const s = splits[0].stat
    const pa = s.plateAppearances ?? null
    const ab = s.atBats ?? null

    const result = {
      personId:          person.id,
      gamesPlayed:       s.gamesPlayed       ?? null,
      avg:               s.avg               ?? null,
      obp:               s.obp               ?? null,
      slg:               s.slg               ?? null,
      ops:               s.ops               ?? null,
      hits:              s.hits              ?? null,
      homeRuns:          s.homeRuns          ?? null,
      rbi:               s.rbi               ?? null,
      runs:              s.runs              ?? null,
      stolenBases:       s.stolenBases       ?? null,
      strikeOuts:        s.strikeOuts        ?? null,
      baseOnBalls:       s.baseOnBalls       ?? null,
      atBats:            ab,
      plateAppearances:  pa,
      doubles:           s.doubles           ?? null,
      triples:           s.triples           ?? null,
      babip:             s.babip             ?? null,
      // derived
      kPct: pa && s.strikeOuts != null ? ((s.strikeOuts / pa) * 100).toFixed(1) + '%' : null,
      bbPct: pa && s.baseOnBalls != null ? ((s.baseOnBalls / pa) * 100).toFixed(1) + '%' : null,
    }
    _batterCache[playerName] = result
    return result
  } catch {
    return null
  }
}

// ── Highlights fetching ───────────────────────────────────────────────────────

// Resolve ESPN game date + teams → MLB gamePk
const _gamePkCache = {}
async function fetchGamePk(dateKey, homeTeam, awayTeam) {
  const cacheKey = `${dateKey}|${homeTeam}|${awayTeam}`
  if (_gamePkCache[cacheKey]) return _gamePkCache[cacheKey]
  try {
    const res  = await fetch(`${MLB_API}/schedule?sportId=1&date=${dateKey}&hydrate=team`)
    const data = await res.json()
    const games = data.dates?.[0]?.games || []
    // Fuzzy match on last word of team name (e.g. "Astros", "Angels")
    const homeWord = homeTeam.split(' ').pop().toLowerCase()
    const awayWord = awayTeam.split(' ').pop().toLowerCase()
    const game = games.find(g => {
      const h = g.teams.home.team.name.toLowerCase()
      const a = g.teams.away.team.name.toLowerCase()
      return h.includes(homeWord) && a.includes(awayWord)
    })
    if (!game) return null
    _gamePkCache[cacheKey] = game.gamePk
    return game.gamePk
  } catch { return null }
}

// Fetch confirmed lineup from MLB Stats API for a given gamePk.
// Returns { home: [...], away: [...] } matching the batterMap shape, or null.
const _lineupCache = {}
async function fetchMlbLineup(gamePk) {
  if (!gamePk) return null
  if (_lineupCache[gamePk]) return _lineupCache[gamePk]
  try {
    // hydrate=lineups gives the confirmed batting order pre-game and in-game.
    // Returns { confirmed: true/false, home: [...], away: [...] }
    // confirmed=false when lineups key is null (pre-submission) — caller should
    // flag lineup as "not yet confirmed" in the UI.
    const res  = await fetch(`${MLB_API}/schedule?gamePk=${gamePk}&hydrate=lineups`)
    const data = await res.json()
    const game = data.dates?.[0]?.games?.[0]
    if (!game) return null

    const lineups = game.lineups
    // lineups is null pre-submission (~30-60 min before first pitch)
    const confirmed = !!(lineups && (lineups.homePlayers?.length || lineups.awayPlayers?.length))

    const result = { confirmed, home: [], away: [] }
    if (confirmed) {
      const sideMap = { homePlayers: 'home', awayPlayers: 'away' }
      for (const [key, side] of Object.entries(sideMap)) {
        const players = lineups[key] || []
        players.forEach((p, idx) => {
          result[side].push({
            name:     p.fullName || null,
            espnId:   null,
            batOrder: idx + 1,
            position: p.primaryPosition?.abbreviation || p.position?.abbreviation || null,
            stats:    {},
          })
        })
      }
    }

    const hasData = result.confirmed || true  // always cache so we know status
    _lineupCache[gamePk] = result
    return result
  } catch { return null }
}

// Fetch all highlight clips for a game, optionally filtered by MLB personId
const _highlightCache = {}

// Call this to bust all module-level caches on manual refresh
function clearAllCaches() {
  Object.keys(_seasonCache).forEach(k => delete _seasonCache[k])
  Object.keys(_batterCache).forEach(k => delete _batterCache[k])
  Object.keys(_gamePkCache).forEach(k => delete _gamePkCache[k])
  Object.keys(_highlightCache).forEach(k => delete _highlightCache[k])
  Object.keys(_lineupCache).forEach(k => delete _lineupCache[k])
}

async function fetchGameHighlights(gamePk) {
  if (_highlightCache[gamePk]) return _highlightCache[gamePk]
  try {
    const res  = await fetch(`${MLB_API}/game/${gamePk}/content`)
    const data = await res.json()
    const items = data.highlights?.highlights?.items || []
    _highlightCache[gamePk] = items
    return items
  } catch { return [] }
}

function filterHighlightsByPlayer(items, personId) {
  if (!personId) return []
  const idStr = String(personId)
  return items.filter(item =>
    (item.keywordsAll || []).some(k => k.type === 'player_id' && k.value === idStr)
  )
}

// Pick the best MP4 playback URL from a highlight item
function getBestPlaybackUrl(item) {
  const playbacks = item.playbacks || []
  // Prefer 1800K (720p-ish), then 1200K, then anything with an mp4 url
  const preferred = ['1800K', '1200K', '600K', 'FLASH_1800K', 'HTTP_CLOUD_TABLET_720']
  for (const name of preferred) {
    const pb = playbacks.find(p => p.name === name)
    if (pb?.url) return pb.url
  }
  // fallback: first playback with a url
  return playbacks.find(p => p.url)?.url || null
}

// ── Components ────────────────────────────────────────────────────────────────

function HighlightClip({ item, dateLabel }) {
  const [playing, setPlaying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const url = getBestPlaybackUrl(item)
  if (!url) return null

  const thumb = item.image?.cuts?.find(c => c.width >= 400)?.src || item.image?.cuts?.[0]?.src
  const title = item.headline || item.title || 'Highlight'
  const duration = item.duration || ''

  return (
    <div style={{
      marginBottom: '1rem',
      borderRadius: '10px',
      overflow: 'hidden',
      border: '1px solid #222',
      background: '#181818',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    }}>
      {/* Caption bar — top */}
      <div style={{
        padding: '0.6rem 0.75rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem',
        borderBottom: '1px solid #222',
      }}>
        <div style={{ fontSize: '0.75rem', color: '#fff', lineHeight: 1.4, flex: 1, fontWeight: '500' }}>{title}</div>
        {dateLabel && (
          <div style={{
            fontSize: '0.55rem', color: '#fff', fontWeight: 'bold',
            background: '#1e1e1e', border: '1px solid #2e2e2e',
            padding: '2px 7px', borderRadius: '20px',
            whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.04em',
          }}>{dateLabel}</div>
        )}
      </div>

      {/* Thumbnail / player */}
      {!playing ? (
        <div
          onClick={() => setPlaying(true)}
          style={{ position: 'relative', cursor: 'pointer', background: '#080808', aspectRatio: '16/9', overflow: 'hidden' }}
        >
          {thumb && (
            <img
              src={thumb} alt={title}
              style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover', opacity: 0.85 }}
            />
          )}
          {/* Bottom gradient fade */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%)',
            pointerEvents: 'none',
          }} />
          {/* Glass play button */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
              transition: 'transform 0.15s ease',
            }}>
              <span style={{ fontSize: '1.1rem', marginLeft: '3px', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}>▶</span>
            </div>
          </div>
          {/* Duration badge */}
          {duration && (
            <div style={{
              position: 'absolute', bottom: '8px', right: '10px',
              fontSize: '0.5rem', color: '#eee', background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              padding: '2px 5px', borderRadius: '4px', letterSpacing: '0.04em',
            }}>{duration}</div>
          )}
        </div>
      ) : (
        <div style={{ position: 'relative', aspectRatio: expanded ? 'auto' : '16/9', background: '#000' }}>
          <video
            src={url} controls autoPlay
            style={{ width: '100%', height: '100%', display: 'block', objectFit: expanded ? 'contain' : 'cover' }}
          />
          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              position: 'absolute', top: '6px', right: '6px',
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: '5px',
              color: '#ddd', fontSize: '0.55rem', padding: '2px 6px', cursor: 'pointer',
            }}
          >
            {expanded ? '⊡ fit' : '⊞ expand'}
          </button>
        </div>
      )}


    </div>
  )
}

function PitcherHighlights({ personId, gamePk, accent, dateLabel }) {
  const [clips, setClips]       = useState(null)  // null=loading, []+=done
  const [error, setError]       = useState(false)
  const [collapsed, setCollapsed] = useState(true)  // collapsed by default

  useEffect(() => {
    if (!gamePk || !personId) { setClips([]); return }
    let cancelled = false
    fetchGameHighlights(gamePk).then(items => {
      if (cancelled) return
      const filtered = filterHighlightsByPlayer(items, personId)
      setClips(filtered)
    }).catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [gamePk, personId])

  if (!gamePk || !personId) return null
  if (error) return <div style={{ fontSize: '0.58rem', color: '#ccc', marginBottom: '0.5rem' }}>Highlights unavailable</div>
  if (clips === null) return (
    <div style={{ fontSize: '0.58rem', color: '#ccc', marginBottom: '0.5rem', animation: 'pulse 1s infinite' }}>
      Loading highlights…
    </div>
  )
  if (clips.length === 0) return (
    <div style={{ fontSize: '0.58rem', color: '#bbb', marginBottom: '0.5rem' }}>
      No highlights posted yet for this outing
    </div>
  )

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* Section divider label — tap to expand/collapse */}
      <button onClick={() => setCollapsed(c => !c)} style={{
        width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: collapsed ? 0 : '0.75rem',
        }}>
          <div style={{ flex: 1, height: '1px', background: '#1e1e1e' }} />
          <div style={{
            fontSize: '0.48rem', color: '#aaa', letterSpacing: '0.12em',
            textTransform: 'uppercase', fontWeight: 'bold', whiteSpace: 'nowrap',
          }}>
            🎬 Highlights · {clips.length} clip{clips.length !== 1 ? 's' : ''} {collapsed ? '▼' : '▲'}
          </div>
          <div style={{ flex: 1, height: '1px', background: '#1e1e1e' }} />
        </div>
      </button>
      {!collapsed && clips.map(item => <HighlightClip key={item.id} item={item} dateLabel={dateLabel} />)}
    </div>
  )
}



function StatPill({ label, value, accent = '#aaa', bright = false }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: bright ? `${accent}20` : '#1e1e1e',
      border: `1px solid ${bright ? accent + '55' : '#383838'}`,
      borderRadius: '8px', padding: '0.5rem 0.65rem', minWidth: '48px',
    }}>
      <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: bright ? '#fff' : '#e8e8e8', lineHeight: 1 }}>{value ?? '—'}</span>
      <span style={{ fontSize: '0.5rem', color: bright ? accent : '#aaa', letterSpacing: '0.07em', marginTop: '0.22rem', textTransform: 'uppercase' }}>{label}</span>
    </div>
  )
}

function StatRow({ label, children, highlight = false }) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ fontSize: '0.5rem', color: highlight ? '#fff' : '#ccc', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.35rem', fontWeight: 'bold' }}>{label}</div>
      <div style={{ display: 'flex', gap: '0.32rem', flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function SectionDivider({ label, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1rem 0 0.8rem' }}>
      <div style={{ flex: 1, height: '1px', background: '#333' }} />
      <div style={{ fontSize: '0.48rem', color: accent || '#ccc', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ flex: 1, height: '1px', background: '#333' }} />
    </div>
  )
}

function PitcherCard({ pitcher, teamLabel, teamColor, isLock, compact = false, gamePk, dateLabel }) {
  const { name, todayStats, seasonStats, loading, error, personId } = pitcher
  if (!name) return null

  const s = seasonStats?._noStats ? null : seasonStats
  const isReliever = s && s.gamesStarted != null && s.gamesPlayed != null && s.gamesStarted < s.gamesPlayed / 2
  const hasPersonId = personId || seasonStats?.personId

  return (
    <div style={{
      background: '#141414',
      border: `1px solid ${teamColor}55`,
      borderRadius: '14px',
      padding: compact ? '0.9rem 1rem' : '1.1rem 1.25rem',
      marginBottom: '0.85rem',
      boxShadow: `0 0 20px ${teamColor}0a`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.58rem', color: teamColor, letterSpacing: '0.1em', fontWeight: 'bold', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ background: `${teamColor}22`, border: `1px solid ${teamColor}44`, borderRadius: '4px', padding: '0.08rem 0.45rem' }}>
              {isLock ? '🔒' : '🐕'} {teamLabel.toUpperCase()}
            </span>
            <span style={{ color: '#aaa', fontWeight: 'normal' }}>{isReliever ? 'RP' : 'SP'}</span>
            {dateLabel && <span style={{ color: '#888' }}>· {dateLabel}</span>}
          </div>
          <div style={{ fontSize: compact ? '1rem' : '1.15rem', fontWeight: 'bold', color: '#fff', marginBottom: '0.15rem' }}>{name}</div>
          {s && (
            <div style={{ fontSize: '0.62rem', color: '#999', marginTop: '0.1rem' }}>
              {s.gamesStarted != null ? `${s.gamesPlayed}G · ${s.gamesStarted}GS` : `${s.gamesPlayed ?? '—'}G`}
              {s.battersFaced != null ? ` · ${s.battersFaced} BF` : ''}
            </div>
          )}
        </div>
        {loading && <div style={{ fontSize: '0.6rem', color: '#666', fontStyle: 'italic' }}>loading…</div>}
        {error && !loading && !seasonStats && <div style={{ fontSize: '0.55rem', color: '#ff4444aa' }}>stats unavailable</div>}
      </div>

      {/* ── TODAY'S GAME LINE ── */}
      {todayStats && (
        <div style={{ background: `${teamColor}10`, border: `1px solid ${teamColor}33`, borderRadius: '10px', padding: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.52rem', color: teamColor, fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>⚡ Live Game Line</div>
          <div style={{ display: 'flex', gap: '0.32rem', flexWrap: 'wrap' }}>
            {todayStats.P  && <StatPill label="P"   value={todayStats.P}  accent={teamColor} bright />}
            {todayStats.S  && <StatPill label="STR" value={todayStats.S}  accent={teamColor} bright />}
            {todayStats.P && todayStats.S && (() => {
              const pct = Math.round((parseInt(todayStats.S) / parseInt(todayStats.P)) * 100)
              return isNaN(pct) ? null : <StatPill label="S%" value={pct + '%'} accent={teamColor} bright />
            })()}
            <StatPill label="IP" value={todayStats.IP} accent={teamColor} bright />
            <StatPill label="K"  value={todayStats.SO ?? todayStats.K} accent={teamColor} bright />
            <StatPill label="H"  value={todayStats.H}  accent={teamColor} bright />
            <StatPill label="ER" value={todayStats.ER} accent={teamColor} bright />
            <StatPill label="BB" value={todayStats.BB} accent={teamColor} bright />
          </div>
        </div>
      )}
      {!todayStats && !loading && (
        <div style={{ fontSize: '0.65rem', color: '#999', marginBottom: '0.75rem', fontStyle: 'italic' }}>
          Live line appears once game starts
        </div>
      )}

      {/* ── SEASON STATS — plain, not highlighted ── */}
      {s && (
        <>
          <SectionDivider label={`${new Date().getFullYear()} season`} accent={teamColor} />

          {/* Core */}
          <StatRow label="core">
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
          <StatRow label="counting">
            <StatPill label="K"   value={s.strikeOuts}  />
            <StatPill label="BB"  value={s.baseOnBalls} />
            <StatPill label="H"   value={s.hits}        />
            <StatPill label="HR"  value={s.homeRuns}    />
            <StatPill label="ER"  value={s.earnedRuns}  />
            {s.hitBatsmen != null && <StatPill label="HBP" value={s.hitBatsmen} />}
          </StatRow>

          {/* Per 9 */}
          <StatRow label="per 9">
            <StatPill label="K/9"  value={s.k9} />
            <StatPill label="BB/9" value={s.bb9} />
            <StatPill label="HR/9" value={s.hr9} />
          </StatRow>

          {/* Rates */}
          <StatRow label="rates">
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

      {/* Highlights */}
      {gamePk && <PitcherHighlights personId={hasPersonId} gamePk={gamePk} accent={teamColor} dateLabel={dateLabel} />}
    </div>
  )
}

// ── Batter components ─────────────────────────────────────────────────────────

function BatterRow({ batter, teamColor, gamePk, dateLabel }) {
  const [expanded, setExpanded] = useState(false)
  const [season, setSeason]     = useState(null)
  const [loadingSeason, setLoadingSeason] = useState(false)

  const s = batter.stats  // ESPN keys: H-AB, AB, R, H, RBI, HR, BB, K, #P, AVG, OBP, SLG
  const hasGame = s && s['H-AB'] && s['H-AB'] !== '0-0'

  function toggle() {
    setExpanded(e => !e)
    if (!season && !loadingSeason) {
      setLoadingSeason(true)
      fetchBatterSeasonStats(batter.name).then(res => {
        setSeason(res)
        setLoadingSeason(false)
      })
    }
  }

  const orderStr = batter.batOrder != null ? `${batter.batOrder}.` : '·'
  const posStr   = batter.position || ''

  return (
    <div style={{ borderBottom: '1px solid #252525' }}>
      <button onClick={toggle} style={{
        width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '0.6rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left',
      }}>
        <span style={{ fontSize: '0.65rem', color: '#777', minWidth: '18px', textAlign: 'right' }}>{orderStr}</span>
        <span style={{ fontSize: '0.65rem', color: '#aaa', minWidth: '24px' }}>{posStr}</span>
        <span style={{ flex: 1, fontSize: '0.82rem', color: '#fff', fontWeight: '600' }}>{batter.name}</span>
        {hasGame && (
          <span style={{ fontSize: '0.7rem', color: teamColor, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            {s['H-AB']}
            {s.HR && s.HR !== '0' ? ` · ${s.HR}HR` : ''}
            {s.RBI && s.RBI !== '0' ? ` · ${s.RBI}RBI` : ''}
          </span>
        )}
        <span style={{ fontSize: '0.52rem', color: '#666', marginLeft: '0.25rem' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ paddingBottom: '0.6rem', paddingLeft: '2.5rem' }}>
          {/* In-game stats */}
          {hasGame && (
            <StatRow label="game line">
              {['AB','R','H','RBI','HR','BB','K'].map(lbl =>
                s[lbl] != null
                  ? <StatPill key={lbl} label={lbl} value={s[lbl]} accent={teamColor} />
                  : null
              )}
              {s['#P'] != null && <StatPill label="P" value={s['#P']} accent={teamColor} />}
              {s.AVG != null && <StatPill label="AVG" value={s.AVG} accent={teamColor} />}
            </StatRow>
          )}
          {!hasGame && (
            <div style={{ fontSize: '0.58rem', color: '#bbb', marginBottom: '0.5rem' }}>
              Game line appears once batting starts
            </div>
          )}

          {/* Season stats */}
          {loadingSeason && (
            <div style={{ fontSize: '0.58rem', color: '#bbb', marginBottom: '0.5rem' }}>Loading season stats…</div>
          )}
          {season && season._noStats && (
            <div style={{ fontSize: '0.58rem', color: '#bbb', marginBottom: '0.5rem' }}>No season stats yet</div>
          )}
          {season && !season._noStats && (
            <>
              <StatRow label={`${new Date().getFullYear()} season — slash`}>
                <StatPill label="AVG"  value={season.avg} />
                <StatPill label="OBP"  value={season.obp} />
                <StatPill label="SLG"  value={season.slg} />
                <StatPill label="OPS"  value={season.ops} />
              </StatRow>
              <StatRow label="counting stats" highlight>
                <StatPill label="G"   value={season.gamesPlayed} accent={teamColor} bright />
                <StatPill label="H"   value={season.hits}        accent={teamColor} bright />
                <StatPill label="HR"  value={season.homeRuns}    accent={teamColor} bright />
                <StatPill label="RBI" value={season.rbi}         accent={teamColor} bright />
                <StatPill label="R"   value={season.runs}        accent={teamColor} bright />
                <StatPill label="SB"  value={season.stolenBases} accent={teamColor} bright />
                <StatPill label="BB"  value={season.baseOnBalls} accent={teamColor} bright />
                <StatPill label="K"   value={season.strikeOuts}  accent={teamColor} bright />
              </StatRow>
              <StatRow label="rates">
                <StatPill label="K%"    value={season.kPct} />
                <StatPill label="BB%"   value={season.bbPct} />
                <StatPill label="BABIP" value={season.babip} />
                {season.doubles  != null && <StatPill label="2B" value={season.doubles} />}
                {season.triples  != null && <StatPill label="3B" value={season.triples} />}
              </StatRow>
            </>
          )}

          {/* Highlights */}
          {gamePk && season?.personId && (
            <PitcherHighlights personId={season.personId} gamePk={gamePk} accent={teamColor} dateLabel={dateLabel} />
          )}
        </div>
      )}
    </div>
  )
}

function BatterCard({ batters, teamLabel, teamColor, gamePk, dateLabel }) {
  const [collapsed, setCollapsed] = useState(true)

  if (!batters?.length) return (
    <div style={{
      background: '#141414', border: `1px solid ${teamColor}33`,
      borderRadius: '14px', padding: '0.8rem 1rem', marginBottom: '0.85rem',
    }}>
      <div style={{ fontSize: '0.58rem', color: teamColor, fontWeight: 'bold', marginBottom: '0.2rem' }}>
        ⚾ {teamLabel.toUpperCase()} · LINEUP
        {dateLabel && <span style={{ color: '#666', marginLeft: '0.5rem' }}>· {dateLabel}</span>}
      </div>
      <div style={{ fontSize: '0.7rem', color: '#777', fontStyle: 'italic' }}>Lineup posts closer to first pitch</div>
    </div>
  )

  return (
    <div style={{
      background: '#141414', border: `1px solid ${teamColor}44`,
      borderRadius: '14px', padding: '0.9rem 1rem', marginBottom: '0.85rem',
    }}>
      <button onClick={() => setCollapsed(c => !c)} style={{
        width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
        padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '0.58rem', color: teamColor, fontWeight: 'bold', marginBottom: '0.15rem', letterSpacing: '0.08em' }}>
            ⚾ {teamLabel.toUpperCase()} · LINEUP
            {dateLabel && <span style={{ color: '#666', marginLeft: '0.5rem' }}>· {dateLabel}</span>}
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 'bold', color: '#fff' }}>
            {batters.length} batters
          </div>
        </div>
        <span style={{ fontSize: '0.68rem', color: '#888', background: '#222', border: '1px solid #333', borderRadius: '5px', padding: '0.15rem 0.5rem' }}>
          {collapsed ? '▼ show' : '▲ hide'}
        </span>
      </button>

      {!collapsed && (
        <div style={{ marginTop: '0.65rem', borderTop: '1px solid #2a2a2a', paddingTop: '0.5rem' }}>
          {batters.map((b, i) => (
            <BatterRow
              key={b.espnId || b.name || i}
              batter={b}
              teamColor={teamColor}
              gamePk={gamePk}
              dateLabel={dateLabel}
            />
          ))}
        </div>
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

  const resultColor = pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#666'

  return (
    <div style={{
      background: '#141414', border: '1px solid #333', borderRadius: '14px',
      padding: '1rem 1.25rem', marginBottom: '1.25rem',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        {dateLabel && (
          <div style={{ fontSize: '0.58rem', color: '#888', letterSpacing: '0.08em', marginBottom: '0.3rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
            ⚾ MLB · {dateLabel}
          </div>
        )}
        <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>
          <span style={{ color: isLockHome ? '#777' : '#fff' }}>{awayShort}</span>
          <span style={{ color: '#555', margin: '0 0.4rem' }}>@</span>
          <span style={{ color: isLockHome ? '#fff' : '#777' }}>{homeShort}</span>
        </div>
      </div>
      {showResult && pick.result && (
        <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: resultColor }}>
          {pick.result === 'W' ? '✅ W' : '❌ L'}
        </div>
      )}
    </div>
  )
}

function NoProbableCard({ teamShort }) {
  return (
    <div style={{
      background: '#141414', border: '1px solid #2a2a2a', borderRadius: '14px',
      padding: '0.9rem 1rem', marginBottom: '0.85rem',
    }}>
      <div style={{ fontSize: '0.75rem', color: '#777' }}>
        No probable starter listed for {teamShort}
      </div>
    </div>
  )
}

// ── Pitcher fetch hook ────────────────────────────────────────────────────────

function usePitcherData(espnGameId, active, dateKey, homeTeam, awayTeam) {
  const [pitchers, setPitchers] = useState({})
  const [batters, setBatters]   = useState({ home: [], away: [] })
  const [lineupConfirmed, setLineupConfirmed] = useState(null) // null=unknown, true=confirmed, false=TBD (ESPN fallback)
  const [fetchState, setFetchState] = useState('idle')
  const [gamePk, setGamePk] = useState(null)
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

      const { probableMap, todayStatsMap, batterMap } = espnData
      const initial = {}
      ;['home', 'away'].forEach(side => {
        const p = probableMap[side]
        initial[side] = {
          name: p?.name || null, todayStats: todayStatsMap[side] || null,
          seasonStats: null, loading: !!p?.name, error: !p?.name, personId: null,
        }
      })
      setPitchers(initial)
      setBatters(batterMap || { home: [], away: [] })
      setFetchState('done')

      // Fetch gamePk from MLB schedule (for highlights + confirmed lineup)
      if (dateKey && homeTeam && awayTeam) {
        fetchGamePk(dateKey, homeTeam, awayTeam).then(async pk => {
          if (!pk) return
          setGamePk(pk)
          // Try to get the confirmed lineup from MLB Stats API.
          // This replaces the ESPN box-score batterMap which only contains
          // batters who have actually batted (misses players on off days).
          const confirmedLineup = await fetchMlbLineup(pk)
          if (confirmedLineup) {
            // Track lineup confirmation status for UI badge
            setLineupConfirmed(confirmedLineup.confirmed)

            if (confirmedLineup.confirmed) {
              // Merge MLB confirmed lineup order with ESPN live stats.
              // Match priority: 1) full name exact, 2) last name, 3) batOrder slot fallback
              setBatters(prev => {
                const merged = { home: [], away: [] }
                for (const side of ['home', 'away']) {
                  const espnBatters = prev[side] || []
                  const mlbBatters  = confirmedLineup[side] || []
                  if (mlbBatters.length === 0) {
                    merged[side] = espnBatters
                  } else {
                    merged[side] = mlbBatters.map(mlbP => {
                      if (!mlbP.name) return mlbP
                      const mlbFull = mlbP.name.toLowerCase()
                      const mlbLast = mlbP.name.split(' ').pop().toLowerCase()
                      // 1) Full name match
                      let espnP = espnBatters.find(e => e.name?.toLowerCase() === mlbFull)
                      // 2) Last name match
                      if (!espnP) espnP = espnBatters.find(e => {
                        if (!e.name) return false
                        return e.name.split(' ').pop().toLowerCase() === mlbLast
                      })
                      // 3) batOrder slot fallback — ESPN abbreviated name (e.g. "Y. Alvarez")
                      if (!espnP && mlbP.batOrder != null) {
                        espnP = espnBatters.find(e => e.batOrder === mlbP.batOrder)
                      }
                      return {
                        ...mlbP,
                        espnId: espnP?.espnId ?? null,
                        stats:  espnP?.stats  ?? {},
                      }
                    })
                  }
                }
                return merged
              })
            } else {
              // lineups not yet submitted — keep ESPN box-score order, flag as TBD
              // (ESPN batters already set from initial fetch; no change needed)
            }
          }
        })
      }

      await Promise.all(['home', 'away'].map(async side => {
        const name = probableMap[side]?.name
        if (!name) return
        const season = await fetchSeasonStats(name)
        setPitchers(prev => ({
          ...prev,
          [side]: {
            ...prev[side],
            seasonStats: season,
            personId: season?.personId || null,
            loading: false,
            error: !season,  // only error if completely null (not found at all)
          },
        }))
      }))
    })()
  }, [espnGameId, active, refreshTick, dateKey, homeTeam, awayTeam])

  function refresh() {
    clearAllCaches()
    fetchedRef.current = false
    setPitchers({})
    setBatters({ home: [], away: [] })
    setFetchState('idle')
    setGamePk(null)
    setRefreshTick(t => t + 1)
  }

  return { pitchers, batters, fetchState, gamePk, refresh }
}

// ── MLB team color map (fallback for history/yesterday) ──────────────────────
const MLB_TEAM_COLORS = {
  'Angels':    '#003263', 'Astros':    '#002d62', 'Athletics': '#003831',
  'BlueJays':  '#134a8e', 'Jays':      '#134a8e', 'Braves':    '#ce1141',
  'Brewers':   '#ffc52f', 'Cardinals': '#c41e3a', 'Cubs':      '#0e3386',
  'Diamondbacks': '#a71930', 'Dodgers': '#005a9c', 'Giants':   '#fd5a1e',
  'Guardians': '#00385d', 'Mariners':  '#0c2c56', 'Marlins':   '#00a3e0',
  'Mets':      '#002d72', 'Nationals': '#ab0003', 'Orioles':   '#df4601',
  'Padres':    '#2f241d', 'Phillies':  '#e81828', 'Pirates':   '#27251f',
  'Rangers':   '#003278', 'Rays':      '#092c5c', 'RedSox':    '#bd3039',
  'Reds':      '#c6011f', 'Rockies':   '#333366', 'Royals':    '#004687',
  'Tigers':    '#0c2340', 'Twins':     '#002b5c', 'WhiteSox':  '#27251f',
  'Yankees':   '#003087',
}

function teamColor(teamName) {
  if (!teamName) return '#4c9be8'
  const word = teamName.split(' ').pop()
  return MLB_TEAM_COLORS[word] || '#4c9be8'
}

// ── Team color resolver ──────────────────────────────────────────────────────

function resolveTeamColors(allGames, homeTeam, awayTeam) {
  if (!allGames?.length || !homeTeam || !awayTeam) return { homeColor: null, awayColor: null }
  const homeWord = homeTeam.split(' ').pop().toLowerCase()
  const awayWord = awayTeam.split(' ').pop().toLowerCase()
  const game = allGames.find(g =>
    g.home_team?.toLowerCase().includes(homeWord) &&
    g.away_team?.toLowerCase().includes(awayWord)
  )
  return {
    homeColor: game?._dk?.homeColor || null,
    awayColor: game?._dk?.awayColor || null,
  }
}

// ── TODAY sub-tab ─────────────────────────────────────────────────────────────

function TodayTab({ todayLock, allGames }) {
  const espnGameId = todayLock?.gameId || null
  const dateKey    = getTodayKey()
  const { pitchers, batters, fetchState, gamePk, refresh } = usePitcherData(
    espnGameId, true, dateKey, todayLock?.home, todayLock?.away
  )
  const [btnState, setBtnState] = useState('idle') // 'idle' | 'ok' | 'err'

  function handleRefresh() {
    refresh()
    setBtnState('idle')
  }

  // Watch fetchState transitions to flash button
  const prevFetchState = React.useRef(fetchState)
  React.useEffect(() => {
    const prev = prevFetchState.current
    prevFetchState.current = fetchState
    if (prev === 'loading' && fetchState === 'done') {
      setBtnState('ok')
      setTimeout(() => setBtnState('idle'), 2000)
    } else if (prev === 'loading' && fetchState === 'error') {
      setBtnState('err')
      setTimeout(() => setBtnState('idle'), 2000)
    }
  }, [fetchState])

  const homeTeam  = todayLock?.home || ''
  const awayTeam  = todayLock?.away || ''
  const homeShort = homeTeam.split(' ').pop()
  const awayShort = awayTeam.split(' ').pop()
  const lockShort = (todayLock?.team || '').split(' ').pop()
  const isLockHome = (todayLock?.home || '').toLowerCase().includes(lockShort.toLowerCase())
  const { homeColor, awayColor } = resolveTeamColors(allGames, homeTeam, awayTeam)
  const homeColor_ = homeColor || '#4c9be8'
  const awayColor_ = awayColor || '#4c9be8'
  const todayDateLabel = fmtDateLabel(dateKey)

  if (!espnGameId) {
    return (
      <div style={{ textAlign: 'center', padding: '3.5rem 0', color: '#bbb' }}>
        <div style={{ fontSize: '1.8rem', marginBottom: '0.6rem' }}>🔒</div>
        <div style={{ fontSize: '0.82rem' }}>Set your lock of the day first.</div>
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button onClick={handleRefresh} disabled={fetchState === 'loading'} style={{
          fontSize: '0.6rem', padding: '0.25rem 0.6rem',
          background: btnState === 'ok' ? '#0a2a1a' : btnState === 'err' ? '#2a0a0a' : 'transparent',
          border: `1px solid ${btnState === 'ok' ? '#00ff8844' : btnState === 'err' ? '#ff444433' : '#252525'}`,
          borderRadius: '5px',
          color: fetchState === 'loading' ? '#555' : btnState === 'ok' ? '#00ff88' : btnState === 'err' ? '#ff4444' : '#bbb',
          cursor: fetchState === 'loading' ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s',
        }}>
          {fetchState === 'loading' ? '↺ …' : btnState === 'ok' ? '✓ Updated' : btnState === 'err' ? '✗ Failed' : '↺ Pitchers'}
        </button>
      </div>
      <GameBanner pick={todayLock} dateLabel="🔒 LOCK OF THE DAY" showResult={false} />

      {fetchState === 'loading' && (
        <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#888', fontSize: '0.8rem' }}>
          Fetching pitching matchup…
        </div>
      )}
      {fetchState === 'error' && (
        <div style={{ textAlign: 'center', padding: '2rem 0', color: '#888', fontSize: '0.78rem' }}>
          Couldn't load from ESPN.
          <button onClick={refresh} style={{ display: 'block', margin: '0.75rem auto 0', fontSize: '0.62rem', padding: '0.3rem 0.7rem', background: 'transparent', border: '1px solid #252525', borderRadius: '5px', color: '#999', cursor: 'pointer' }}>
            ↺ Retry
          </button>
        </div>
      )}
      {fetchState === 'done' && (
        <>
          {pitchers.away?.name
            ? <PitcherCard pitcher={pitchers.away} teamLabel={awayShort} teamColor={awayColor_} isLock={!isLockHome} gamePk={gamePk} dateLabel={todayDateLabel} />
            : <NoProbableCard teamShort={awayShort} />
          }
          <BatterCard batters={batters.away} teamLabel={awayShort} teamColor={awayColor_} gamePk={gamePk} dateLabel={todayDateLabel} />
          {pitchers.home?.name
            ? <PitcherCard pitcher={pitchers.home} teamLabel={homeShort} teamColor={homeColor_} isLock={isLockHome} gamePk={gamePk} dateLabel={todayDateLabel} />
            : <NoProbableCard teamShort={homeShort} />
          }
          <BatterCard batters={batters.home} teamLabel={homeShort} teamColor={homeColor_} gamePk={gamePk} dateLabel={todayDateLabel} />
          <div style={{ fontSize: '0.56rem', color: '#aaa', textAlign: 'center', marginTop: '0.75rem' }}>
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
  const yKey = getYesterdayKey()
  const { pitchers, batters, fetchState, gamePk } = usePitcherData(
    pick?.gameId, loaded && !!pick?.gameId, yKey, pick?.home, pick?.away
  )

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
    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#888', fontSize: '0.8rem' }}>Loading…</div>
  )

  if (!pick) return (
    <div style={{ textAlign: 'center', padding: '3.5rem 0', color: '#bbb' }}>
      <div style={{ fontSize: '1.8rem', marginBottom: '0.6rem' }}>📅</div>
      <div style={{ fontSize: '0.82rem' }}>No lock pick for yesterday.</div>
    </div>
  )

  const homeShort = (pick.home || '').split(' ').pop()
  const awayShort = (pick.away || '').split(' ').pop()
  const lockShort = (pick.team || '').split(' ').pop()
  const isLockHome = (pick.home || '').toLowerCase().includes(lockShort.toLowerCase())
  const homeColor_ = teamColor(pick.home)
  const awayColor_ = teamColor(pick.away)
  const yDateLabel = fmtDateLabel(yKey)

  return (
    <>
      <GameBanner pick={pick} dateLabel={`${fmtDateLabel(getYesterdayKey())} · YESTERDAY`} showResult={true} />

      {fetchState === 'loading' && (
        <div style={{ textAlign: 'center', padding: '2rem 0', color: '#888', fontSize: '0.8rem' }}>Fetching pitchers…</div>
      )}
      {fetchState === 'done' && (
        <>
          {pitchers.away?.name
            ? <PitcherCard pitcher={pitchers.away} teamLabel={awayShort} teamColor={awayColor_} isLock={!isLockHome} compact gamePk={gamePk} dateLabel={yDateLabel} />
            : <NoProbableCard teamShort={awayShort} />
          }
          <BatterCard batters={batters.away} teamLabel={awayShort} teamColor={awayColor_} gamePk={gamePk} dateLabel={yDateLabel} />
          {pitchers.home?.name
            ? <PitcherCard pitcher={pitchers.home} teamLabel={homeShort} teamColor={homeColor_} isLock={isLockHome} compact gamePk={gamePk} dateLabel={yDateLabel} />
            : <NoProbableCard teamShort={homeShort} />
          }
          <BatterCard batters={batters.home} teamLabel={homeShort} teamColor={homeColor_} gamePk={gamePk} dateLabel={yDateLabel} />
        </>
      )}
      {fetchState === 'error' && (
        <div style={{ textAlign: 'center', padding: '1.5rem 0', color: '#888', fontSize: '0.75rem' }}>
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
  const [batterData, setBatterData]   = useState({ home: [], away: [] })
  const [pitcherState, setPitcherState] = useState('idle')
  const [gamePk, setGamePk] = useState(null)
  const fetchedRef = useRef(false)

  const homeShort = (pick.home || '').split(' ').pop()
  const awayShort = (pick.away || '').split(' ').pop()
  const lockShort = (pick.team || '').split(' ').pop()
  const isLockHome = (pick.home || '').toLowerCase().includes(lockShort.toLowerCase())
  const resultColor = pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#333'
  const homeColor_  = teamColor(pick.home)
  const awayColor_  = teamColor(pick.away)
  const histDateLabel = fmtDateLabel(date)

  async function load() {
    if (fetchedRef.current) return
    fetchedRef.current = true
    setPitcherState('loading')

    const espnData = await fetchGamePitchers(pick.gameId)
    if (!espnData) { setPitcherState('error'); return }

    const { probableMap, todayStatsMap, batterMap } = espnData
    const result = {}
    ;['home', 'away'].forEach(side => {
      const p = probableMap[side]
      result[side] = {
        name: p?.name || null, todayStats: todayStatsMap[side] || null,
        seasonStats: null, personId: null, loading: !!p?.name, error: !p?.name,
      }
    })
    setPitcherData(result)
    setBatterData(batterMap || { home: [], away: [] })
    setPitcherState('done')

    // Fetch gamePk for highlights
    if (pick.home && pick.away) {
      fetchGamePk(date, pick.home, pick.away).then(pk => {
        if (pk) setGamePk(pk)
      })
    }

    // Season stats (also gets personId for highlight filtering)
    await Promise.all(['home', 'away'].map(async side => {
      const name = probableMap[side]?.name
      if (!name) return
      const season = await fetchSeasonStats(name)
      setPitcherData(prev => prev ? ({
        ...prev,
        [side]: {
          ...prev[side],
          seasonStats: season,
          personId: season?.personId || null,
          loading: false,
          error: !season,
        },
      }) : prev)
    }))
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    if (next) load()
  }

  return (
    <div style={{ borderBottom: '1px solid #1e1e1e', paddingBottom: '0.1rem', marginBottom: '0.1rem' }}>
      <button onClick={toggle} style={{
        width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '0.75rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.68rem', color: '#aaa' }}>{fmtDateLabel(date)}</span>
          <span style={{ fontSize: '0.8rem', color: '#888' }}>
            <span style={{ color: isLockHome ? '#888' : '#fff' }}>{awayShort}</span>
            <span style={{ color: '#888', margin: '0 0.25rem' }}>@</span>
            <span style={{ color: isLockHome ? '#fff' : '#888' }}>{homeShort}</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          {pick.result && (
            <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: resultColor }}>
              {pick.result === 'W' ? '✅' : '❌'}
            </span>
          )}
          <span style={{ fontSize: '0.62rem', color: '#ccc' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div style={{ paddingBottom: '0.75rem' }}>
          {pitcherState === 'loading' && (
            <div style={{ fontSize: '0.7rem', color: '#888', padding: '0.5rem 0' }}>Fetching pitchers…</div>
          )}
          {pitcherState === 'error' && (
            <div style={{ fontSize: '0.7rem', color: '#888', padding: '0.5rem 0' }}>Pitcher data unavailable.</div>
          )}
          {pitcherState === 'done' && pitcherData && (
            <>
              {pitcherData.away?.name
                ? <PitcherCard pitcher={pitcherData.away} teamLabel={awayShort} teamColor={awayColor_} isLock={!isLockHome} compact gamePk={gamePk} dateLabel={histDateLabel} />
                : <NoProbableCard teamShort={awayShort} />
              }
              <BatterCard batters={batterData.away} teamLabel={awayShort} teamColor={awayColor_} gamePk={gamePk} dateLabel={histDateLabel} />
              {pitcherData.home?.name
                ? <PitcherCard pitcher={pitcherData.home} teamLabel={homeShort} teamColor={homeColor_} isLock={isLockHome} compact gamePk={gamePk} dateLabel={histDateLabel} />
                : <NoProbableCard teamShort={homeShort} />
              }
              <BatterCard batters={batterData.home} teamLabel={homeShort} teamColor={homeColor_} gamePk={gamePk} dateLabel={histDateLabel} />
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
    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#888', fontSize: '0.8rem' }}>Loading history…</div>
  )

  if (!picks.length) return (
    <div style={{ textAlign: 'center', padding: '3.5rem 0', color: '#bbb' }}>
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
  const [open, setOpen]     = useState(true)

  const subTabs = [
    { id: 'today',     label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'history',   label: 'History' },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', color: '#fff', fontWeight: 700 }}>📺 MEDIA</h2>
            <div style={{ fontSize: '0.78rem', color: '#888' }}>Pitcher matchup · lineups · highlights</div>
          </div>
          <button onClick={() => setOpen(o => !o)} style={{
            background: 'transparent', border: '1px solid #333', borderRadius: '6px',
            color: '#ccc', cursor: 'pointer', fontSize: '0.65rem', padding: '0.3rem 0.65rem',
            transition: 'all 0.15s',
          }}>{open ? '▲ Hide' : '▼ Show'}</button>
        </div>
      </div>

      {open && (
        <>
          {/* Sub-tab nav */}
          <div style={{
            display: 'flex', gap: '0.4rem', marginBottom: '1.5rem',
            background: '#1a1a1a', border: '1px solid #333',
            borderRadius: '10px', padding: '0.3rem',
          }}>
            {subTabs.map(({ id }) => (
              <button key={id} onClick={() => setSubTab(id)} style={{
                flex: 1, padding: '0.45rem 0.5rem', borderRadius: '7px', cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: subTab === id ? 'bold' : 'normal',
                background: subTab === id ? '#fff' : 'transparent',
                border: 'none',
                color: subTab === id ? '#000' : '#aaa',
                transition: 'all 0.15s',
              }}>
                {id === 'today' ? '⚡ Today' : id === 'yesterday' ? '📅 Yesterday' : '📋 History'}
              </button>
            ))}
          </div>

          {subTab === 'today'     && <TodayTab todayLock={todayLock} allGames={allGames} />}
          {subTab === 'yesterday' && <YesterdayTab />}
          {subTab === 'history'   && <HistoryTab />}
        </>
      )}
    </div>
  )
}