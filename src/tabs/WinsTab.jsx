import React, { useState, useEffect } from 'react'
import { loadLayHistory, loadPredictions, loadState, loadDogState, loadOuPick } from '../hooks/useSaveData.js'
import { formatOdds } from '../utils/odds.js'

function fmtDate(key) {
  if (!key) return ''
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const d = new Date(key + 'T12:00:00')
  const [, mm, dd] = key.split('-')
  return `${days[d.getDay()]} ${mm}/${dd}`
}

function getTodayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function oddsToDecimal(american) {
  if (!american) return 1
  if (american > 0) return (american / 100) + 1
  return (100 / Math.abs(american)) + 1
}

function scoreWin(win) {
  let score = 0
  if (win.type === 'lock') {
    const dec = oddsToDecimal(win.odds)
    score += dec * 10
    if (win.profit) score += win.profit * 0.5
  }
  if (win.type === 'dog') {
    const dec = oddsToDecimal(win.odds)
    score += dec * 15
  }
  if (win.type === 'parlay') {
    score += win.legs * 12
    score += (win.hitCount / win.totalCount) * 10
  }
  return score
}

const GOLD   = '#f5c518'
const SILVER = '#b0b8c4'
const BRONZE = '#cd7f32'
const GREEN  = '#00ff88'
const ORANGE = '#ff9944'
const PURPLE = '#8888ff'

function medalColor(rank) {
  if (rank === 0) return GOLD
  if (rank === 1) return SILVER
  if (rank === 2) return BRONZE
  return '#333'
}

function medalEmoji(rank) {
  if (rank === 0) return '🥇'
  if (rank === 1) return '🥈'
  if (rank === 2) return '🥉'
  return '🏅'
}

function typeLabel(type) {
  if (type === 'lock')   return { emoji: '🔒', label: 'LOCK',   color: GREEN }
  if (type === 'dog')    return { emoji: '🐕', label: 'DOG',    color: ORANGE }
  if (type === 'parlay') return { emoji: '🎯', label: 'PARLAY', color: PURPLE }
  return { emoji: '🎲', label: type.toUpperCase(), color: '#aaa' }
}

function ChevronIcon({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{
      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      transition: 'transform 0.2s ease',
      flexShrink: 0,
    }}>
      <path d="M3 5l4 4 4-4" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WinCard({ win, rank }) {
  const [expanded, setExpanded] = useState(false)
  const medal = medalColor(rank)
  const { emoji, label, color } = typeLabel(win.type)
  const isTop3 = rank < 3
  const hasLegs = win.legs && win.legDetails && win.legDetails.length > 0

  return (
    <div style={{
      background: isTop3 ? `${medal}08` : '#111',
      border: `1px solid ${isTop3 ? medal + '33' : '#1e1e1e'}`,
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      {/* Main card — always visible */}
      <div
        style={{ padding: '1rem 1.1rem', position: 'relative', cursor: hasLegs ? 'pointer' : 'default' }}
        onClick={() => hasLegs && setExpanded(e => !e)}
      >
        {/* Rank badge */}
        <div style={{
          position: 'absolute', top: '0.75rem', right: '0.9rem',
          fontSize: isTop3 ? '1.5rem' : '1rem',
          opacity: isTop3 ? 1 : 0.4,
        }}>
          {medalEmoji(rank)}
        </div>

        {/* Type badge + date + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', paddingRight: '2.5rem' }}>
          <span style={{
            fontSize: '0.65rem', fontWeight: 'bold', letterSpacing: '0.06em',
            color, background: `${color}18`, border: `1px solid ${color}33`,
            padding: '0.15rem 0.5rem', borderRadius: '4px',
          }}>
            {emoji} {label}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#444' }}>{fmtDate(win.date)}</span>
          {hasLegs && (
            <span style={{
              marginLeft: 'auto', marginRight: '2rem',
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              fontSize: '0.7rem', color: '#444',
            }}>
              {win.legDetails.length} legs <ChevronIcon open={expanded} />
            </span>
          )}
        </div>

        {/* Title */}
        <div style={{ fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '0.25rem', paddingRight: '2.5rem' }}>
          {win.title}
        </div>

        {win.subtitle && (
          <div style={{ fontSize: '0.75rem', color: '#555', marginBottom: '0.5rem' }}>{win.subtitle}</div>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {win.odds != null && (
            <div>
              <div style={{ fontSize: '0.62rem', color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Odds</div>
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: win.odds > 0 ? ORANGE : GREEN }}>
                {formatOdds(win.odds)}
              </div>
            </div>
          )}
          {win.stake != null && (
            <div>
              <div style={{ fontSize: '0.62rem', color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stake</div>
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#aaa' }}>🪙{win.stake}</div>
            </div>
          )}
          {win.profit != null && (
            <div>
              <div style={{ fontSize: '0.62rem', color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Profit</div>
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: GREEN }}>+🪙{win.profit.toFixed(1)}</div>
            </div>
          )}
          {win.legs != null && (
            <div>
              <div style={{ fontSize: '0.62rem', color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Legs</div>
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: PURPLE }}>
                {win.hitCount}/{win.totalCount} ✅
              </div>
            </div>
          )}
          {win.payout != null && (
            <div>
              <div style={{ fontSize: '0.62rem', color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Multiplier</div>
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: GOLD }}>{win.payout.toFixed(2)}x</div>
            </div>
          )}
        </div>

        {/* Glow bar top 3 */}
        {isTop3 && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px',
            background: `linear-gradient(90deg, transparent, ${medal}, transparent)`,
          }} />
        )}
      </div>

      {/* Expanded legs */}
      {hasLegs && expanded && (
        <div style={{
          borderTop: '1px solid #1e1e1e',
          background: '#0d0d0d',
          padding: '0.75rem 1rem',
        }}>
          <div style={{ fontSize: '0.68rem', color: '#444', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            All Legs Hit
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {win.legDetails.map((leg, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#141414', borderRadius: '8px', padding: '0.45rem 0.75rem',
                border: '1px solid #1a1a1a',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <span style={{ color: GREEN, fontSize: '0.75rem', flexShrink: 0 }}>✅</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {leg.team || leg.label || `Leg ${i + 1}`}
                    </div>
                    {leg.market && (
                      <div style={{ fontSize: '0.68rem', color: '#555' }}>{leg.market}</div>
                    )}
                  </div>
                </div>
                {leg.odds != null ? (
                  <div style={{
                    fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0, marginLeft: '0.75rem',
                    color: leg.odds > 0 ? ORANGE : GREEN,
                  }}>
                    {formatOdds(leg.odds)}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: '#333', flexShrink: 0, marginLeft: '0.75rem', fontStyle: 'italic' }}>
                    N/A
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function WinsTab() {
  const [wins, setWins] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const today = getTodayKey()
      const [appState, dogState, layHist, predHist] = await Promise.all([
        loadState(), loadDogState(), loadLayHistory(), loadPredictions(),
      ])

      const collected = []

      // ── Lock wins ──────────────────────────────────────────────────────────
      for (const [date, pick] of Object.entries(appState.picks || {})) {
        if (date >= today) continue
        if (pick.result !== 'W') continue
        collected.push({
          type: 'lock',
          date,
          title: pick.team,
          subtitle: pick.away && pick.home ? `${pick.away} vs ${pick.home}` : null,
          odds: pick.odds ?? null,
          stake: pick.stake ?? null,
          profit: pick.profit ?? null,
          payout: pick.odds ? oddsToDecimal(pick.odds) : null,
          legs: null,
          legDetails: null,
        })
      }

      // ── Dog wins ───────────────────────────────────────────────────────────
      for (const [date, pick] of Object.entries(dogState.picks || {})) {
        if (date >= today) continue
        if (pick.result !== 'W') continue
        collected.push({
          type: 'dog',
          date,
          title: pick.team,
          subtitle: pick.away && pick.home ? `${pick.away} vs ${pick.home}` : null,
          odds: pick.odds ?? null,
          stake: null,
          profit: null,
          payout: pick.odds ? oddsToDecimal(pick.odds) : null,
          legs: null,
          legDetails: null,
        })
      }

      // ── Helper: look up odds for a leg from lock/dog picks ────────────────
      function getLegOdds(leg, date) {
        if (leg.isLock) return appState.picks?.[date]?.odds ?? null
        if (leg.isDog)  return dogState.picks?.[date]?.odds ?? null
        return leg.odds ?? null
      }

      function calcParlayOdds(legs, date) {
        const legOdds = legs.map(l => getLegOdds(l, date)).filter(o => o != null)
        if (legOdds.length === 0) return null
        // combine: decimal product → back to american
        const dec = legOdds.reduce((acc, o) => acc * oddsToDecimal(o), 1)
        return dec >= 2
          ? Math.round((dec - 1) * 100)
          : Math.round(-100 / (dec - 1))
      }

      // ── Lay parlay wins — ALL legs must be W ──────────────────────────────
      for (const [date, lay] of Object.entries(layHist)) {
        if (date >= today) continue
        const legs = lay.legs || []
        // Every single leg must have result === 'W' — no partial credit
        if (legs.length === 0 || !legs.every(l => l.result === 'W')) continue
        const parlayOdds = calcParlayOdds(legs, date)
        const multiplier = parlayOdds != null ? oddsToDecimal(parlayOdds) : null
        collected.push({
          type: 'parlay',
          date,
          title: legs.map(l => l.team).filter(Boolean).join(' + ') || 'Parlay',
          subtitle: `${legs.length}-leg lay — all hit`,
          odds: parlayOdds, stake: null, profit: null, payout: multiplier,
          legs: legs.length,
          hitCount: legs.length,
          totalCount: legs.length,
          legDetails: legs.map(l => ({
            team: l.team,
            market: l.market || null,
            odds: getLegOdds(l, date),
          })),
        })
      }

      // ── Prediction parlay wins — ALL legs must be W ────────────────────────
      for (const [date, pred] of Object.entries(predHist)) {
        if (date >= today) continue
        const legs = pred.legs || []
        // Every single leg must have result === 'W' — no partial credit
        if (legs.length === 0 || !legs.every(l => l.result === 'W')) continue
        const parlayOdds = calcParlayOdds(legs, date)
        const multiplier = parlayOdds != null ? oddsToDecimal(parlayOdds) : null
        collected.push({
          type: 'parlay',
          date,
          title: legs.map(l => l.team).filter(Boolean).join(' + ') || 'Prediction',
          subtitle: `${legs.length}-leg prediction — all hit`,
          odds: parlayOdds, stake: null, profit: null, payout: multiplier,
          legs: legs.length,
          hitCount: legs.length,
          totalCount: legs.length,
          legDetails: legs.map(l => ({
            team: l.team,
            market: l.market || null,
            odds: getLegOdds(l, date),
          })),
        })
      }

      collected.sort((a, b) => scoreWin(b) - scoreWin(a))
      setWins(collected)
      setLoading(false)
    }
    load()
  }, [])

  const filters = ['ALL', 'LOCK', 'DOG', 'PARLAY']
  const filtered = filter === 'ALL' ? wins : wins.filter(w => w.type === filter.toLowerCase())

  const totalWins = wins.length
  const biggestOdds = wins.filter(w => w.odds).sort((a, b) => b.odds - a.odds)[0]
  const biggestProfit = wins.filter(w => w.profit).sort((a, b) => b.profit - a.profit)[0]
  const biggestParlay = wins.filter(w => w.type === 'parlay').sort((a, b) => b.legs - a.legs)[0]

  if (loading) return <p style={{ color: '#555', fontSize: '0.85rem', padding: '1rem' }}>Loading wins...</p>

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.2rem', fontSize: '1rem', color: '#aaa' }}>🏆 HALL OF FAME</h2>
        <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>
          Your biggest hits — parlays only count when every leg lands.
        </p>
      </div>

      {/* Summary pills */}
      {totalWins > 0 && (
        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.45rem 0.85rem', fontSize: '0.78rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <span style={{ color: '#555' }}>Total Ws</span>
            <span style={{ color: GREEN, fontWeight: 'bold' }}>{totalWins}</span>
          </div>
          {biggestOdds && (
            <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.45rem 0.85rem', fontSize: '0.78rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ color: '#555' }}>Best Odds</span>
              <span style={{ color: ORANGE, fontWeight: 'bold' }}>{formatOdds(biggestOdds.odds)}</span>
            </div>
          )}
          {biggestProfit && (
            <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.45rem 0.85rem', fontSize: '0.78rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ color: '#555' }}>Best Profit</span>
              <span style={{ color: GREEN, fontWeight: 'bold' }}>+🪙{biggestProfit.profit.toFixed(1)}</span>
            </div>
          )}
          {biggestParlay && (
            <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.45rem 0.85rem', fontSize: '0.78rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ color: '#555' }}>Best Parlay</span>
              <span style={{ color: PURPLE, fontWeight: 'bold' }}>{biggestParlay.legs}-leg sweep</span>
            </div>
          )}
        </div>
      )}

      {/* Filter pills */}
      {totalWins > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {filters.map(f => {
            const isActive = filter === f
            const colors = { ALL: GREEN, LOCK: GREEN, DOG: ORANGE, PARLAY: PURPLE }
            const c = colors[f] || '#aaa'
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '0.3rem 0.85rem', borderRadius: '999px', cursor: 'pointer',
                border: `1px solid ${isActive ? c : '#2a2a2a'}`,
                background: isActive ? `${c}18` : 'transparent',
                color: isActive ? c : '#555',
                fontWeight: isActive ? 'bold' : 'normal',
                fontSize: '0.78rem', letterSpacing: '0.04em',
                transition: 'all 0.15s',
              }}>
                {f}
              </button>
            )
          })}
        </div>
      )}

      {/* Win cards */}
      {filtered.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {filtered.map((win, i) => (
            <WinCard key={`${win.date}-${win.type}-${i}`} win={win} rank={i} />
          ))}
        </div>
      ) : (
        <div style={{
          background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px',
          padding: '3rem 1.5rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏆</div>
          <div style={{ color: '#555', fontSize: '0.9rem', marginBottom: '0.3rem' }}>No wins recorded yet</div>
          <div style={{ color: '#333', fontSize: '0.78rem' }}>
            {filter !== 'ALL'
              ? `No ${filter.toLowerCase()} wins yet — try ALL`
              : 'Lock in some picks and start winning'}
          </div>
        </div>
      )}
    </div>
  )
}
