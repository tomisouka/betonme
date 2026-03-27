import React, { useState, useEffect } from 'react'
import { loadState, loadDogState } from '../hooks/useSaveData.js'

const SERVER = 'http://127.0.0.1:3001'

function getDateKey(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getTodayKey() { return getDateKey(0) }

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtOdds(n) {
  if (n == null) return '—'
  return n > 0 ? `+${n}` : `${n}`
}

// Convert American odds to implied probability %
function toProb(american) {
  if (american == null) return null
  if (american < 0) return Math.round((-american / (-american + 100)) * 100)
  return Math.round((100 / (american + 100)) * 100)
}

// ─── DUAL AXIS CHART ────────────────────────────────────────────────────────
function OddsChart({ snapshots, homeTeam, awayTeam }) {
  const W = 320, H = 160, PAD = { t: 20, r: 50, b: 30, l: 50 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b

  if (!snapshots || snapshots.length < 1) return (
    <div style={{ color: '#333', fontSize: '0.72rem', textAlign: 'center', padding: '1.5rem' }}>
      Run dk_scraper.py to build chart data
    </div>
  )

  // Build data points
  const pts = snapshots.map((s, i) => ({
    i,
    ts: s.ts,
    homeOdds: s.ml?.home,
    awayOdds: s.ml?.away,
    homeProb: toProb(s.ml?.home),
    awayProb: toProb(s.ml?.away),
  })).filter(p => p.homeOdds != null)

  if (pts.length < 1) return null

  // Scale functions
  const allOdds = pts.flatMap(p => [p.homeOdds, p.awayOdds]).filter(Boolean)
  const oddsMin = Math.min(...allOdds) - 20
  const oddsMax = Math.max(...allOdds) + 20
  const xScale = pts.length < 2 ? () => iW / 2 : (i) => (i / (pts.length - 1)) * iW
  const oddsY = (v) => iH - ((v - oddsMin) / (oddsMax - oddsMin)) * iH

  // SVG path builder
  const path = (getter) => pts.map((p, i) => {
    const v = getter(p)
    if (v == null) return ''
    return `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${oddsY(v).toFixed(1)}`
  }).join(' ')

  // Probability axis (right side) labels
  const probTicks = [25, 50, 75]

  const homeColor = '#4c9be8'
  const awayColor = '#8888ff'
  const last = pts[pts.length - 1]

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} style={{ display: 'block', margin: '0 auto' }}>
        <g transform={`translate(${PAD.l},${PAD.t})`}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <line key={f} x1={0} x2={iW} y1={iH * (1-f)} y2={iH * (1-f)}
              stroke="#1a1a1a" strokeWidth="1" />
          ))}

          {/* Zero line */}
          {oddsMin < 0 && oddsMax > 0 && (
            <line x1={0} x2={iW} y1={oddsY(0)} y2={oddsY(0)}
              stroke="#2a2a2a" strokeWidth="1" strokeDasharray="4,4" />
          )}

          {/* Home line */}
          <path d={path(p => p.homeOdds)} stroke={homeColor} strokeWidth="2"
            fill="none" strokeLinejoin="round" />

          {/* Away line */}
          <path d={path(p => p.awayOdds)} stroke={awayColor} strokeWidth="2"
            fill="none" strokeLinejoin="round" />

          {/* End dots */}
          {last.homeOdds != null && (
            <circle cx={xScale(pts.length-1)} cy={oddsY(last.homeOdds)} r="3.5" fill={homeColor} />
          )}
          {last.awayOdds != null && (
            <circle cx={xScale(pts.length-1)} cy={oddsY(last.awayOdds)} r="3.5" fill={awayColor} />
          )}

          {/* Time labels on X axis */}
          {pts.filter((_, i) => i === 0 || i === pts.length - 1).map(p => (
            <text key={p.i} x={xScale(p.i)} y={iH + 16}
              textAnchor={p.i === 0 ? 'start' : 'end'}
              fill="#444" fontSize="9">
              {fmtTime(p.ts)}
            </text>
          ))}

          {/* Left axis — American odds */}
          {[oddsMin + 10, 0, oddsMax - 10].filter(v => v >= oddsMin && v <= oddsMax).map(v => (
            <text key={v} x={-6} y={oddsY(v) + 4}
              textAnchor="end" fill="#444" fontSize="9">
              {fmtOdds(Math.round(v))}
            </text>
          ))}

          {/* Right axis — implied probability */}
          {probTicks.map(pct => {
            // Convert prob back to odds to find y position
            // p = fav_odds / (fav_odds + 100) => roughly map prob to odds scale
            const approxOdds = pct < 50
              ? (100 * pct) / (100 - pct)   // underdog odds (positive)
              : -(100 * pct) / (100 - pct)  // fav odds (negative)
            const y = oddsY(approxOdds)
            if (y < 0 || y > iH) return null
            return (
              <text key={pct} x={iW + 6} y={y + 4}
                textAnchor="start" fill="#444" fontSize="9">
                {pct}%
              </text>
            )
          })}

          {/* Axis labels */}
          <text x={-PAD.l + 4} y={iH / 2} fill="#333" fontSize="8"
            transform={`rotate(-90, ${-PAD.l + 4}, ${iH / 2})`} textAnchor="middle">
            ODDS
          </text>
          <text x={iW + PAD.r - 4} y={iH / 2} fill="#333" fontSize="8"
            transform={`rotate(90, ${iW + PAD.r - 4}, ${iH / 2})`} textAnchor="middle">
            PROB %
          </text>
        </g>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'center', marginTop: '0.35rem' }}>
        <span style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ width: 12, height: 2, background: homeColor, display: 'inline-block', borderRadius: 2 }} />
          <span style={{ color: homeColor }}>{homeTeam.split(' ').pop()}</span>
          <span style={{ color: '#555' }}>{fmtOdds(last.homeOdds)}</span>
        </span>
        <span style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ width: 12, height: 2, background: awayColor, display: 'inline-block', borderRadius: 2 }} />
          <span style={{ color: awayColor }}>{awayTeam.split(' ').pop()}</span>
          <span style={{ color: '#555' }}>{fmtOdds(last.awayOdds)}</span>
        </span>
      </div>
    </div>
  )
}

// ─── MOVEMENT LOG ────────────────────────────────────────────────────────────
function MovementLog({ snapshots }) {
  const [expanded, setExpanded] = useState(false)
  if (!snapshots?.length) return null
  const rows = expanded ? snapshots.slice().reverse() : snapshots.slice(-3).reverse()

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div style={{ fontSize: '0.6rem', color: '#333', fontWeight: 'bold', letterSpacing: '0.07em', marginBottom: '0.35rem' }}>
        MOVEMENT LOG
      </div>
      {rows.map((s, i) => {
        const prev = snapshots[snapshots.length - 1 - i - 1]
        const mlChanged = prev && (s.ml?.home !== prev.ml?.home || s.ml?.away !== prev.ml?.away)
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#444', padding: '0.2rem 0', borderBottom: '1px solid #0d0d0d' }}>
            <span style={{ color: '#333', width: 55, flexShrink: 0 }}>{fmtTime(s.ts)}</span>
            <span style={{ color: mlChanged ? '#00ff88' : '#444' }}>ML {fmtOdds(s.ml?.home)} / {fmtOdds(s.ml?.away)}</span>
            <span>Sp {fmtOdds(s.spread?.homeOdds)}</span>
            <span>O/U {s.total?.point} {fmtOdds(s.total?.overOdds)}</span>
          </div>
        )
      })}
      {snapshots.length > 3 && (
        <button onClick={() => setExpanded(e => !e)} style={{
          background: 'none', border: 'none', color: '#444', cursor: 'pointer',
          fontSize: '0.65rem', marginTop: '0.35rem', padding: 0,
        }}>
          {expanded ? 'Show less' : `+ ${snapshots.length - 3} more`}
        </button>
      )}
    </div>
  )
}

// ─── GAME CARD ────────────────────────────────────────────────────────────────
function GameCard({ gameKey, snapshots, todayLock, todayDog, yesterdayLock, yesterdayDog }) {
  const [open, setOpen] = useState(false)
  if (!snapshots?.length) return null

  const last = snapshots[snapshots.length - 1]
  const first = snapshots[0]
  const nameMatch = (gameTeam, pickTeam) => {
    if (!gameTeam || !pickTeam) return false
    const g = gameTeam.toLowerCase(), p = pickTeam.toLowerCase()
    return g.includes(p.split(' ').pop()) || p.includes(g.split(' ').pop())
  }
  const isLock = [todayLock, yesterdayLock].some(l => l && (nameMatch(last.home, l?.home) || nameMatch(last.away, l?.away)))
  const isDog  = [todayDog,  yesterdayDog ].some(d => d && (nameMatch(last.home, d?.home)  || nameMatch(last.away, d?.away)))
  const highlight = isLock ? '#00ff8833' : isDog ? '#ff994433' : '#1e1e1e'
  const labelColor = isLock ? '#00ff88' : isDog ? '#ff9944' : '#555'
  const labelText  = isLock ? '🔒 LOCK · ' : isDog ? '🐕 DOG · ' : ''

  // Detect movement direction
  const mlDiff = snapshots.length >= 2
    ? (last.ml?.home ?? 0) - (first.ml?.home ?? 0)
    : 0
  const moved = Math.abs(mlDiff) >= 3

  return (
    <div style={{
      background: '#111', border: `1px solid ${highlight}`,
      borderRadius: '10px', marginBottom: '0.75rem', overflow: 'hidden',
    }}>
      {/* Header */}
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', padding: '0.85rem 1rem', background: 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.62rem', color: labelColor, fontWeight: 'bold', marginBottom: '0.2rem' }}>
              {labelText}{last.sport} · {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
              {moved && <span style={{ marginLeft: '0.5rem', color: mlDiff > 0 ? '#00ff88' : '#ff4444' }}>
                {mlDiff > 0 ? '▲' : '▼'} Line moving
              </span>}
            </div>
            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#ccc' }}>
              {last.away_team || last.away} <span style={{ color: '#333', fontWeight: 'normal' }}>@</span> {last.home_team || last.home}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
            <span style={{ fontSize: '0.72rem', color: '#4c9be8', fontWeight: 'bold' }}>{fmtOdds(last.ml?.home)}</span>
            <span style={{ fontSize: '0.72rem', color: '#8888ff', fontWeight: 'bold' }}>{fmtOdds(last.ml?.away)}</span>
            <span style={{ color: '#444', fontSize: '0.65rem' }}>{open ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: '0 1rem 1rem' }}>
          <OddsChart snapshots={snapshots} homeTeam={last.home_team || last.home} awayTeam={last.away_team || last.away} />
          <MovementLog snapshots={snapshots} />
        </div>
      )}
    </div>
  )
}

// ─── MAIN TAB ────────────────────────────────────────────────────────────────
export default function LiveTab({ todayLock, todayDog }) {
  const [oddsHistory, setOddsHistory] = useState({})
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)
  const [lastScrape, setLastScrape] = useState(null)
  const [yesterdayLock, setYesterdayLock] = useState(null)
  const [yesterdayDog, setYesterdayDog] = useState(null)
  const todayKey = getTodayKey()
  const yesterdayKey = getDateKey(-1)

  function loadHistory() {
    fetch(`${SERVER}/odds-history`)
      .then(r => r.json())
      .then(d => { setOddsHistory(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    loadHistory()
    // Load yesterday's lock + dog from savedata
    loadState().then(s => {
      if (s?.picks?.[yesterdayKey]) setYesterdayLock(s.picks[yesterdayKey])
    }).catch(() => {})
    loadDogState().then(s => {
      if (s?.picks?.[yesterdayKey]) setYesterdayDog(s.picks[yesterdayKey])
    }).catch(() => {})
  }, [])

  async function refreshNow() {
    setScraping(true)
    try {
      await fetch(`${SERVER}/scrape-now`, { method: 'POST' })
      setLastScrape(new Date())
      loadHistory()
    } catch {}
    setScraping(false)
  }

  // Combine today + yesterday's history, showing games that match lock/dog
  const todayGames = oddsHistory[todayKey] || {}
  const yesterdayGames = oddsHistory[yesterdayKey] || {}

  // For yesterday: only show games matching yesterday's lock or dog
  const relevantYesterdayEntries = Object.entries(yesterdayGames).filter(([, snaps]) => {
    if (!snaps?.length) return false
    const last = snaps[snaps.length - 1]
    const nm = (g, t) => !g || !t ? false : g.toLowerCase().includes(t?.split(' ').pop().toLowerCase())
    const isYLock = yesterdayLock && (nm(last.home, yesterdayLock.home) || nm(last.away, yesterdayLock.away))
    const isYDog  = yesterdayDog  && (nm(last.home, yesterdayDog.home)  || nm(last.away, yesterdayDog.away))
    return isYLock || isYDog
  })

  const gameEntries = [...Object.entries(todayGames), ...relevantYesterdayEntries]
    .sort(([, a], [, b]) => {
      // Sort: lock game first, then by game time
      const nm = (g, t) => !g || !t ? false : (g.toLowerCase().includes(t?.split(' ').pop().toLowerCase()))
      const aIsLock = [todayLock, yesterdayLock].some(l => l && (nm(a[0]?.home, l.home) || nm(a[0]?.away, l.away)))
      const bIsLock = [todayLock, yesterdayLock].some(l => l && (nm(b[0]?.home, l.home) || nm(b[0]?.away, l.away)))
      const aIsDog  = [todayDog,  yesterdayDog ].some(d => d && (nm(a[0]?.home, d.home)  || nm(a[0]?.away, d.away)))
      const bIsDog  = [todayDog,  yesterdayDog ].some(d => d && (nm(b[0]?.home, d.home)  || nm(b[0]?.away, d.away)))
      if (aIsLock) return -1
      if (bIsLock) return 1
      if (aIsDog) return -1
      if (bIsDog) return 1
      return new Date(a[0]?.commence_time) - new Date(b[0]?.commence_time)
    })

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: '0 0 0.3rem', fontSize: '1rem', color: '#aaa' }}>⚡ LIVE · Odds Movement</h2>
          <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>
            DraftKings · auto-refresh every 30min · resets tomorrow
          </p>
          {lastScrape && <p style={{ margin: '0.2rem 0 0', color: '#333', fontSize: '0.72rem' }}>
            Last refresh: {lastScrape.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>}
        </div>
        <button onClick={refreshNow} disabled={scraping} style={{
          background: scraping ? '#1a1a1a' : '#1a2a1a',
          border: `1px solid ${scraping ? '#333' : '#00ff8833'}`,
          color: scraping ? '#444' : '#00ff88',
          borderRadius: '8px', padding: '0.5rem 1rem',
          cursor: scraping ? 'not-allowed' : 'pointer',
          fontSize: '0.75rem', fontWeight: 'bold', flexShrink: 0,
        }}>
          {scraping ? '⏳ Fetching...' : '↺ Refresh Now'}
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#333', fontSize: '0.8rem' }}>Loading...</div>
      ) : gameEntries.length === 0 ? (
        <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: '10px', padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📊</div>
          <div style={{ color: '#555', fontSize: '0.82rem', marginBottom: '0.4rem' }}>No odds data yet for today</div>
          <div style={{ color: '#333', fontSize: '0.72rem' }}>
            Run <code style={{ background: '#1a1a1a', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>python3 dk_scraper.py</code>
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.65rem', color: '#444', marginBottom: '1rem' }}>
            {gameEntries.length} game{gameEntries.length !== 1 ? 's' : ''} tracked · tap to expand chart
          </div>
          {gameEntries.map(([gameKey, snapshots]) => (
            <GameCard key={gameKey} gameKey={gameKey} snapshots={snapshots}
              todayLock={todayLock} todayDog={todayDog}
              yesterdayLock={yesterdayLock} yesterdayDog={yesterdayDog} />
          ))}
        </>
      )}
    </div>
  )
}
