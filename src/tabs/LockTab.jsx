import React, { useState, useEffect } from 'react'
import { getTodayKey, isSaturday, formatOdds, calcProfit, calcPayout } from '../utils/odds.js'
import { loadState, saveState } from '../hooks/useSaveData.js'

const ESPN_ENDPOINTS = { MLB: 'baseball/mlb', NFL: 'football/nfl', NBA: 'basketball/nba' }

function getGameStatus(game, espnEvents) {
  if (!espnEvents) return null
  const match = espnEvents.find(e => {
    const comps = e.competitions?.[0]?.competitors || []
    return comps.some(c => {
      const dn = c.team.displayName.toLowerCase()
      return game.home_team.toLowerCase().includes(dn) || dn.includes(game.home_team.toLowerCase()) ||
             game.away_team.toLowerCase().includes(dn) || dn.includes(game.away_team.toLowerCase())
    })
  })
  if (!match) return null
  const status = match.competitions?.[0]?.status
  if (!status) return null
  const state = status.type?.state
  const completed = status.type?.completed
  if (completed || state === 'post') {
    const comps = match.competitions?.[0]?.competitors || []
    const scores = comps.map(c => `${c.team.abbreviation} ${c.score}`).join(' · ')
    return { state: 'post', label: scores ? `Final · ${scores}` : 'Final' }
  }
  if (state === 'in') {
    const clock = status.displayClock
    const period = status.period
    const sport = game.sportLabel
    let p = period ? (sport === 'MLB' ? `Inn ${period}` : `Q${period}`) : ''
    return { state: 'in', label: [p, clock].filter(Boolean).join(' · ') || 'In Progress' }
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
  const entries = Object.entries(teams).filter(([, r]) => r.w + r.l > 0)
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
    biased: biased.team ? { name: biased.team, record: `${biased.w}W-${biased.l}L` } : null,
    cursed: cursed.team ? { name: cursed.team, record: `${cursed.w}W-${cursed.l}L` } : null,
  }
}

function StatsBar({ coins, streakInfo, streak, streakDates, bestStreaks, picks }) {
  const { biased, cursed } = calcTeamStats(picks)
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
      <StatCard label="COINS" value={`🪙 ${coins}`} />
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
      <StatCard label="😇 BIASED TEAM" value={biased ? biased.name : '—'} sub={biased ? biased.record : null} color="#00ff88" hidden />
      <StatCard label="😈 CURSED TEAM" value={cursed ? cursed.name : '—'} sub={cursed ? cursed.record : null} color="#ff4444" hidden />
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
  const [espnByLeague, setEspnByLeague] = useState({})
  const todayKey = getTodayKey()

  useEffect(() => {
    async function init() {
      let s
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
    async function fetchStatuses() {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
      const result = {}
      await Promise.all(
        Object.entries(ESPN_ENDPOINTS).map(async ([league, endpoint]) => {
          try {
            const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${endpoint}/scoreboard?dates=${today}`)
            const data = await res.json()
            result[league] = data.events || []
          } catch { result[league] = [] }
        })
      )
      setEspnByLeague(result)
    }
    fetchStatuses()
  }, [allGames])

  async function resolvePendingPicks(s) {
    if (!s) s = await loadState()
    if (!s.picks) return s
    const pending = Object.entries(s.picks).filter(([, pick]) => pick.result === null)
    if (!pending.length) return s
    setResolving(true)

    const ESPN_ENDPOINTS = { MLB: 'baseball/mlb', NFL: 'football/nfl', NBA: 'basketball/nba' }

    for (const [date, pick] of pending) {
      const endpoint = ESPN_ENDPOINTS[pick.sport]
      if (!endpoint) continue
      const dateStr = date.replace(/-/g, '')
      try {
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${endpoint}/scoreboard?dates=${dateStr}`)
        const data = await res.json()
        const events = data.events || []
        const event = events.find(e => {
          const competitors = e.competitions?.[0]?.competitors || []
          return competitors.some(c =>
            pick.home.toLowerCase().includes(c.team.displayName.toLowerCase()) ||
            c.team.displayName.toLowerCase().includes(pick.home.toLowerCase()) ||
            pick.away.toLowerCase().includes(c.team.displayName.toLowerCase()) ||
            c.team.displayName.toLowerCase().includes(pick.away.toLowerCase())
          )
        })
        if (!event) continue
        const competition = event.competitions?.[0]
        if (!competition?.status?.type?.completed) continue
        const competitors = competition.competitors || []
        const winner = competitors.find(c => c.winner === true)
        if (!winner) continue
        const winnerName = winner.team.displayName
        let result
        if (pick.market === 'spreads') {
          const pickedTeam = competitors.find(c =>
            pick.team.toLowerCase().includes(c.team.displayName.toLowerCase()) ||
            c.team.displayName.toLowerCase().includes(pick.team.toLowerCase())
          )
          const otherTeam = competitors.find(c => c !== pickedTeam)
          if (!pickedTeam || !otherTeam) continue
          const adjustedScore = parseFloat(pickedTeam.score) + pick.point
          result = adjustedScore > parseFloat(otherTeam.score) ? 'W' : 'L'
        } else {
          const userPickedWinner =
            winnerName.toLowerCase().includes(pick.team.toLowerCase()) ||
            pick.team.toLowerCase().includes(winnerName.toLowerCase())
          result = userPickedWinner ? 'W' : 'L'
        }
        s.picks[date].result = result
        s.streak = [...(s.streak || []), result]
        s.streakDates = [...(s.streakDates || []), date]
        if (result === 'W') s.coins = (s.coins || 0) + calcPayout(pick.odds, pick.stake)
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
    const { game, team, odds, market, point } = modal
    const stake = Math.min(Math.max(1, betAmount), coins)
    const profit = calcProfit(odds, stake)
    const s = { ...appState, picks: { ...(appState.picks || {}) } }
    s.picks[todayKey] = {
      gameId: game.id, team, odds, market, point,
      home: game.home_team, away: game.away_team,
      sport: game.sportLabel, commenceTime: game.commence_time,
      stake, profit, result: null,
    }
    s.coins = (s.coins || 0) - stake
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
        <div style={{ background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem', color: '#ff4444', fontSize: '0.85rem' }}>
          ⚠ Server offline — run <code style={{ background: '#1a0a0a', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>pnpm dev</code> to start it. Your data is safe but nothing will load until it's running.
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

      {resolving && <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem' }}>⏳ Checking results...</div>}

      {todayPick && (
        <div style={{ background: '#111', border: `1px solid ${todayPick.result === 'W' ? '#00ff88' : todayPick.result === 'L' ? '#ff4444' : '#444'}`, borderRadius: '10px', padding: '1.25rem', marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#00ff88', marginBottom: '0.5rem' }}>🔒 TODAY'S LOCK</div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '1.1rem' }}>{todayPick.team}</strong>
            <span style={{ color: '#888', marginLeft: '0.75rem' }}>
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
              {cacheAge && <span style={{ color: '#555', fontSize: '0.8rem' }}>{cacheAge}</span>}
              <button onClick={onRefresh} style={{ padding: '0.4rem 1rem', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>🔄 Refresh</button>
            </div>
          </div>
          {coins < 1 && <p style={{ color: '#ff4444' }}>No coins — come back tomorrow!</p>}
          {loading && <p style={{ color: '#888' }}>Fetching games...</p>}
          {allGames.map(game => {
            const bm = game.bookmakers?.[0]
            if (!bm) return null
            const ml = bm.markets?.find(m => m.key === 'h2h')
            const sp = bm.markets?.find(m => m.key === 'spreads')
            const status = getGameStatus(game, espnByLeague[game.sportLabel])
            const isLive = status?.state === 'in'
            const isFinal = status?.state === 'post'
            const isUnavailable = isLive || isFinal
            return (
              <div key={game.id} style={{
                background: '#1a1a1a',
                border: `1px solid ${isLive ? '#ff994433' : isFinal ? '#2a2a2a' : '#2a2a2a'}`,
                borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem',
                opacity: isFinal ? 0.45 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div>
                    <span style={{ color: '#555', fontSize: '0.75rem', marginRight: '0.5rem' }}>{game.sportLabel}</span>
                    <strong>{game.home_team}</strong>
                    <span style={{ color: '#444', margin: '0 0.5rem' }}>vs</span>
                    <strong>{game.away_team}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {isLive && (
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 'bold', padding: '0.15rem 0.5rem',
                        background: '#2a1500', border: '1px solid #ff994466',
                        borderRadius: '4px', color: '#ff9944',
                      }}>🔴 LIVE · {status.label}</span>
                    )}
                    {isFinal && (
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 'bold', padding: '0.15rem 0.5rem',
                        background: '#111', border: '1px solid #2a2a2a',
                        borderRadius: '4px', color: '#444',
                      }}>✓ {status.label}</span>
                    )}
                    <span style={{ color: '#444', fontSize: '0.8rem' }}>
                      {new Date(game.commence_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                {isUnavailable ? (
                  <div style={{ fontSize: '0.78rem', color: '#444', fontStyle: 'italic' }}>
                    {isLive ? 'Game in progress — betting closed' : 'Game over — betting closed'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {ml?.outcomes.map(o => (
                      <button key={`ml-${o.name}`} onClick={() => openModal(game, o.name, o.price, 'h2h', null)} disabled={coins < 1} style={{
                        padding: '0.5rem 1rem', borderRadius: '6px', cursor: coins < 1 ? 'not-allowed' : 'pointer',
                        background: o.price < 0 ? '#0a2a1a' : '#2a1a0a',
                        border: `1px solid ${o.price < 0 ? '#00ff88' : '#ff9944'}`,
                        color: o.price < 0 ? '#00ff88' : '#ff9944', fontSize: '0.85rem', fontWeight: 'bold',
                      }}>
                        {o.name} ML {formatOdds(o.price)}
                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#666' }}>+{calcProfit(o.price, 1)} profit per coin</span>
                      </button>
                    ))}
                    {sp?.outcomes.map(o => (
                      <button key={`sp-${o.name}`} onClick={() => openModal(game, o.name, o.price, 'spreads', o.point)} disabled={coins < 1} style={{
                        padding: '0.5rem 1rem', borderRadius: '6px', cursor: coins < 1 ? 'not-allowed' : 'pointer',
                        background: '#1a1a2a', border: '1px solid #4444aa', color: '#8888ff', fontSize: '0.85rem', fontWeight: 'bold',
                      }}>
                        {o.name} {o.point > 0 ? '+' : ''}{o.point} ({formatOdds(o.price)})
                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#666' }}>+{calcProfit(o.price, 1)} profit per coin</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {!loading && allGames.length === 0 && <p style={{ color: '#555' }}>No games today.</p>}
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