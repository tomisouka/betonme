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

// Fetch all highlight clips for a game, optionally filtered by MLB personId
const _highlightCache = {}
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
      background: '#0c0c0c',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    }}>
      {/* Caption bar — top */}
      <div style={{
        padding: '0.6rem 0.75rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem',
        borderBottom: '1px solid #1a1a1a',
      }}>
        <div style={{ fontSize: '0.72rem', color: '#bbb', lineHeight: 1.4, flex: 1, fontWeight: '500' }}>{title}</div>
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
              fontSize: '0.5rem', color: '#ddd', background: 'rgba(0,0,0,0.55)',
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
              color: '#ccc', fontSize: '0.55rem', padding: '2px 6px', cursor: 'pointer',
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
  const [clips, setClips]   = useState(null)  // null=loading, []+=done
  const [error, setError]   = useState(false)

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
  if (error) return <div style={{ fontSize: '0.58rem', color: '#2a2a2a', marginBottom: '0.5rem' }}>Highlights unavailable</div>
  if (clips === null) return (
    <div style={{ fontSize: '0.58rem', color: '#2a2a2a', marginBottom: '0.5rem', animation: 'pulse 1s infinite' }}>
      Loading highlights…
    </div>
  )
  if (clips.length === 0) return (
    <div style={{ fontSize: '0.58rem', color: '#2a2a2a', marginBottom: '0.5rem' }}>
      No highlights posted yet for this outing
    </div>
  )

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* Section divider label */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem',
      }}>
        <div style={{ flex: 1, height: '1px', background: '#1e1e1e' }} />
        <div style={{
          fontSize: '0.48rem', color: '#555', letterSpacing: '0.12em',
          textTransform: 'uppercase', fontWeight: 'bold', whiteSpace: 'nowrap',
        }}>
          🎬 Highlights · {clips.length} clip{clips.length !== 1 ? 's' : ''}
        </div>
        <div style={{ flex: 1, height: '1px', background: '#1e1e1e' }} />
      </div>
      {clips.map(item => <HighlightClip key={item.id} item={item} dateLabel={dateLabel} />)}
    </div>
  )
}


function StatPill({ label, value, accent = '#333', bright = false }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: bright ? `${accent}0d` : '#0d0d0d',
      border: `1px solid ${accent}${bright ? '55' : '22'}`,
      borderRadius: '8px', padding: '0.5rem 0.65rem', minWidth: '48px',
    }}>
      <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: bright ? '#fff' : '#ddd', lineHeight: 1 }}>{value ?? '—'}</span>
      <span style={{ fontSize: '0.5rem', color: bright ? accent : '#444', letterSpacing: '0.07em', marginTop: '0.22rem', textTransform: 'uppercase', opacity: bright ? 0.8 : 1 }}>{label}</span>
    </div>
  )
}

function StatRow({ label, children, highlight = false }) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ fontSize: '0.48rem', color: highlight ? '#888' : '#2a2a2a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.32rem', fontWeight: highlight ? 'bold' : 'normal' }}>{label}</div>
      <div style={{ display: 'flex', gap: '0.32rem', flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

function PitcherCard({ pitcher, teamLabel, teamColor, isLock, compact = false, gamePk, dateLabel }) {
  const { name, todayStats, seasonStats, loading, error, personId } = pitcher
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
            {dateLabel && <span style={{ color: teamColor, fontWeight: 'bold', marginLeft: '0.5rem', opacity: 0.75 }}>· {dateLabel}</span>}
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
          <StatRow label="counting stats" highlight>
            <StatPill label="IP"  value={s.inningsPitched} accent={teamColor} bright />
            <StatPill label="K"   value={s.strikeOuts}  accent={teamColor} bright />
            <StatPill label="BB"  value={s.baseOnBalls} accent={teamColor} bright />
            <StatPill label="H"   value={s.hits}        accent={teamColor} bright />
            <StatPill label="HR"  value={s.homeRuns}    accent={teamColor} bright />
            <StatPill label="ER"  value={s.earnedRuns}  accent={teamColor} bright />
            {s.hitBatsmen != null && <StatPill label="HBP" value={s.hitBatsmen} accent={teamColor} bright />}
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
            <StatRow label="pitch totals" highlight>
              {s.numberOfPitches  != null && <StatPill label="Pitches" value={s.numberOfPitches}                              accent={teamColor} bright />}
              {s.strikes          != null && <StatPill label="Strikes" value={s.strikes}                                      accent={teamColor} bright />}
              {s.balls            != null && <StatPill label="Balls"   value={s.balls}                                        accent={teamColor} bright />}
              {s.strikePercentage != null && <StatPill label="S%"      value={parseFloat(s.strikePercentage).toFixed(1) + '%'} accent={teamColor} bright />}
            </StatRow>
          )}
        </>
      )}

      {/* Highlights */}
      {gamePk && <PitcherHighlights personId={personId} gamePk={gamePk} accent={teamColor} dateLabel={dateLabel} />}
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

function usePitcherData(espnGameId, active, dateKey, homeTeam, awayTeam) {
  const [pitchers, setPitchers] = useState({})
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

      const { probableMap, todayStatsMap } = espnData
      const initial = {}
      ;['home', 'away'].forEach(side => {
        const p = probableMap[side]
        initial[side] = {
          name: p?.name || null, todayStats: todayStatsMap[side] || null,
          seasonStats: null, loading: !!p?.name, error: !p?.name, personId: null,
        }
      })
      setPitchers(initial)
      setFetchState('done')

      // Fetch gamePk from MLB schedule (for highlights)
      if (dateKey && homeTeam && awayTeam) {
        fetchGamePk(dateKey, homeTeam, awayTeam).then(pk => {
          if (pk) setGamePk(pk)
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
            error: !season,
          },
        }))
      }))
    })()
  }, [espnGameId, active, refreshTick, dateKey, homeTeam, awayTeam])

  function refresh() {
    fetchedRef.current = false
    setPitchers({})
    setFetchState('idle')
    setGamePk(null)
    setRefreshTick(t => t + 1)
  }

  return { pitchers, fetchState, gamePk, refresh }
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
  const { pitchers, fetchState, gamePk, refresh } = usePitcherData(
    espnGameId, true, dateKey, todayLock?.home, todayLock?.away
  )

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
            ? <PitcherCard pitcher={pitchers.away} teamLabel={awayShort} teamColor={awayColor_} isLock={!isLockHome} gamePk={gamePk} dateLabel={todayDateLabel} />
            : <NoProbableCard teamShort={awayShort} />
          }
          {pitchers.home?.name
            ? <PitcherCard pitcher={pitchers.home} teamLabel={homeShort} teamColor={homeColor_} isLock={isLockHome} gamePk={gamePk} dateLabel={todayDateLabel} />
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
  const yKey = getYesterdayKey()
  const { pitchers, fetchState, gamePk } = usePitcherData(
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
  const homeColor_ = teamColor(pick.home)
  const awayColor_ = teamColor(pick.away)
  const yDateLabel = fmtDateLabel(yKey)

  return (
    <>
      <GameBanner pick={pick} dateLabel={`${fmtDateLabel(getYesterdayKey())} · YESTERDAY`} showResult={true} />

      {fetchState === 'loading' && (
        <div style={{ textAlign: 'center', padding: '2rem 0', color: '#333', fontSize: '0.8rem' }}>Fetching pitchers…</div>
      )}
      {fetchState === 'done' && (
        <>
          {pitchers.away?.name
            ? <PitcherCard pitcher={pitchers.away} teamLabel={awayShort} teamColor={awayColor_} isLock={!isLockHome} compact gamePk={gamePk} dateLabel={yDateLabel} />
            : <NoProbableCard teamShort={awayShort} />
          }
          {pitchers.home?.name
            ? <PitcherCard pitcher={pitchers.home} teamLabel={homeShort} teamColor={homeColor_} isLock={isLockHome} compact gamePk={gamePk} dateLabel={yDateLabel} />
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

    const { probableMap, todayStatsMap } = espnData
    const result = {}
    ;['home', 'away'].forEach(side => {
      const p = probableMap[side]
      result[side] = {
        name: p?.name || null, todayStats: todayStatsMap[side] || null,
        seasonStats: null, personId: null, loading: !!p?.name, error: !p?.name,
      }
    })
    setPitcherData(result)
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
                ? <PitcherCard pitcher={pitcherData.away} teamLabel={awayShort} teamColor={awayColor_} isLock={!isLockHome} compact gamePk={gamePk} dateLabel={histDateLabel} />
                : <NoProbableCard teamShort={awayShort} />
              }
              {pitcherData.home?.name
                ? <PitcherCard pitcher={pitcherData.home} teamLabel={homeShort} teamColor={homeColor_} isLock={isLockHome} compact gamePk={gamePk} dateLabel={histDateLabel} />
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
