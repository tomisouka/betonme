import React, { useState } from 'react'

function fmtDate(key) {
  if (!key) return ''
  const [, mm, dd] = key.split('-')
  return `${mm}/${dd}`
}

function calcPL(odds, result) {
  if (!result || result === 'pending') return 0
  const stake = 10
  if (result === 'L') return -stake
  if (odds > 0) return stake * (odds / 100)
  return stake * (100 / Math.abs(odds))
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
  const [open, setOpen] = useState(false)
  const [showPlayers, setShowPlayers] = useState(false)

  const playerMap = {}
  const byMarket = {}
  let totalPL = 0

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
          pl: 0, picks: [],
        }
      }
      const e = playerMap[key]
      e.picks.push({ date, ...pick })
      const pl = calcPL(pick.odds, pick.result)
      e.pl += pl
      totalPL += pl
      if (pick.result === 'W') {
        e.wins++
        if (pick.side === 'over') { e.overWins++; e.overTotal++ } else { e.underWins++; e.underTotal++ }
      } else if (pick.result === 'L') {
        e.losses++
        if (pick.side === 'over') e.overTotal++; else e.underTotal++
      } else {
        e.pending++
      }

      const mLabel = pick.label || pick.marketKey || 'unknown'
      if (!byMarket[mLabel]) byMarket[mLabel] = { w: 0, l: 0, pl: 0 }
      if (pick.result === 'W') { byMarket[mLabel].w++; byMarket[mLabel].pl += pl }
      else if (pick.result === 'L') { byMarket[mLabel].l++; byMarket[mLabel].pl += pl }
    })
  })

  Object.values(playerMap).forEach(p => {
    p.picks.sort((a, b) => a.date.localeCompare(b.date))
    let streak = { type: null, count: 0 }
    for (const pick of p.picks) {
      if (!pick.result) continue
      if (pick.result === streak.type) streak.count++
      else streak = { type: pick.result, count: 1 }
    }
    p.streak = streak
  })

  const players = Object.values(playerMap)
  if (players.length === 0) return null

  const totalW = players.reduce((s, p) => s + p.wins, 0)
  const totalL = players.reduce((s, p) => s + p.losses, 0)
  const totalP = players.reduce((s, p) => s + p.pending, 0)
  const totalGames = totalW + totalL
  const hitRate = totalGames ? Math.round((totalW / totalGames) * 100) : null

  // Streaks
  const allPicks = players.flatMap(p => p.picks).filter(p => p.result).sort((a, b) => a.date.localeCompare(b.date))
  let currentStreak = { type: null, count: 0 }, streakStartDate = null
  let bestW = 0, bestL = 0, runType = null, runCount = 0
  for (const pick of allPicks) {
    if (pick.result === currentStreak.type) currentStreak.count++
    else { currentStreak = { type: pick.result, count: 1 }; streakStartDate = pick.date }
    if (pick.result === runType) runCount++
    else { runType = pick.result; runCount = 1 }
    if (runType === 'W' && runCount > bestW) bestW = runCount
    if (runType === 'L' && runCount > bestL) bestL = runCount
  }

  // Over/under
  const totalOverW = players.reduce((s, p) => s + p.overWins, 0)
  const totalUnderW = players.reduce((s, p) => s + p.underWins, 0)
  const totalOverT = players.reduce((s, p) => s + p.overTotal, 0)
  const totalUnderT = players.reduce((s, p) => s + p.underTotal, 0)
  const overRate = totalOverT ? Math.round((totalOverW / totalOverT) * 100) : null
  const underRate = totalUnderT ? Math.round((totalUnderW / totalUnderT) * 100) : null

  // Best/cursed
  const ranked = players.filter(p => p.wins + p.losses >= 2).sort((a, b) => {
    return (b.wins / (b.wins + b.losses)) - (a.wins / (a.wins + a.losses))
  })
  const bestPlayer = ranked[0] || null
  const cursed = [...ranked].reverse()[0] || null
  const isCursedDiff = cursed && bestPlayer && cursed.player !== bestPlayer.player

  const streakIcon = currentStreak.type === 'W' ? '🔥' : currentStreak.type === 'L' ? '🧊' : null
  const streakColor = currentStreak.type === 'W' ? '#00ff88' : currentStreak.type === 'L' ? '#ff4444' : '#555'
  const streakText = streakIcon ? `${streakIcon} ${currentStreak.count}${currentStreak.type}` : '—'

  const plColor = totalPL > 0 ? '#00ff88' : totalPL < 0 ? '#ff4444' : '#555'
  const plSign = totalPL >= 0 ? '+' : ''
  const plText = `${plSign}$${Math.abs(totalPL).toFixed(0)}`

  const marketEntries = Object.entries(byMarket).sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l))

  const sortedPlayers = [...players].sort((a, b) => {
    const at = a.wins + a.losses, bt = b.wins + b.losses
    return (bt ? b.wins / bt : 0) - (at ? a.wins / at : 0) || bt - at
  })

  const headerSummary = totalGames > 0
    ? `${totalW}W–${totalL}L · ${hitRate}% · ${plText}`
    : totalP > 0 ? `${totalP} pending` : ''

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#111', border: '1px solid #1e1e1e', borderRadius: open ? '12px 12px 0 0' : '12px',
          padding: '0.75rem 1rem', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.68rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.07em' }}>📊 PROP INSIGHTS</span>
          {headerSummary && <span style={{ fontSize: '0.68rem', color: totalGames > 0 ? plColor : '#444', fontWeight: 'bold' }}>{headerSummary}</span>}
        </div>
        <span style={{ color: '#333', fontSize: '0.75rem', fontWeight: 'bold' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ background: '#0d0d0d', border: '1px solid #1e1e1e', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '0.85rem' }}>

          {/* Row 1: Record + P/L + Streak */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <StatCard
              label="Hit Rate"
              value={hitRate !== null ? `${hitRate}%` : '—'}
              sub={totalGames > 0 ? `${totalW}W – ${totalL}L${totalP > 0 ? ` · ${totalP}⏳` : ''}` : 'No resolved props'}
              color={hitRate === null ? '#555' : hitRate >= 55 ? '#00ff88' : hitRate >= 40 ? '#ffcc00' : '#ff4444'}
            />
            <StatCard
              label="Sim P/L"
              value={totalGames > 0 ? plText : '—'}
              sub={totalGames > 0 ? `$10 flat · ${totalGames} bets` : null}
              color={plColor}
            />
            <StatCard
              label="Streak"
              value={streakText}
              sub={streakStartDate ? `since ${fmtDate(streakStartDate)}` : undefined}
              color={streakColor}
            />
            <StatCard
              label="Best Run"
              value={bestW > 0 ? `${bestW}W` : '—'}
              sub={bestL > 0 ? `worst: ${bestL}L` : undefined}
              color={bestW >= 3 ? '#00ff88' : '#aaa'}
            />
          </div>

          {/* Row 2: Over/Under + Blessed/Cursed */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <StatCard
              label="⬆ Over"
              value={overRate !== null ? `${overRate}%` : '· · ·'}
              sub={totalOverT > 0 ? `${totalOverW}/${totalOverT}` : null}
              color={overRate === null ? '#555' : overRate >= 55 ? '#00ff88' : overRate >= 40 ? '#aaa' : '#ff4444'}
            />
            <StatCard
              label="⬇ Under"
              value={underRate !== null ? `${underRate}%` : '· · ·'}
              sub={totalUnderT > 0 ? `${totalUnderW}/${totalUnderT}` : null}
              color={underRate === null ? '#555' : underRate >= 55 ? '#00ff88' : underRate >= 40 ? '#aaa' : '#ff4444'}
            />
            <StatCard
              label="😇 Blessed"
              value={bestPlayer ? bestPlayer.player.split(' ').pop() : '· · ·'}
              sub={bestPlayer ? `${bestPlayer.wins}W–${bestPlayer.losses}L · ${bestPlayer.label}` : null}
              color='#00ff88'
              wide
            />
            <StatCard
              label="😈 Cursed"
              value={isCursedDiff ? cursed.player.split(' ').pop() : '· · ·'}
              sub={isCursedDiff ? `${cursed.wins}W–${cursed.losses}L · ${cursed.label}` : null}
              color='#ff4444'
              wide
            />
          </div>

          {/* By-market breakdown */}
          {marketEntries.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.6rem', color: '#444', letterSpacing: '0.07em', fontWeight: 'bold', marginBottom: '0.4rem' }}>BY MARKET</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {marketEntries.map(([mLabel, stats]) => {
                  const total = stats.w + stats.l
                  const rate = total ? Math.round((stats.w / total) * 100) : null
                  const rateColor = rate === null ? '#555' : rate >= 55 ? '#00ff88' : rate >= 40 ? '#aaa' : '#ff4444'
                  const mpl = stats.pl
                  return (
                    <div key={mLabel} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#141414', border: '1px solid #1e1e1e', borderRadius: '8px',
                      padding: '0.5rem 0.85rem',
                    }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#888' }}>{mLabel}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: rateColor }}>
                          {stats.w}W–{stats.l}L{rate !== null ? ` · ${rate}%` : ''}
                        </span>
                        <span style={{ fontSize: '0.68rem', fontWeight: 'bold', color: mpl >= 0 ? '#00ff88' : '#ff4444', minWidth: '3rem', textAlign: 'right' }}>
                          {mpl >= 0 ? '+' : ''}{mpl.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Player breakdown */}
          <button
            onClick={() => setShowPlayers(e => !e)}
            style={{
              width: '100%', padding: '0.55rem', background: 'transparent',
              border: '1px solid #1e1e1e', borderRadius: '8px',
              color: '#444', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold',
            }}
          >
            {showPlayers ? '▲ Hide player breakdown' : `▼ All ${sortedPlayers.length} players`}
          </button>

          {showPlayers && (
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {sortedPlayers.map(p => {
                const total = p.wins + p.losses
                const rate = total ? Math.round((p.wins / total) * 100) : null
                const color = rate === null ? '#555' : rate >= 60 ? '#00ff88' : rate >= 40 ? '#aaa' : '#ff4444'
                const s = p.streak
                const sStr = s?.count > 0 ? `${s.type === 'W' ? '🔥' : '🧊'}${s.count}${s.type}` : null
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
                      {sStr && <span style={{ fontSize: '0.68rem', color: s.type === 'W' ? '#00ff88' : '#ff4444', fontWeight: 'bold' }}>{sStr}</span>}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color }}>
                          {p.wins}W–{p.losses}L{p.pending > 0 ? ` (${p.pending}⏳)` : ''}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: p.pl >= 0 ? '#00ff8888' : '#ff444488' }}>
                          {p.pl >= 0 ? '+' : ''}{p.pl.toFixed(0)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
