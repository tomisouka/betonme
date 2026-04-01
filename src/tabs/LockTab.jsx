import React, { useState, useEffect } from 'react'
import { getTodayKey, isSaturday, formatOdds, calcProfit, calcPayout, getGameDateLabel, fetchMlbProbablePitchers, getProbablePitcher } from '../utils/odds.js'
import { loadState, saveState, fetchEspnDate } from '../hooks/useSaveData.js'
import SportFilter, { filterBySport } from '../components/SportFilter.jsx'
import { getTeamLogoUrl, LOGO_STYLE } from '../utils/teamLogos.js'


function getGameStatus(game) {
  const status = game.espnStatus
  if (!status) return null
  const state = status.type?.state
  const completed = status.type?.completed
  if (completed || state === 'post') {
    const s = game.espnScores
    const scoreLabel = s ? `${game.away_team.split(' ').pop()} ${s.away} – ${game.home_team.split(' ').pop()} ${s.home}` : ''
    return { state: 'post', label: scoreLabel ? `Final · ${scoreLabel}` : 'Final' }
  }
  if (state === 'in') {
    const clock = status.displayClock
    const period = status.period
    const sport = game.sportLabel
    let p = period ? (sport === 'MLB' ? `Inn ${period}` : `Q${period}`) : ''
    const s = game.espnScores
    const scoreLabel = s ? `${game.away_team.split(' ').pop()} ${s.away} – ${game.home_team.split(' ').pop()} ${s.home}` : null
    const timePart = [p, clock].filter(Boolean).join(' ')
    return { state: 'in', label: [timePart, scoreLabel].filter(Boolean).join(' · ') || 'In Progress' }
  }
  return { state: 'pre', label: null }
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, hidden }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px',
        padding: '1rem 1.5rem', textAlign: 'center', flex: 1, minWidth: '120px',
        cursor: hidden ? 'pointer' : 'default',
        transition: 'border-color 0.2s',
        borderColor: hovered ? '#444' : '#2a2a2a',
      }}
    >
      <div style={{ fontSize: '0.75rem', color: '#555', marginBottom: '0.4rem' }}>{label}</div>
      {hidden && !hovered ? (
        <div style={{ fontSize: '1.2rem', color: '#2a2a2a', letterSpacing: '0.2em' }}>••••</div>
      ) : (
        <>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: color || '#fff' }}>{value}</div>
          {sub && <div style={{ fontSize: '0.7rem', color: '#555', marginTop: '0.25rem' }}>{sub}</div>}
        </>
      )}
    </div>
  )
}

function calcRecord(picks, days) {
  const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : null
  let w = 0, l = 0
  Object.entries(picks).forEach(([date, pick]) => {
    if (cutoff && new Date(date).getTime() < cutoff) return
    if (pick.result === 'W') w++
    else if (pick.result === 'L') l++
  })
  return `${w}W - ${l}L`
}

function calcTeamStats(picks) {
  const teams = {}
  Object.values(picks).forEach(pick => {
    if (!pick.result || pick.result === null) return
    const t = pick.team
    if (!teams[t]) teams[t] = { w: 0, l: 0 }
    if (pick.result === 'W') teams[t].w++
    else teams[t].l++
  })
  // Require at least 2 picks to avoid 1-game flukes
  const entries = Object.entries(teams).filter(([, r]) => r.w + r.l >= 2)
  if (!entries.length) return { biased: null, cursed: null }
  const biased = entries.reduce((best, [team, r]) => {
    const rate = r.w / (r.w + r.l)
    return rate > best.rate ? { team, rate, w: r.w, l: r.l } : best
  }, { team: null, rate: -1, w: 0, l: 0 })
  const cursed = entries.reduce((worst, [team, r]) => {
    const rate = r.w / (r.w + r.l)
    return rate < worst.rate ? { team, rate, w: r.w, l: r.l } : worst
  }, { team: null, rate: 2, w: 0, l: 0 })
  return {
    biased: biased.team ? { name: biased.team, record: `${biased.w}W-${biased.l}L`, pct: Math.round(biased.rate * 100) } : null,
    cursed: cursed.team ? { name: cursed.team, record: `${cursed.w}W-${cursed.l}L`, pct: Math.round(cursed.rate * 100) } : null,
  }
}

// ─── INSIGHTS ENGINE ─────────────────────────────────────────────────────────
function calcInsights(picks) {
  const entries = Object.entries(picks).filter(([, p]) => p.result !== null)
  if (entries.length < 3) return null

  // Best day of week
  const byDay = {}
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  entries.forEach(([date, p]) => {
    const day = DAY_NAMES[new Date(date + 'T12:00:00').getDay()]
    if (!byDay[day]) byDay[day] = { w: 0, l: 0 }
    if (p.result === 'W') byDay[day].w++
    else byDay[day].l++
  })
  const dayEntries = Object.entries(byDay).filter(([, r]) => r.w + r.l >= 2)
  const bestDay = dayEntries.length
    ? dayEntries.reduce((best, [day, r]) => r.w / (r.w + r.l) > best.rate ? { day, rate: r.w / (r.w + r.l), w: r.w, l: r.l } : best, { day: null, rate: -1 })
    : null

  // ML vs Spread record
  const mlPicks = entries.filter(([, p]) => p.market === 'h2h')
  const spPicks = entries.filter(([, p]) => p.market === 'spreads')
  const mlW = mlPicks.filter(([, p]) => p.result === 'W').length
  const spW = spPicks.filter(([, p]) => p.result === 'W').length
  const mlPct = mlPicks.length ? Math.round(mlW / mlPicks.length * 100) : null
  const spPct = spPicks.length ? Math.round(spW / spPicks.length * 100) : null

  // Sport breakdown
  const bySport = {}
  entries.forEach(([, p]) => {
    const s = p.sport || 'Unknown'
    if (!bySport[s]) bySport[s] = { w: 0, l: 0 }
    if (p.result === 'W') bySport[s].w++
    else bySport[s].l++
  })

  // ROI (simplified: net coins / total coins staked)
  let totalStaked = 0, netCoins = 0
  entries.forEach(([, p]) => {
    const stake = p.stake || 1
    totalStaked += stake
    if (p.result === 'W') netCoins += p.profit || 0
    else netCoins -= stake
  })
  const roi = totalStaked > 0 ? Math.round((netCoins / totalStaked) * 100) : null

  // Hot/cold streaks by sport
  const recentSport = {}
  entries.slice(-10).forEach(([, p]) => {
    const s = p.sport || 'Unknown'
    if (!recentSport[s]) recentSport[s] = { w: 0, l: 0 }
    if (p.result === 'W') recentSport[s].w++
    else recentSport[s].l++
  })

  return { bestDay, mlW, mlL: mlPicks.length - mlW, mlPct, spW, spL: spPicks.length - spW, spPct, bySport, roi, recentSport, totalPicks: entries.length }
}

function InsightsPanel({ picks }) {
  const [open, setOpen] = useState(false)
  const insights = calcInsights(picks)
  if (!insights) return null

  return (
    <div style={{ background: '#111', border: '1px solid #1e1e2a', borderRadius: '12px', marginBottom: '1.5rem', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.85rem 1.1rem', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem' }}>🧠</span>
          <span style={{ fontWeight: 'bold', fontSize: '0.88rem', color: '#8888ff' }}>INSIGHTS</span>
          <span style={{ fontSize: '0.62rem', color: '#444', background: '#1a1a2a', border: '1px solid #2a2a4a', borderRadius: '4px', padding: '0.1rem 0.45rem' }}>
            {insights.totalPicks} picks analyzed
          </span>
        </div>
        <span style={{ color: '#444', fontSize: '0.75rem' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 1.1rem 1.1rem', borderTop: '1px solid #1a1a1a' }}>
          {/* ROI */}
          {insights.roi !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0', borderBottom: '1px solid #1a1a1a' }}>
              <span style={{ fontSize: '0.78rem', color: '#666' }}>💰 Overall ROI</span>
              <span style={{
                fontWeight: 'bold', fontSize: '0.88rem',
                color: insights.roi > 0 ? '#00ff88' : insights.roi < 0 ? '#ff4444' : '#888',
              }}>
                {insights.roi > 0 ? '+' : ''}{insights.roi}%
              </span>
            </div>
          )}
          {/* Best day */}
          {insights.bestDay?.day && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0', borderBottom: '1px solid #1a1a1a' }}>
              <span style={{ fontSize: '0.78rem', color: '#666' }}>📅 Best Day</span>
              <span style={{ fontWeight: 'bold', fontSize: '0.88rem', color: '#00ff88' }}>
                {insights.bestDay.day} · {insights.bestDay.w}W-{insights.bestDay.l}L ({Math.round(insights.bestDay.rate * 100)}%)
              </span>
            </div>
          )}
          {/* ML vs Spread */}
          <div style={{ padding: '0.65rem 0', borderBottom: '1px solid #1a1a1a' }}>
            <div style={{ fontSize: '0.68rem', color: '#555', marginBottom: '0.4rem', letterSpacing: '0.06em' }}>📊 MARKET BREAKDOWN</div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {insights.mlPct !== null && (
                <div style={{ flex: 1, background: '#0d0d0d', border: '1px solid #00ff8822', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
                  <div style={{ fontSize: '0.6rem', color: '#00ff8888', fontWeight: 'bold', marginBottom: '0.2rem' }}>MONEYLINE</div>
                  <div style={{ fontWeight: 'bold', color: insights.mlPct >= 55 ? '#00ff88' : insights.mlPct >= 45 ? '#888' : '#ff4444' }}>
                    {insights.mlW}W-{insights.mlL}L · {insights.mlPct}%
                  </div>
                </div>
              )}
              {insights.spPct !== null && (
                <div style={{ flex: 1, background: '#0d0d0d', border: '1px solid #8888ff22', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
                  <div style={{ fontSize: '0.6rem', color: '#8888ffaa', fontWeight: 'bold', marginBottom: '0.2rem' }}>SPREAD</div>
                  <div style={{ fontWeight: 'bold', color: insights.spPct >= 55 ? '#00ff88' : insights.spPct >= 45 ? '#888' : '#ff4444' }}>
                    {insights.spW}W-{insights.spL}L · {insights.spPct}%
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Sport breakdown */}
          {Object.keys(insights.bySport).length > 0 && (
            <div style={{ padding: '0.65rem 0', borderBottom: '1px solid #1a1a1a' }}>
              <div style={{ fontSize: '0.68rem', color: '#555', marginBottom: '0.4rem', letterSpacing: '0.06em' }}>🏆 BY SPORT</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {Object.entries(insights.bySport).sort((a, b) => (b[1].w / (b[1].w + b[1].l)) - (a[1].w / (a[1].w + a[1].l))).map(([sport, r]) => {
                  const pct = Math.round(r.w / (r.w + r.l) * 100)
                  return (
                    <div key={sport} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: '#666' }}>{sport}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.72rem', color: '#555' }}>{r.w}W-{r.l}L</span>
                        <div style={{ width: '40px', height: '4px', background: '#1a1a1a', borderRadius: '2px' }}>
                          <div style={{ width: `${pct}%`, height: '100%', borderRadius: '2px', background: pct >= 55 ? '#00ff88' : pct >= 45 ? '#555' : '#ff4444' }} />
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 'bold', minWidth: '2.5rem', textAlign: 'right', color: pct >= 55 ? '#00ff88' : pct >= 45 ? '#888' : '#ff4444' }}>{pct}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {/* Tip */}
          <div style={{ paddingTop: '0.65rem' }}>
            {(() => {
              const tips = []
              if (insights.mlPct !== null && insights.spPct !== null) {
                if (insights.mlPct > insights.spPct + 10) tips.push('📈 You hit Moneyline at a significantly higher rate — lean ML on close picks.')
                else if (insights.spPct > insights.mlPct + 10) tips.push('📈 You hit Spreads better than ML — consider covering when the line is right.')
              }
              if (insights.bestDay?.rate > 0.65) tips.push(`🔥 ${insights.bestDay.day} is your best day (${Math.round(insights.bestDay.rate * 100)}% win rate) — don't skip it.`)
              if (insights.roi !== null && insights.roi < -20) tips.push('⚠️ ROI is significantly negative — consider smaller stakes until form improves.')
              if (!tips.length) tips.push('Keep locking in — more data = sharper insights.')
              return <div style={{ fontSize: '0.75rem', color: '#666', fontStyle: 'italic', lineHeight: 1.5 }}>{tips[0]}</div>
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

function useMidnightCountdown() {
  const [label, setLabel] = useState('')
  useEffect(() => {
    function update() {
      const now = new Date()
      const midnight = new Date(now)
      midnight.setHours(24, 0, 0, 0)
      const diff = midnight - now
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setLabel(`next coin in ${h}h ${m}m ${s}s`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])
  return label
}

function StatsBar({ coins, streakInfo, streak, streakDates, bestStreaks, picks }) {
  const countdown = useMidnightCountdown()
  const { biased, cursed } = calcTeamStats(picks)
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
      <StatCard label="COINS" value={`🪙 ${+coins.toFixed(2)}`} sub={countdown} />
      <StatCard
        label="STREAK"
        value={streakInfo ? `${streakInfo.type === 'W' ? '🔥' : '❄'} ${streakInfo.count} ${streakInfo.type}` : 'None yet'}
        sub={streakInfo?.since ? `since ${streakInfo.since}` : null}
        color={streakInfo ? (streakInfo.type === 'W' ? '#00ff88' : '#ff4444') : '#555'}
      />
      <StatCard label="7 DAY" value={calcRecord(picks, 7)} color="#aaa" />
      <StatCard label="30 DAY" value={calcRecord(picks, 30)} color="#aaa" />
      <StatCard label="ALL TIME" value={calcRecord(picks, null)} color="#666" hidden />
      <StatCard label="BEST W STREAK" value={bestStreaks.W.count ? `🔥 ${bestStreaks.W.count} W` : '—'} sub={bestStreaks.W.since ? `started ${bestStreaks.W.since}` : null} color="#00ff88" />
      <StatCard label="WORST L STREAK" value={bestStreaks.L.count ? `❄ ${bestStreaks.L.count} L` : '—'} sub={bestStreaks.L.since ? `started ${bestStreaks.L.since}` : null} color="#ff4444" />
      <StatCard label="😇 BIASED TEAM" value={biased ? biased.name : '—'} sub={biased ? `${biased.record} · ${biased.pct}%` : null} color="#00ff88" hidden />
      <StatCard label="😈 CURSED TEAM" value={cursed ? cursed.name : '—'} sub={cursed ? `${cursed.record} · ${cursed.pct}%` : null} color="#ff4444" hidden />
    </div>
  )
}

function MonthBucket({ label, record, entries, PickRow }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#141414', border: '1px solid #1a1a1a', borderRadius: '8px',
        padding: '0.7rem 1rem', cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ color: '#555', fontSize: '0.85rem', fontWeight: 'bold' }}>{label}</span>
          <span style={{ color: '#444', fontSize: '0.75rem' }}>{record} · {entries.length} pick{entries.length !== 1 ? 's' : ''}</span>
        </div>
        <span style={{ color: '#333', fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ paddingTop: '0.4rem' }}>
          {entries.map(([date, pick]) => <PickRow key={date} date={date} pick={pick} />)}
        </div>
      )}
    </div>
  )
}

// ─── LOCK TAB ─────────────────────────────────────────────────────────────────
export default function LockTab({ allGames, loading, onRefresh, cacheAge, onLockChange }) {
  const [appState, setAppState] = useState({})
  const [modal, setModal] = useState(null)
  const [betAmount, setBetAmount] = useState(1)
  const [resolving, setResolving] = useState(false)
  const [serverOk, setServerOk] = useState(null)
  const [sportTab, setSportTab] = useState('ALL')
  const [mlbPitchers, setMlbPitchers] = useState({})
  const todayKey = getTodayKey()

  useEffect(() => {
    async function init() {
      let s
      // Retry up to 5x with 800ms delay — Tauri WebView loads before server is ready
      let connected = false
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const res = await fetch('http://127.0.0.1:3001/ping')
          await res.json()
          connected = true
          break
        } catch {
          await new Promise(r => setTimeout(r, 800))
        }
      }
      if (!connected) { setServerOk(false); return }
      try {
        const res = await fetch('http://127.0.0.1:3001/data')
        const all = await res.json()
        s = all.app || {}
        setServerOk(true)
      } catch {
        setServerOk(false)
        return
      }
      if (s.lastCoinDate !== todayKey) {
        const earned = isSaturday() ? 2 : 1
        s.coins = (s.coins || 0) + earned
        s.lastCoinDate = todayKey
        await saveState(s)
      }
      s = await resolvePendingPicks(s)
      setAppState({ ...s })
    }
    init()
  }, [])

  useEffect(() => {
    if (!allGames.length) return
    // allGames from ESPN already has espnStatus embedded — no separate fetch needed
    const hasMlb = allGames.some(g => g.sportLabel === 'MLB')
    if (hasMlb) fetchMlbProbablePitchers().then(map => setMlbPitchers(map))
  }, [allGames])

  async function resolvePendingPicks(s) {
    if (!s) s = await loadState()
    if (!s.picks) return s
    const pending = Object.entries(s.picks).filter(([, pick]) => pick.result === null)
    if (!pending.length) return s
    setResolving(true)

    for (const [date, pick] of pending) {
      if (!pick.sport) continue
      const dateStr = date.replace(/-/g, '')
      try {
        const events = await fetchEspnDate(pick.sport, dateStr)
        const homeLower = pick.home?.toLowerCase() || ''
        const awayLower = pick.away?.toLowerCase() || ''
        const homeLast  = homeLower.split(' ').pop()
        const awayLast  = awayLower.split(' ').pop()
        const event = events.find(e => {
          const competitors = e.competitions?.[0]?.competitors || []
          return competitors.some(c => {
            const dn = c.team.displayName.toLowerCase()
            return homeLower.includes(dn) || dn.includes(homeLower) ||
                   awayLower.includes(dn) || dn.includes(awayLower) ||
                   (homeLast.length > 3 && dn.includes(homeLast)) ||
                   (awayLast.length > 3 && dn.includes(awayLast))
          })
        })
        if (!event) continue
        const competition = event.competitions?.[0]
        if (!competition?.status?.type?.completed) continue
        const competitors = competition.competitors || []
        const winner = competitors.find(c => c.winner === true)
        if (!winner) continue
        const winnerName = winner.team.displayName
        const pickTeamL = pick.team.toLowerCase()
        const pickLast  = pickTeamL.split(' ').pop()
        let result
        if (pick.market === 'spreads') {
          const pickedTeam = competitors.find(c => {
            const dn = c.team.displayName.toLowerCase()
            return dn.includes(pickTeamL) || pickTeamL.includes(dn) ||
                   (pickLast.length > 3 && dn.includes(pickLast))
          })
          const otherTeam = competitors.find(c => c !== pickedTeam)
          if (!pickedTeam || !otherTeam) continue
          const adjustedScore = parseFloat(pickedTeam.score) + pick.point
          result = adjustedScore > parseFloat(otherTeam.score) ? 'W' : 'L'
        } else {
          const wnL = winnerName.toLowerCase()
          const userPickedWinner =
            wnL.includes(pickTeamL) || pickTeamL.includes(wnL) ||
            (pickLast.length > 3 && wnL.includes(pickLast))
          result = userPickedWinner ? 'W' : 'L'
        }
        s.picks[date].result = result
        s.streak = [...(s.streak || []), result]
        s.streakDates = [...(s.streakDates || []), date]
        if (result === 'W') s.coins = +((s.coins || 0) + calcPayout(pick.odds, pick.stake)).toFixed(2)
      } catch (e) { console.error('ESPN resolve error:', e) }
    }

    await saveState(s)
    setResolving(false)
    return s
  }

  const todayPick = appState.picks?.[todayKey]
  const streak = appState.streak || []
  const streakDates = appState.streakDates || []
  const coins = appState.coins || 0

  const streakInfo = (() => {
    if (!streak.length) return null
    const last = streak[streak.length - 1]
    let count = 0, startIdx = streak.length - 1
    for (let i = streak.length - 1; i >= 0; i--) {
      if (streak[i] === last) { count++; startIdx = i }
      else break
    }
    const startDate = streakDates[startIdx]
    let since = null
    if (startDate) { const [, mm, dd] = startDate.split('-'); since = `${mm}/${dd}` }
    return { type: last, count, since }
  })()

  const bestStreaks = (() => {
    const calc = (type) => {
      let best = 0, bestStart = null, cur = 0, curStart = null
      for (let i = 0; i < streak.length; i++) {
        if (streak[i] === type) { if (cur === 0) curStart = i; cur++; if (cur > best) { best = cur; bestStart = curStart } }
        else { cur = 0; curStart = null }
      }
      let since = null
      if (bestStart !== null && streakDates[bestStart]) { const [, mm, dd] = streakDates[bestStart].split('-'); since = `${mm}/${dd}` }
      return { count: best, since }
    }
    return { W: calc('W'), L: calc('L') }
  })()

  function openModal(game, team, odds, market, point) {
    if (todayPick || coins < 1) return
    setBetAmount(1)
    setModal({ game, team, odds, market, point })
  }

  async function confirmPick() {
    if (!modal) return
    // Re-read fresh state from server as final guard — prevents race with UTC date flip
    const fresh = await loadState()
    const currentKey = getTodayKey()
    if (fresh.picks?.[currentKey]) {
      setModal(null)
      return // already locked today, bail silently
    }
    const { game, team, odds, market, point } = modal
    const stake = Math.min(Math.max(1, betAmount), coins)
    const profit = calcProfit(odds, stake)
    const s = { ...fresh, picks: { ...(fresh.picks || {}) } }
    s.picks[currentKey] = {
      gameId: game.id, team, odds, market, point,
      home: game.home_team, away: game.away_team,
      sport: game.sportLabel, commenceTime: game.commence_time,
      stake, profit, result: null,
    }
    s.coins = +Math.max(0, (s.coins || 0) - stake).toFixed(2)
    setAppState({ ...s })
    setModal(null)
    await saveState(s)
    onLockChange && onLockChange()
  }

  const safeBet = Math.min(Math.max(1, betAmount || 1), coins)
  const previewProfit = modal ? calcProfit(modal.odds, safeBet) : 0
  const previewTotal = modal ? calcPayout(modal.odds, safeBet) : 0

  return (
    <div>
      {serverOk === false && (
        <div style={{ background: '#2a0a0a', border: '1px solid #ff444455', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1.5rem', color: '#ff6644', fontSize: '0.82rem', lineHeight: 1.6 }}>
          ⚠ <strong>Save server offline</strong> — your data is safe.<br />
          <span style={{ color: '#888', fontSize: '0.78rem' }}>
            Start it with one of:<br />
            • Terminal: <code style={{ background: '#1a0a0a', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem' }}>cd ~/rabbit/root/projects/onit/betonme && node server.js</code><br />
            • Service: <code style={{ background: '#1a0a0a', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem' }}>systemctl --user start betonme-server</code>
          </span>
        </div>
      )}
      {serverOk === null && (
        <div style={{ color: '#444', fontSize: '0.8rem', marginBottom: '1rem' }}>⏳ Connecting to server...</div>
      )}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: '14px', padding: '2rem', width: '100%', maxWidth: '420px' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem' }}>🔒 Confirm Your Lock</h2>
            <p style={{ color: '#555', fontSize: '0.8rem', marginBottom: '1.5rem' }}>One pick per day — make it count · odds locked at pick time</p>
            <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '0.4rem' }}>{modal.game.sportLabel}</div>
              <div style={{ marginBottom: '0.4rem' }}>
                <strong style={{ fontSize: '1.05rem' }}>{modal.team}</strong>
                <span style={{ color: '#555', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                  {modal.market === 'h2h' ? 'Moneyline' : `Spread ${modal.point > 0 ? '+' : ''}${modal.point}`} ({formatOdds(modal.odds)})
                </span>
              </div>
              <div style={{ color: '#555', fontSize: '0.82rem' }}>{modal.game.away_team} vs {modal.game.home_team}</div>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#888', marginBottom: '0.5rem' }}>
                HOW MANY COINS? <span style={{ color: '#555' }}>(max: {coins})</span>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="number" min={1} max={coins} value={betAmount}
                  onChange={e => setBetAmount(Math.min(Math.max(1, Number(e.target.value)), coins))}
                  style={{ flex: 1, padding: '0.75rem 1rem', fontSize: '1.2rem', background: '#0f0f0f', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
                />
                <button
                  onClick={() => setBetAmount(coins)}
                  style={{ padding: '0.75rem 1.1rem', background: '#1a1a2a', border: '1px solid #4444aa', borderRadius: '8px', color: '#8888ff', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
                >
                  MAX
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', background: '#0a2a1a', border: '1px solid #00ff8833', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#555', marginBottom: '0.2rem' }}>RISKING</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#ff9944' }}>🪙 {safeBet}</div>
              </div>
              <div style={{ color: '#333', fontSize: '1.5rem', alignSelf: 'center' }}>→</div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#555', marginBottom: '0.2rem' }}>YOU GET BACK</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#00ff88' }}>🪙 {previewTotal}</div>
                <div style={{ fontSize: '0.7rem', color: '#555' }}>+{previewProfit} profit · {safeBet} stake back</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: '0.85rem', background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: '#888', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button onClick={confirmPick} style={{ flex: 2, padding: '0.85rem', background: '#00ff88', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>Bet That 🔒</button>
            </div>
          </div>
        </div>
      )}

      <StatsBar coins={coins} streakInfo={streakInfo} streak={streak} streakDates={streakDates} bestStreaks={bestStreaks} picks={appState.picks || {}} />

      <InsightsPanel picks={appState.picks || {}} />

      {resolving && <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem' }}>⏳ Checking results...</div>}

      {todayPick && (
        <div style={{ background: '#111', border: `1px solid ${todayPick.result === 'W' ? '#00ff88' : todayPick.result === 'L' ? '#ff4444' : '#444'}`, borderRadius: '10px', padding: '1.25rem', marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#00ff88', marginBottom: '0.5rem' }}>🔒 TODAY'S LOCK</div>
          <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {getTeamLogoUrl(todayPick.team, todayPick.sport) && <img src={getTeamLogoUrl(todayPick.team, todayPick.sport)} style={{ ...LOGO_STYLE, width: '28px', height: '28px' }} alt="" />}
            <strong style={{ fontSize: '1.1rem' }}>{todayPick.team}</strong>
            <span style={{ color: '#888', marginLeft: '0.25rem' }}>
              {todayPick.market === 'h2h' ? 'Moneyline' : `Spread ${todayPick.point > 0 ? '+' : ''}${todayPick.point}`} ({formatOdds(todayPick.odds)})
            </span>
          </div>
          <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{todayPick.home} vs {todayPick.away} · {todayPick.sport}</div>
          <div style={{ fontSize: '0.85rem', color: '#888' }}>
            Staked: <span style={{ color: '#ff9944' }}>🪙 {todayPick.stake}</span>
            <span style={{ margin: '0 0.5rem', color: '#333' }}>·</span>
            If win: <span style={{ color: '#00ff88' }}>🪙 {calcPayout(todayPick.odds, todayPick.stake)} back</span>
            <span style={{ color: '#555', fontSize: '0.8rem' }}> (+{calcProfit(todayPick.odds, todayPick.stake)} profit)</span>
          </div>
          {todayPick.result === null && <div style={{ marginTop: '0.75rem', color: '#555', fontSize: '0.82rem' }}>⏳ Waiting for final score — auto-resolves when game ends</div>}
          {todayPick.result === 'W' && <div style={{ marginTop: '0.5rem', color: '#00ff88', fontWeight: 'bold' }}>✅ WIN — 🪙 {calcPayout(todayPick.odds, todayPick.stake)} returned</div>}
          {todayPick.result === 'L' && <div style={{ marginTop: '0.5rem', color: '#ff4444', fontWeight: 'bold' }}>❌ LOSS — 🪙 {todayPick.stake} lost</div>}
        </div>
      )}

      {!todayPick && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1rem', color: '#aaa' }}>🎯 PICK YOUR LOCK</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {cacheAge && <span style={{ color: '#555', fontSize: '0.75rem' }}>updated {cacheAge} · auto-refreshes every 8h</span>}

            </div>
          </div>
          {coins < 1 && <p style={{ color: '#ff4444' }}>No coins — come back tomorrow!</p>}
          {loading && <p style={{ color: '#888' }}>Fetching games...</p>}
          {(() => {
            const lds = (iso) => { const d = new Date(iso); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') }
            const now = new Date()
            const todayStr    = lds(now.toISOString())
            const tomorrowStr = lds(new Date(now.getTime() + 86400000).toISOString())
            const all = filterBySport(allGames, sportTab)
              .filter(g => g.espnStatus?.type?.state !== 'post')  // no finals in lock tab
              .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))
            const todayGames    = all.filter(g => lds(g.commence_time) === todayStr)
            const tomorrowGames = all.filter(g => lds(g.commence_time) === tomorrowStr)
            const laterGames    = all.filter(g => lds(g.commence_time) > tomorrowStr)

            const renderGame = (game) => {
              const bm = game.bookmakers?.[0]
              const ml = bm?.markets?.find(m => m.key === 'h2h')
              const sp = bm?.markets?.find(m => m.key === 'spreads')
              const status = getGameStatus(game)
              const isLive = status?.state === 'in'
              const isMlb = game.sportLabel === 'MLB'
              const awayPitcher = isMlb ? getProbablePitcher(game.away_team, mlbPitchers) : null
              const homePitcher = isMlb ? getProbablePitcher(game.home_team, mlbPitchers) : null
              return (
                <div key={game.id} style={{ background: '#1a1a1a', border: `1px solid ${isLive ? '#ff994433' : '#2a2a2a'}`, borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: isMlb ? '0.3rem' : '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ color: '#555', fontSize: '0.75rem', marginRight: '0.3rem' }}>{game.sportLabel}</span>
                      {getTeamLogoUrl(game.home_team, game.sportLabel) && <img src={getTeamLogoUrl(game.home_team, game.sportLabel)} style={{ ...LOGO_STYLE, width: '20px', height: '20px' }} alt="" />}
                      <strong>{game.home_team}</strong>
                      <span style={{ color: '#444', margin: '0 0.3rem' }}>vs</span>
                      {getTeamLogoUrl(game.away_team, game.sportLabel) && <img src={getTeamLogoUrl(game.away_team, game.sportLabel)} style={{ ...LOGO_STYLE, width: '20px', height: '20px' }} alt="" />}
                      <strong>{game.away_team}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {isLive && <span style={{ fontSize: '0.68rem', fontWeight: 'bold', padding: '0.15rem 0.5rem', background: '#2a1500', border: '1px solid #ff994466', borderRadius: '4px', color: '#ff9944' }}>🔴 LIVE · {status.label}</span>}
                      <span style={{ color: '#444', fontSize: '0.8rem' }}>{getGameDateLabel(game.commence_time)}</span>
                    </div>
                  </div>
                  {isMlb && (
                    <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.72rem', marginBottom: '0.75rem' }}>
                      <span>⚾ <span style={{ color: '#4c9be8' }}>{game.away_team.split(' ').pop()}:</span> <span style={{ color: awayPitcher ? '#aaa' : '#444' }}>{awayPitcher || 'TBA'}</span></span>
                      <span>⚾ <span style={{ color: '#4c9be8' }}>{game.home_team.split(' ').pop()}:</span> <span style={{ color: homePitcher ? '#aaa' : '#444' }}>{homePitcher || 'TBA'}</span></span>
                    </div>
                  )}
                  {isLive ? (
                    <div style={{ fontSize: '0.78rem', color: '#ff9944', fontStyle: 'italic' }}>Game in progress — betting closed</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {ml?.outcomes.map(o => (
                        <button key={`ml-${o.name}`} onClick={() => openModal(game, o.name, o.price, 'h2h', null)} disabled={coins < 1} style={{ padding: '0.5rem 1rem', borderRadius: '6px', cursor: coins < 1 ? 'not-allowed' : 'pointer', background: o.price < 0 ? '#0a2a1a' : '#2a1a0a', border: `1px solid ${o.price < 0 ? '#00ff88' : '#ff9944'}`, color: o.price < 0 ? '#00ff88' : '#ff9944', fontSize: '0.85rem', fontWeight: 'bold' }}>
                          {o.name} ML {formatOdds(o.price)}
                          <span style={{ display: 'block', fontSize: '0.7rem', color: '#666' }}>+{calcProfit(o.price, 1)} profit per coin</span>
                        </button>
                      ))}
                      {sp?.outcomes.map(o => (
                        <button key={`sp-${o.name}`} onClick={() => openModal(game, o.name, o.price, 'spreads', o.point)} disabled={coins < 1} style={{ padding: '0.5rem 1rem', borderRadius: '6px', cursor: coins < 1 ? 'not-allowed' : 'pointer', background: '#1a1a2a', border: '1px solid #4444aa', color: '#8888ff', fontSize: '0.85rem', fontWeight: 'bold' }}>
                          {o.name} {o.point > 0 ? '+' : ''}{o.point} ({formatOdds(o.price)})
                          <span style={{ display: 'block', fontSize: '0.7rem', color: '#666' }}>+{calcProfit(o.price, 1)} profit per coin</span>
                        </button>
                      ))}
                      {!ml && <span style={{ color: '#444', fontSize: '0.78rem', fontStyle: 'italic' }}>Lines not yet posted</span>}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <>
                {!loading && all.length === 0 && <p style={{ color: '#555' }}>No {sportTab === 'ALL' ? '' : sportTab + ' '}games available.</p>}
                {todayGames.length > 0 && <>
                  <div style={{ fontSize: '0.62rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>🏟️ TODAY · {todayGames.length} game{todayGames.length !== 1 ? 's' : ''}</div>
                  {todayGames.map(renderGame)}
                </>}
                {tomorrowGames.length > 0 && <>
                  <div style={{ fontSize: '0.62rem', color: '#4c9be8', fontWeight: 'bold', letterSpacing: '0.08em', margin: '1rem 0 0.5rem' }}>🌅 TOMORROW · {tomorrowGames.length} game{tomorrowGames.length !== 1 ? 's' : ''}</div>
                  {tomorrowGames.map(renderGame)}
                </>}
                {laterGames.length > 0 && <>
                  <div style={{ fontSize: '0.62rem', color: '#444', fontWeight: 'bold', letterSpacing: '0.08em', margin: '1rem 0 0.5rem' }}>📆 LATER · {laterGames.length} game{laterGames.length !== 1 ? 's' : ''}</div>
                  {laterGames.map(renderGame)}
                </>}
              </>
            )
          })()}
        </>
      )}

      {appState.picks && Object.keys(appState.picks).length > 0 && (() => {
        const allEntries = Object.entries(appState.picks).sort((a, b) => b[0].localeCompare(a[0]))
        const recent = allEntries.slice(0, 10)
        const older = allEntries.slice(10)
        const byMonth = {}
        older.forEach(([date, pick]) => {
          const monthKey = date.slice(0, 7)
          if (!byMonth[monthKey]) byMonth[monthKey] = []
          byMonth[monthKey].push([date, pick])
        })
        const PickRow = ({ date, pick }) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
            <span style={{ color: '#555' }}>{date}</span>
            <span><strong>{pick.team}</strong></span>
            <span style={{ color: '#555' }}>{pick.market === 'h2h' ? 'ML' : `SP ${pick.point > 0 ? '+' : ''}${pick.point}`} {formatOdds(pick.odds)}</span>
            <span style={{ color: '#555' }}>{pick.sport}</span>
            <span style={{ color: '#ff9944' }}>🪙 {pick.stake}</span>
            <span style={{ fontWeight: 'bold', color: pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#444' }}>{pick.result || '⏳'}</span>
          </div>
        )
        return (
          <div style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1rem', color: '#aaa', marginBottom: '1rem' }}>📋 HISTORY</h2>
            {recent.map(([date, pick]) => <PickRow key={date} date={date} pick={pick} />)}
            {Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([monthKey, entries]) => {
              const [year, month] = monthKey.split('-')
              const label = new Date(Number(year), Number(month) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
              const mW = entries.filter(([,p]) => p.result === 'W').length
              const mL = entries.filter(([,p]) => p.result === 'L').length
              return <MonthBucket key={monthKey} label={label} record={`${mW}W-${mL}L`} entries={entries} PickRow={PickRow} />
            })}
          </div>
        )
      })()}
    </div>
  )
}