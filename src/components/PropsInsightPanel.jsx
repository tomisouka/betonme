import React, { useState } from 'react'
import { formatOdds } from '../utils/odds.js'

function fmtDate(key) {
  if (!key) return ''
  const [, mm, dd] = key.split('-')
  return `${mm}/${dd}`
}

function getTodayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function StatCard({ label, value, sub, color = '#aaa', wide = false }) {
  return (
    <div style={{
      background: '#1a1a1a', border: '1px solid #242424', borderRadius: '12px',
      padding: '0.9rem 1rem', flex: wide ? '2 1 160px' : '1 1 100px', minWidth: wide ? '140px' : '80px',
    }}>
      <div style={{ fontSize: '0.6rem', color: '#444', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.45rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.63rem', color: '#555', marginTop: '0.3rem' }}>{sub}</div>}
    </div>
  )
}

export default function PropsInsightPanel({ propPick }) {
  const [expanded, setExpanded] = useState(false)

  // Build per-player history
  const playerMap = {}
  Object.entries(propPick || {}).forEach(([date, dayPicks]) => {
    Object.entries(dayPicks || {}).forEach(([, pick]) => {
      if (!pick?.player) return
      const key = `${pick.player}||${pick.marketKey}`
      if (!playerMap[key]) {
        playerMap[key] = {
          player: pick.player, label: pick.label,
          marketKey: pick.marketKey, team: pick.team || '',
          wins: 0, losses: 0, pending: 0,
          overWins: 0, underWins: 0, overTotal: 0, underTotal: 0,
          picks: [],
        }
      }
      const e = playerMap[key]
      e.picks.push({ date, ...pick })
      if (pick.result === 'W') {
        e.wins++
        if (pick.side === 'over') e.overWins++; else e.underWins++
      } else if (pick.result === 'L') {
        e.losses++
      } else {
        e.pending++
      }
      if (pick.side === 'over') e.overTotal++; else e.underTotal++
    })
  })

  Object.values(playerMap).forEach(p => {
    p.picks.sort((a, b) => a.date.localeCompare(b.date))
    let streak = { type: null, count: 0 }
    let streakStart = null
    for (const pick of p.picks) {
      if (!pick.result) continue
      if (pick.result === streak.type) streak.count++
      else { streak = { type: pick.result, count: 1 }; streakStart = pick.date }
    }
    p.streak = streak
    p.streakStart = streakStart
  })

  const players = Object.values(playerMap)
  if (players.length === 0) return null

  // Aggregate
  const totalW = players.reduce((s, p) => s + p.wins, 0)
  const totalL = players.reduce((s, p) => s + p.losses, 0)
  const totalGames = totalW + totalL
  const hitRate = totalGames ? Math.round((totalW / totalGames) * 100) : null

  // Date windowed stats
  const now = new Date()
  function daysAgo(n) {
    const d = new Date(now); d.setDate(d.getDate() - n)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  const key7 = daysAgo(7), key30 = daysAgo(30)
  let w7=0, l7=0, w30=0, l30=0
  players.forEach(p => p.picks.forEach(pick => {
    if (!pick.result || pick.result === 'pending') return
    if (pick.date >= key7)  { pick.result === 'W' ? w7++ : l7++ }
    if (pick.date >= key30) { pick.result === 'W' ? w30++ : l30++ }
  }))

  // Overall streak (across all picks by date)
  const allPicksSorted = players.flatMap(p => p.picks).filter(p => p.result).sort((a,b) => a.date.localeCompare(b.date))
  let currentStreak = { type: null, count: 0 }
  let streakStartDate = null
  for (const pick of allPicksSorted) {
    if (pick.result === currentStreak.type) currentStreak.count++
    else { currentStreak = { type: pick.result, count: 1 }; streakStartDate = pick.date }
  }

  // Over/under rates
  const totalOverW = players.reduce((s,p) => s + p.overWins, 0)
  const totalUnderW = players.reduce((s,p) => s + p.underWins, 0)
  const totalOverT = players.reduce((s,p) => s + p.overTotal, 0)
  const totalUnderT = players.reduce((s,p) => s + p.underTotal, 0)
  const overRate = totalOverT ? Math.round((totalOverW / totalOverT) * 100) : null
  const underRate = totalUnderT ? Math.round((totalUnderW / totalUnderT) * 100) : null

  // Best/cursed player (>= 2 resolved)
  const ranked = players.filter(p => p.wins + p.losses >= 2).sort((a,b) => {
    const ra = a.wins/(a.wins+a.losses), rb = b.wins/(b.wins+b.losses)
    return rb - ra
  })
  const bestPlayer = ranked[0] || null
  const cursed = [...ranked].reverse()[0] || null
  const isCursedDifferent = cursed && bestPlayer && cursed.player !== bestPlayer.player

  const streakIcon = currentStreak.type === 'W' ? '🔥' : currentStreak.type === 'L' ? '🧊' : null
  const streakColor = currentStreak.type === 'W' ? '#00ff88' : currentStreak.type === 'L' ? '#ff4444' : '#555'
  const streakText = streakIcon ? `${streakIcon} ${currentStreak.count}${currentStreak.type}` : '— — —'

  const sortedPlayers = [...players].sort((a,b) => {
    const at = a.wins+a.losses, bt = b.wins+b.losses
    const ar = at ? a.wins/at : 0, br = bt ? b.wins/bt : 0
    return br - ar || bt - at
  })

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ fontSize: '0.68rem', color: '#444', fontWeight: 'bold', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>
        🔮 PROPS INSIGHTS
      </div>

      {/* Row 1 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <StatCard
          label="Hit Rate"
          value={hitRate !== null ? `${hitRate}%` : '—'}
          sub={totalGames > 0 ? `${totalW}W – ${totalL}L all time` : 'No resolved props'}
          color={hitRate === null ? '#555' : hitRate >= 55 ? '#00ff88' : hitRate >= 40 ? '#ffcc00' : '#ff4444'}
        />
        <StatCard
          label="Streak"
          value={streakText}
          sub={streakStartDate ? `since ${fmtDate(streakStartDate)}` : undefined}
          color={streakColor}
        />
        <StatCard
          label="7 Day"
          value={w7+l7 > 0 ? `${w7}W – ${l7}L` : '· · ·'}
          color={w7 > l7 ? '#00ff88' : w7 < l7 ? '#ff4444' : '#aaa'}
        />
        <StatCard
          label="30 Day"
          value={w30+l30 > 0 ? `${w30}W – ${l30}L` : '· · ·'}
          color={w30 > l30 ? '#00ff88' : w30 < l30 ? '#ff4444' : '#aaa'}
        />
      </div>

      {/* Row 2 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <StatCard
          label="⬆ Over Hit"
          value={overRate !== null ? `${overRate}%` : '· · ·'}
          sub={totalOverT > 0 ? `${totalOverW}/${totalOverT} overs` : null}
          color={overRate === null ? '#555' : overRate >= 55 ? '#00ff88' : overRate >= 40 ? '#aaa' : '#ff4444'}
        />
        <StatCard
          label="⬇ Under Hit"
          value={underRate !== null ? `${underRate}%` : '· · ·'}
          sub={totalUnderT > 0 ? `${totalUnderW}/${totalUnderT} unders` : null}
          color={underRate === null ? '#555' : underRate >= 55 ? '#00ff88' : underRate >= 40 ? '#aaa' : '#ff4444'}
        />
        <StatCard
          label="😇 Blessed"
          value={bestPlayer ? bestPlayer.player.split(' ').pop() : '· · ·'}
          sub={bestPlayer ? `${bestPlayer.wins}W–${bestPlayer.losses}L · ${Math.round(bestPlayer.wins/(bestPlayer.wins+bestPlayer.losses)*100)}% · ${bestPlayer.label}` : null}
          color='#00ff88'
          wide
        />
        <StatCard
          label="😈 Cursed"
          value={isCursedDifferent ? cursed.player.split(' ').pop() : '· · ·'}
          sub={isCursedDifferent ? `${cursed.wins}W–${cursed.losses}L · ${Math.round(cursed.wins/(cursed.wins+cursed.losses)*100)}% · ${cursed.label}` : null}
          color='#ff4444'
          wide
        />
      </div>

      {/* Player breakdown toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', padding: '0.55rem', background: 'transparent',
          border: '1px solid #1e1e1e', borderRadius: '8px',
          color: '#444', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold',
        }}
      >
        {expanded ? '▲ Hide player breakdown' : `▼ All ${sortedPlayers.length} players`}
      </button>

      {expanded && (
        <div style={{ marginTop: '0.5rem', background: '#111', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {sortedPlayers.map(p => {
            const total = p.wins + p.losses
            const rate = total ? Math.round((p.wins / total) * 100) : null
            const color = rate === null ? '#555' : rate >= 60 ? '#00ff88' : rate >= 40 ? '#aaa' : '#ff4444'
            const s = p.streak
            const streakStr = s?.count > 0 ? `${s.type === 'W' ? '🔥' : '🧊'}${s.count}${s.type}` : null
            return (
              <div key={p.player + p.marketKey} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#141414', border: '1px solid #1e1e1e', borderRadius: '8px',
                padding: '0.55rem 0.85rem',
              }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{p.player}</div>
                  <div style={{ fontSize: '0.63rem', color: '#444' }}>{p.label}{p.team ? ` · ${p.team}` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {streakStr && <span style={{ fontSize: '0.68rem', color: s.type === 'W' ? '#00ff88' : '#ff4444', fontWeight: 'bold' }}>{streakStr}</span>}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color }}>
                      {p.wins}W–{p.losses}L{p.pending > 0 ? ` (${p.pending}⏳)` : ''}
                    </div>
                    {rate !== null && <div style={{ fontSize: '0.6rem', color: '#555' }}>{rate}% hit</div>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
