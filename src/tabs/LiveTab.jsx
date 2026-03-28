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
function fmtDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m-1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtOdds(n) {
  if (n == null) return '—'
  return n > 0 ? `+${n}` : `${n}`
}

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

  const pts = snapshots.map((s, i) => ({
    i, ts: s.ts,
    homeOdds: s.ml?.home,
    awayOdds: s.ml?.away,
  })).filter(p => p.homeOdds != null)

  if (pts.length < 1) return null

  // Single snapshot: duplicate the point so we can draw a flat line across the full width
  const displayPts = pts.length === 1
    ? [{ ...pts[0], i: 0 }, { ...pts[0], i: 1 }]
    : pts

  const allOdds = displayPts.flatMap(p => [p.homeOdds, p.awayOdds]).filter(Boolean)
  const rawMin = Math.min(...allOdds)
  const rawMax = Math.max(...allOdds)
  const spread = rawMax - rawMin
  // When odds are identical (flat line), use a fixed ±15 window so the axis is readable
  // Otherwise tight padding: at least ±8 but no more than 12% of the actual spread
  const pad = spread === 0 ? 15 : Math.max(8, spread * 0.12)
  const oddsMin = rawMin - pad
  const oddsMax = rawMax + pad
  const xScale = (i) => (i / (displayPts.length - 1)) * iW
  const oddsY = (v) => iH - ((v - oddsMin) / (oddsMax - oddsMin)) * iH

  const path = (getter) => displayPts.map((p, i) => {
    const v = getter(p)
    if (v == null) return ''
    return `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${oddsY(v).toFixed(1)}`
  }).join(' ')

  const probTicks = [25, 50, 75]
  const homeColor = '#4c9be8'
  const awayColor = '#8888ff'
  const last = pts[pts.length - 1]

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} style={{ display: 'block', margin: '0 auto' }}>
        <g transform={`translate(${PAD.l},${PAD.t})`}>
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <line key={f} x1={0} x2={iW} y1={iH * (1-f)} y2={iH * (1-f)}
              stroke="#1a1a1a" strokeWidth="1" />
          ))}
          {oddsMin < 0 && oddsMax > 0 && (
            <line x1={0} x2={iW} y1={oddsY(0)} y2={oddsY(0)}
              stroke="#2a2a2a" strokeWidth="1" strokeDasharray="4,4" />
          )}
          <path d={path(p => p.homeOdds)} stroke={homeColor} strokeWidth="2"
            fill="none" strokeLinejoin="round" />
          <path d={path(p => p.awayOdds)} stroke={awayColor} strokeWidth="2"
            fill="none" strokeLinejoin="round" />
          {last.homeOdds != null && (
            <circle cx={xScale(displayPts.length-1)} cy={oddsY(last.homeOdds)} r="3.5" fill={homeColor} />
          )}
          {last.awayOdds != null && (
            <circle cx={xScale(displayPts.length-1)} cy={oddsY(last.awayOdds)} r="3.5" fill={awayColor} />
          )}
          {/* For single snapshot show one centered label; for multi show first+last */}
          {pts.length === 1 ? (
            <text x={iW / 2} y={iH + 16} textAnchor="middle" fill="#555" fontSize="9">
              {fmtTime(pts[0].ts)} · 1 snapshot
            </text>
          ) : displayPts.filter((_, i) => i === 0 || i === displayPts.length - 1).map((p, i) => (
            <text key={i} x={xScale(i === 0 ? 0 : displayPts.length - 1)} y={iH + 16}
              textAnchor={i === 0 ? 'start' : 'end'}
              fill="#555" fontSize="9">
              {fmtTime(p.ts)}
            </text>
          ))}
          {[oddsMin + 10, 0, oddsMax - 10].filter(v => v >= oddsMin && v <= oddsMax).map((v, i) => (
            <text key={`laxis_${i}`} x={-6} y={oddsY(v) + 4}
              textAnchor="end" fill="#555" fontSize="9">
              {fmtOdds(Math.round(v))}
            </text>
          ))}
          {probTicks.map(pct => {
            const approxOdds = pct < 50
              ? (100 * pct) / (100 - pct)
              : -(100 * pct) / (100 - pct)
            const y = oddsY(approxOdds)
            if (y < 0 || y > iH) return null
            return (
              <text key={pct} x={iW + 6} y={y + 4}
                textAnchor="start" fill="#555" fontSize="9">
                {pct}%
              </text>
            )
          })}
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
function GameCard({ gameKey, snapshots, todayLock, todayDog, yesterdayLock, yesterdayDog, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
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

  const mlDiff = snapshots.length >= 2
    ? (last.ml?.home ?? 0) - (first.ml?.home ?? 0)
    : 0
  const moved = Math.abs(mlDiff) >= 3

  return (
    <div style={{
      background: '#111', border: `1px solid ${highlight}`,
      borderRadius: '10px', marginBottom: '0.75rem', overflow: 'hidden',
    }}>
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
      {open && (
        <div style={{ padding: '0 1rem 1rem' }}>
          <OddsChart snapshots={snapshots} homeTeam={last.home_team || last.home} awayTeam={last.away_team || last.away} />
          <MovementLog snapshots={snapshots} />
        </div>
      )}
    </div>
  )
}

// ─── COLLAPSIBLE SECTION ─────────────────────────────────────────────────────
function CollapsibleSection({ label, color, count, defaultCollapsed = false, children }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', padding: '0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: collapsed ? 0 : '0.6rem',
        }}
      >
        <span style={{ fontSize: '0.6rem', fontWeight: 'bold', letterSpacing: '0.1em', color }}>
          {label}{count != null ? ` · ${count} game${count !== 1 ? 's' : ''}` : ''}
        </span>
        <span style={{ fontSize: '0.55rem', color: '#444' }}>{collapsed ? '▼ show' : '▲ hide'}</span>
      </button>
      {!collapsed && children}
    </div>
  )
}

// ─── LOCK/DOG HISTORY PAIR ROW ───────────────────────────────────────────────
// Shows one day's lock + dog side by side as a compact paired card
function HistoryPairRow({ dateKey, lockPick, dogPick }) {
  const resultColor = (r) => r === 'W' ? '#00ff88' : r === 'L' ? '#ff4444' : '#555'
  const resultBg    = (r) => r === 'W' ? '#00ff8811' : r === 'L' ? '#ff444411' : '#55555511'
  const resultLabel = (r) => r === 'W' ? 'W' : r === 'L' ? 'L' : '⏳'

  const PickCell = ({ pick, emoji, accentColor }) => (
    <div style={{
      flex: 1, padding: '0.6rem 0.75rem',
      borderLeft: pick ? `2px solid ${accentColor}22` : 'none',
    }}>
      {pick ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.6rem' }}>{emoji}</span>
            <span style={{ fontSize: '0.6rem', color: accentColor, fontWeight: 'bold', letterSpacing: '0.05em' }}>
              {emoji === '🔒' ? 'LOCK' : 'DOG'}
            </span>
            {pick.odds != null && (
              <span style={{ fontSize: '0.6rem', color: '#444' }}>{fmtOdds(pick.odds)}</span>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#ccc', fontWeight: 'bold', lineHeight: 1.2 }}>
            {pick.team}
          </div>
          <div style={{ fontSize: '0.58rem', color: '#444', marginTop: '0.1rem' }}>
            {pick.sport}
            {pick.home && pick.away && ` · ${pick.away?.split(' ').pop()} @ ${pick.home?.split(' ').pop()}`}
          </div>
          <span style={{
            alignSelf: 'flex-start', marginTop: '0.25rem',
            fontSize: '0.7rem', fontWeight: 'bold',
            color: resultColor(pick.result),
            background: resultBg(pick.result),
            borderRadius: '4px', padding: '0.1rem 0.4rem',
          }}>
            {resultLabel(pick.result)}
          </span>
        </div>
      ) : (
        <div style={{ fontSize: '0.65rem', color: '#2a2a2a', fontStyle: 'italic' }}>—</div>
      )}
    </div>
  )

  return (
    <div style={{
      background: '#111', border: '1px solid #1e1e1e', borderRadius: '10px',
      marginBottom: '0.6rem', overflow: 'hidden',
    }}>
      {/* Date strip */}
      <div style={{
        padding: '0.35rem 0.85rem', background: '#0d0d0d',
        fontSize: '0.58rem', color: '#444', fontWeight: 'bold', letterSpacing: '0.08em',
      }}>
        {fmtDate(dateKey)}
      </div>
      {/* Side-by-side lock + dog */}
      <div style={{ display: 'flex' }}>
        <PickCell pick={lockPick} emoji="🔒" accentColor="#00ff88" />
        <div style={{ width: '1px', background: '#1a1a1a', flexShrink: 0 }} />
        <PickCell pick={dogPick}  emoji="🐕" accentColor="#ff9944" />
      </div>
    </div>
  )
}

// ─── MAIN TAB ────────────────────────────────────────────────────────────────
export default function LiveTab({ todayLock, todayDog }) {
  const [oddsHistory, setOddsHistory] = useState({})
  const [loading, setLoading]         = useState(true)
  const [scraping, setScraping]       = useState(false)
  const [lastScrape, setLastScrape]   = useState(null)
  const [yesterdayLock, setYesterdayLock] = useState(null)
  const [yesterdayDog,  setYesterdayDog]  = useState(null)
  // Last 7 lock/dog picks for the history panel
  const [lockHistory, setLockHistory] = useState({})
  const [dogHistory,  setDogHistory]  = useState({})

  const todayKey     = getTodayKey()
  const yesterdayKey = getDateKey(-1)

  function loadHistory() {
    fetch(`${SERVER}/odds-history`)
      .then(r => r.json())
      .then(d => { setOddsHistory(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    loadHistory()

    loadState().then(s => {
      // Yesterday's lock for GameCard highlighting
      const preds = s?.predictions || {}
      const yPred = preds[yesterdayKey]
      const yLockLeg = yPred?.legs?.find(l => l.isLock)
      if (yLockLeg) setYesterdayLock(yLockLeg)

      // Last 7 lock picks
      const sortedDates = Object.keys(preds).sort().reverse().slice(0, 7)
      const lh = {}
      for (const dk of sortedDates) {
        const lockLeg = preds[dk]?.legs?.find(l => l.isLock)
        if (lockLeg) lh[dk] = lockLeg
      }
      setLockHistory(lh)
    }).catch(() => {})

    loadDogState().then(s => {
      // Yesterday's dog for GameCard highlighting
      const picks = s?.picks || {}
      if (picks[yesterdayKey]) setYesterdayDog(picks[yesterdayKey])

      // Last 7 dog picks
      const sortedDates = Object.keys(picks).sort().reverse().slice(0, 7)
      const dh = {}
      for (const dk of sortedDates) dh[dk] = picks[dk]
      setDogHistory(dh)
    }).catch(() => {})

    // 30-minute interval — sweet spot for catching meaningful line movement
    // without over-polling. Sharp money typically moves lines in 15–60min windows.
    const interval = setInterval(loadHistory, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  async function refreshNow() {
    setScraping(true)
    try {
      const res = await fetch(`${SERVER}/scrape-now`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      setLastScrape(new Date())
      const count = data.snapshotCount ?? 0
      console.info(`[LiveTab] Refresh: force-saved ${count} snapshots`)
      loadHistory()
    } catch {}
    setScraping(false)
  }

  const nameMatch = (g, t) => {
    if (!g || !t) return false
    return g.toLowerCase().includes(t.split(' ').pop().toLowerCase()) ||
           t.toLowerCase().includes(g.split(' ').pop().toLowerCase())
  }

  // Enrich + sort game entries for a given day's data object
  const enrichEntries = (gamesObj) =>
    Object.entries(gamesObj)
      .filter(([, snaps]) => snaps?.length > 0)
      .map(([gameKey, snapshots], idx) => {
        const last = snapshots[snapshots.length - 1] || {}
        const isLock = [todayLock, yesterdayLock].some(l => l && (nameMatch(last.home, l?.home) || nameMatch(last.away, l?.away)))
        const isDog  = [todayDog,  yesterdayDog  ].some(d => d && (nameMatch(last.home, d?.home)  || nameMatch(last.away, d?.away)))
        return { gameKey, snapshots, idx, isLock, isDog }
      })
      .sort((a, b) => {
        // Lock first, dog second, rest chronological
        if (a.isLock && !b.isLock) return -1
        if (b.isLock && !a.isLock) return 1
        if (a.isDog  && !b.isDog)  return -1
        if (b.isDog  && !a.isDog)  return 1
        const aTs = a.snapshots[a.snapshots.length-1]?.ts || 0
        const bTs = b.snapshots[b.snapshots.length-1]?.ts || 0
        return new Date(aTs) - new Date(bTs)
      })

  const todayEntries     = enrichEntries(oddsHistory[todayKey]     || {})
  const yesterdayEntries = enrichEntries(oddsHistory[yesterdayKey] || {})

  // Merge all history dates (lock + dog), last 7 unique dates desc
  const allHistoryDates = [...new Set([...Object.keys(lockHistory), ...Object.keys(dogHistory)])]
    .sort().reverse().slice(0, 7)

  // Summary stats
  const lockWins = Object.values(lockHistory).filter(l => l?.result === 'W').length
  const lockLoss = Object.values(lockHistory).filter(l => l?.result === 'L').length
  const dogWins  = Object.values(dogHistory).filter(d => d?.result === 'W').length
  const dogLoss  = Object.values(dogHistory).filter(d => d?.result === 'L').length

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: '0 0 0.3rem', fontSize: '1rem', color: '#aaa' }}>⚡ LIVE · Odds Movement</h2>
          <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>
            DraftKings · auto-refresh every 30min
          </p>
          {lastScrape && (
            <p style={{ margin: '0.2rem 0 0', color: '#333', fontSize: '0.72rem' }}>
              Last refresh: {lastScrape.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
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
      ) : (
        <>
          {/* ── TODAY ── */}
          <CollapsibleSection label="📅 TODAY" color="#00ff88" count={todayEntries.length} defaultCollapsed={false}>
            {todayEntries.length === 0 ? (
              <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: '10px', padding: '1.5rem', textAlign: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📊</div>
                <div style={{ color: '#555', fontSize: '0.82rem', marginBottom: '0.4rem' }}>No odds data yet for today</div>
                <div style={{ color: '#333', fontSize: '0.72rem' }}>
                  Run <code style={{ background: '#1a1a1a', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>python3 dk_scraper.py</code>
                </div>
              </div>
            ) : todayEntries.map(({ gameKey, snapshots, idx, isLock, isDog }) => (
              <GameCard
                key={`today_${idx}_${gameKey}`}
                gameKey={gameKey}
                snapshots={snapshots}
                todayLock={todayLock}
                todayDog={todayDog}
                yesterdayLock={yesterdayLock}
                yesterdayDog={yesterdayDog}
                defaultOpen={isLock || isDog}
              />
            ))}
          </CollapsibleSection>

          <div style={{ borderTop: '1px solid #1a1a1a', margin: '0.25rem 0 1.25rem' }} />

          {/* ── YESTERDAY — shows ALL tracked games, collapsed by default ── */}
          <CollapsibleSection label="📋 YESTERDAY" color="#555" count={yesterdayEntries.length} defaultCollapsed={true}>
            {yesterdayEntries.length === 0 ? (
              <div style={{ color: '#333', fontSize: '0.75rem', padding: '0.5rem 0 0.75rem' }}>
                No odds data tracked for yesterday.
              </div>
            ) : yesterdayEntries.map(({ gameKey, snapshots, idx, isLock, isDog }) => (
              <GameCard
                key={`yest_${idx}_${gameKey}`}
                gameKey={gameKey}
                snapshots={snapshots}
                todayLock={todayLock}
                todayDog={todayDog}
                yesterdayLock={yesterdayLock}
                yesterdayDog={yesterdayDog}
                defaultOpen={isLock || isDog}
              />
            ))}
          </CollapsibleSection>

          <div style={{ borderTop: '1px solid #1a1a1a', margin: '0.25rem 0 1.25rem' }} />

          {/* ── LOCK & DOG HISTORY ── */}
          <CollapsibleSection label="📈 LOCK & DOG HISTORY" color="#888" defaultCollapsed={false}>
            {/* Summary bar */}
            <div style={{
              display: 'flex', gap: '0.75rem', marginBottom: '0.85rem',
              padding: '0.55rem 0.85rem', background: '#0d0d0d',
              borderRadius: '8px', flexWrap: 'wrap', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.65rem', color: '#00ff88' }}>🔒 LOCK</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#ccc' }}>
                  {lockWins}–{lockLoss}
                </span>
                {lockWins + lockLoss > 0 && (
                  <span style={{ fontSize: '0.65rem', color: '#555' }}>
                    ({Math.round(lockWins / (lockWins + lockLoss) * 100)}%)
                  </span>
                )}
              </div>
              <span style={{ color: '#222', fontSize: '0.8rem' }}>|</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.65rem', color: '#ff9944' }}>🐕 DOG</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#ccc' }}>
                  {dogWins}–{dogLoss}
                </span>
                {dogWins + dogLoss > 0 && (
                  <span style={{ fontSize: '0.65rem', color: '#555' }}>
                    ({Math.round(dogWins / (dogWins + dogLoss) * 100)}%)
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.58rem', color: '#333', marginLeft: 'auto' }}>last 7 days</span>
            </div>

            {allHistoryDates.length === 0 ? (
              <div style={{ color: '#333', fontSize: '0.75rem', padding: '0.5rem 0' }}>
                No pick history yet.
              </div>
            ) : allHistoryDates.map(dk => (
              <HistoryPairRow
                key={dk}
                dateKey={dk}
                lockPick={lockHistory[dk] || null}
                dogPick={dogHistory[dk]   || null}
              />
            ))}
          </CollapsibleSection>
        </>
      )}
    </div>
  )
}
