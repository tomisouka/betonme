import React, { useState, useEffect } from 'react'
import { loadLayHistory, saveLayHistory, loadPredictions, savePredictions, loadState, saveState, loadDogState, saveDogStateServer, loadOuPick, saveOuPick, loadPropPick, fetchEspnDate } from '../hooks/useSaveData.js'
import { formatOdds, calcProfit } from '../utils/odds.js'

function fmtDateLabel(key) {
  if (!key) return ''
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const d = new Date(key + 'T12:00:00')
  const [, mm, dd] = key.split('-')
  return `${days[d.getDay()]} ${mm}/${dd}`
}

function getTodayKey() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const W_COLOR = '#00ff88'
const L_COLOR = '#ff4444'

// ── Score / stat fetching ──────────────────────────────────────────────────────
const _scoreCache = {}

async function fetchGameScore(sport, gameId) {
  const cacheKey = `${sport}_${gameId}`
  if (_scoreCache[cacheKey]) return _scoreCache[cacheKey]
  const endpoints = { MLB: 'baseball/mlb', NFL: 'football/nfl', NBA: 'basketball/nba' }
  const ep = endpoints[sport]
  if (!ep || !gameId) return null
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${ep}/summary?event=${gameId}`)
    const data = await res.json()
    const competitors = data.header?.competitions?.[0]?.competitors || []
    const score = {}
    competitors.forEach(c => {
      const name = c.team?.displayName || c.team?.shortDisplayName || ''
      score[name] = c.score
    })
    // For props: extract player stats from boxscore
    const playerStats = {}
    const athletes = data.boxscore?.players || []
    athletes.forEach(teamGroup => {
      ;(teamGroup.statistics || []).forEach(statGroup => {
        ;(statGroup.athletes || []).forEach(a => {
          const name = a.athlete?.displayName
          if (!name) return
          const stats = {}
          ;(statGroup.labels || []).forEach((label, i) => {
            stats[label] = a.stats?.[i]
          })
          playerStats[name] = stats
        })
      })
    })
    const result = { score, playerStats, competitors }
    _scoreCache[cacheKey] = result
    return result
  } catch { return null }
}

const PROP_STAT_MAP = {
  player_strikeouts:   { label: 'K', espnKeys: ['SO', 'K'] },
  pitcher_strikeouts:  { label: 'K', espnKeys: ['SO', 'K'] },
  player_points:       { label: 'PTS', espnKeys: ['PTS', 'P'] },
  player_rebounds:     { label: 'REB', espnKeys: ['REB', 'R'] },
  player_assists:      { label: 'AST', espnKeys: ['AST', 'A'] },
  player_hits:         { label: 'H', espnKeys: ['H'] },
  player_home_runs:    { label: 'HR', espnKeys: ['HR'] },
  player_rbis:         { label: 'RBI', espnKeys: ['RBI'] },
}



function resultDot(result) {
  if (result === 'W') return <span style={{ color: W_COLOR }}>✅</span>
  if (result === 'L') return <span style={{ color: L_COLOR }}>❌</span>
  return <span style={{ color: '#555' }}>⏳</span>
}

function resultBadge(result, hitCount, totalCount) {
  if (!result) return null
  const pct = totalCount ? Math.round(hitCount / totalCount * 100) : null
  return (
    <div style={{
      padding: '0.2rem 0.65rem', borderRadius: '5px', fontWeight: 'bold', fontSize: '0.75rem',
      background: result === 'W' ? '#00ff8818' : '#ff444418',
      border: `1px solid ${result === 'W' ? '#00ff8833' : '#ff444433'}`,
      color: result === 'W' ? W_COLOR : L_COLOR, flexShrink: 0,
    }}>
      {hitCount != null && totalCount != null ? `${hitCount}/${totalCount} · ` : ''}
      {pct != null ? `${pct}% ` : ''}{result === 'W' ? '✅' : '❌'}
    </div>
  )
}

function Section({ emoji, title, accent, children, badge, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: '12px', marginBottom: '0.75rem', overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.65rem 1rem', borderBottom: open ? '1px solid #1a1a1a' : 'none',
          background: '#141414', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '0.82rem', color: accent || '#aaa' }}>{emoji} {title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {badge}
          <span style={{ color: '#333', fontSize: '0.75rem', fontWeight: 'bold' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && <div style={{ padding: '0.75rem 1rem' }}>{children}</div>}
    </div>
  )
}

function LegRow({ label, labelColor, team, sub, result, odds, scoreInfo }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.55rem 0.75rem', borderRadius: '8px',
      background: result === 'W' ? '#0a2a1a' : result === 'L' ? '#2a0a0a' : '#1a1a1a',
      border: `1px solid ${result === 'W' ? '#00ff8833' : result === 'L' ? '#ff444433' : '#2a2a2a'}`,
      marginBottom: '0.4rem',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.6rem', color: labelColor || '#555', fontWeight: 'bold', marginBottom: '0.15rem', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ fontWeight: 'bold', fontSize: '0.88rem' }}>{team || '—'}</div>
        {sub && <div style={{ color: '#444', fontSize: '0.7rem', marginTop: '0.1rem' }}>{sub}</div>}
        {scoreInfo && (
          <div style={{ fontSize: '0.68rem', color: result === 'W' ? '#00ff8899' : result === 'L' ? '#ff444499' : '#555', marginTop: '0.2rem', fontStyle: 'italic' }}>
            {scoreInfo}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
        {odds != null && (
          <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: odds < 0 ? W_COLOR : '#ff9944' }}>{formatOdds(odds)}</div>
        )}
        <div style={{ fontSize: '1.1rem' }}>{resultDot(result)}</div>
      </div>
    </div>
  )
}

function calcTotalOdds(legs) {
  // Parlay math: convert each American odds to decimal, multiply, convert back
  const oddsArr = legs.map(l => l.odds).filter(o => o != null && !isNaN(o))
  if (oddsArr.length === 0) return null
  const decimal = oddsArr.reduce((acc, o) => {
    const d = o < 0 ? (100 / Math.abs(o) + 1) : (o / 100 + 1)
    return acc * d
  }, 1)
  // Convert decimal back to American
  const american = decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : Math.round(-100 / (decimal - 1))
  return american
}

function TotalOddsRow({ legs, label = 'TOTAL ODDS' }) {
  const total = calcTotalOdds(legs.filter(l => l.odds != null))
  if (total == null) return null
  const fmt = total > 0 ? `+${total}` : `${total}`
  const payout = total > 0
    ? (1 + total / 100).toFixed(2)
    : (1 + 100 / Math.abs(total)).toFixed(2)
  const payoutFmt = parseFloat(payout).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div style={{
      background: '#0d0d0d', border: '1px solid #222', borderRadius: '8px',
      marginTop: '0.35rem', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.5rem 0.75rem',
      }}>
        <span style={{ fontSize: '0.62rem', color: '#444', letterSpacing: '0.07em', fontWeight: 'bold' }}>{label}</span>
        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: total > 0 ? '#ff9944' : '#4c9be8' }}>{fmt}</span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.35rem 0.75rem 0.45rem',
        borderTop: '1px solid #181818',
      }}>
        <span style={{ fontSize: '0.6rem', color: '#333', letterSpacing: '0.05em' }}>🪙1 wins</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#666' }}>
          → <span style={{ color: total > 0 ? '#ff994499' : '#4c9be899' }}>🪙{payoutFmt}</span>
        </span>
      </div>
    </div>
  )
}

export default function PastLayTab() {
  const [allData, setAllData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState(null)
  const [gameScores, setGameScores] = useState({}) // gameId -> { score, playerStats }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [appState, dogState, layHist, predHist, ouHist, propHist] = await Promise.all([
        loadState(), loadDogState(), loadLayHistory(), loadPredictions(), loadOuPick(), loadPropPick(),
      ])

      // Resolve any unresolved LOCK picks
      let lockChanged = false
      const today = getTodayKey()
      for (const [date, pick] of Object.entries(appState.picks || {})) {
        if (pick.result !== null || !pick.sport || date >= today) continue
        try {
          const events = await fetchEspnDate(pick.sport, date.replace(/-/g, ''))
          const homeLower = (pick.home || '').toLowerCase()
          const homeLast = homeLower.split(' ').pop()
          const event = events.find(e =>
            (e.competitions?.[0]?.competitors || []).some(c => {
              const dn = c.team.displayName.toLowerCase()
              return homeLower.includes(dn) || dn.includes(homeLower) ||
                     (homeLast.length > 3 && dn.includes(homeLast))
            })
          )
          if (!event) continue
          const comp = event.competitions?.[0]
          if (!comp?.status?.type?.completed) continue
          const competitors = comp.competitors || []
          const pickTeamL = (pick.team || '').toLowerCase()
          const pickLast = pickTeamL.split(' ').pop()
          let result
          if (pick.market === 'spreads' && pick.point != null) {
            const pickedComp = competitors.find(c => {
              const dn = c.team.displayName.toLowerCase()
              return dn.includes(pickTeamL) || pickTeamL.includes(dn) ||
                     (pickLast.length > 3 && dn.includes(pickLast))
            })
            const otherComp = competitors.find(c => c !== pickedComp)
            if (!pickedComp || !otherComp) continue
            const adj = parseFloat(pickedComp.score) + pick.point
            result = adj > parseFloat(otherComp.score) ? 'W' : 'L'
          } else {
            const winner = competitors.find(c => c.winner)
            if (!winner) continue
            const wnL = winner.team.displayName.toLowerCase()
            const won = wnL.includes(pickTeamL) || pickTeamL.includes(wnL) ||
                        (pickLast.length > 3 && wnL.includes(pickLast))
            result = won ? 'W' : 'L'
          }
          appState.picks[date].result = result
          appState.streak = [...(appState.streak || []), result]
          appState.streakDates = [...(appState.streakDates || []), date]
          if (result === 'W' && pick.profit != null) appState.coins = +((appState.coins || 0) + pick.profit + (pick.stake || 1)).toFixed(2)
          lockChanged = true
        } catch(e) {}
      }
      if (lockChanged) await saveState(appState)

      // Resolve any unresolved DOG picks
      let dogChanged = false
      for (const [date, pick] of Object.entries(dogState.picks || {})) {
        if (pick.result !== null || !pick.sport || date >= today) continue
        try {
          const events = await fetchEspnDate(pick.sport, date.replace(/-/g, ''))
          const homeLower = (pick.home || '').toLowerCase()
          const homeLast = homeLower.split(' ').pop()
          const event = events.find(e =>
            (e.competitions?.[0]?.competitors || []).some(c => {
              const dn = c.team.displayName.toLowerCase()
              return homeLower.includes(dn) || dn.includes(homeLower) ||
                     (homeLast.length > 3 && dn.includes(homeLast))
            })
          )
          if (!event) continue
          const comp = event.competitions?.[0]
          if (!comp?.status?.type?.completed) continue
          const winner = comp.competitors?.find(c => c.winner)
          if (!winner) continue
          const wnL = winner.team.displayName.toLowerCase()
          const pickL = (pick.team || '').toLowerCase()
          const pickLast = pickL.split(' ').pop()
          const won = wnL.includes(pickL) || pickL.includes(wnL) ||
                      (pickLast.length > 3 && wnL.includes(pickLast))
          dogState.picks[date].result = won ? 'W' : 'L'
          dogChanged = true
        } catch(e) {}
      }
      if (dogChanged) await saveDogStateServer(dogState)

      // Resolve any unresolved O/U picks
      let ouChanged = false
      for (const [date, entry] of Object.entries(ouHist)) {
        if (!entry || entry.result != null) continue
        const lockPick = appState.picks?.[date]
        if (!lockPick?.home || !lockPick?.sport) continue
        try {
          const events = await fetchEspnDate(lockPick.sport, date.replace(/-/g, ''))
          const homeLower = (lockPick.home || '').toLowerCase()
          const homeLast = homeLower.split(' ').pop()
          const event = events.find(e =>
            (e.competitions?.[0]?.competitors || []).some(c => {
              const dn = c.team.displayName.toLowerCase()
              return homeLower.includes(dn) || dn.includes(homeLower) ||
                     (homeLast.length > 3 && dn.includes(homeLast))
            })
          )
          if (!event) continue
          const comp = event.competitions?.[0]
          if (!comp?.status?.type?.completed) continue
          const scores = comp.competitors?.map(c => parseFloat(c.score)).filter(s => !isNaN(s))
          if (scores.length < 2) continue
          const total = scores.reduce((a, b) => a + b, 0)
          if (total > entry.point) ouHist[date].result = entry.name === 'Over' ? 'W' : 'L'
          else if (total < entry.point) ouHist[date].result = entry.name === 'Under' ? 'W' : 'L'
          else ouHist[date].result = 'L' // push = loss
          ouChanged = true
        } catch(e) {}
      }
      if (ouChanged) await saveOuPick(ouHist)

      // Resolve any unresolved lay legs
      let layChanged = false
      for (const [date, entry] of Object.entries(layHist)) {
        if (!entry?.legs) continue
        const legsWithTeam = entry.legs.filter(l => l.team)
        if (legsWithTeam.every(l => l.result !== null) && entry.overallResult) continue
        for (let i = 0; i < entry.legs.length; i++) {
          const leg = entry.legs[i]
          if (leg.result !== null || !leg.team || !leg.sport) continue
          try {
            const events = await fetchEspnDate(leg.sport, date.replace(/-/g, ''))
            const homeLower = leg.home?.toLowerCase() || ''
            const homeLast  = homeLower.split(' ').pop()
            const event = events.find(e =>
              (e.competitions?.[0]?.competitors || []).some(c => {
                const dn = c.team.displayName.toLowerCase()
                return homeLower.includes(dn) || dn.includes(homeLower) ||
                       (homeLast.length > 3 && dn.includes(homeLast))
              })
            )
            if (!event) continue
            const comp = event.competitions?.[0]
            if (!comp?.status?.type?.completed) continue

            // Spread picks: check coverage, not just winner
            let won
            if (leg.market === 'spreads' && leg.point != null) {
              const competitors = comp.competitors || []
              const legTeamL = leg.team.toLowerCase()
              const legLastWord = legTeamL.split(' ').pop()
              const pickedComp = competitors.find(c => {
                const dn = c.team.displayName.toLowerCase()
                const sn = c.team.shortDisplayName?.toLowerCase() || ''
                return dn.includes(legTeamL) || legTeamL.includes(dn) ||
                       (legLastWord.length > 3 && (dn.includes(legLastWord) || sn.includes(legLastWord)))
              })
              if (!pickedComp) continue
              const oppComp = competitors.find(c => c.id !== pickedComp.id)
              const pickedScore = parseFloat(pickedComp.score)
              const oppScore    = parseFloat(oppComp?.score ?? 0)
              if (isNaN(pickedScore)) continue
              won = (pickedScore - oppScore + leg.point) > 0
            } else {
              const winner = comp.competitors?.find(c => c.winner)
              if (!winner) continue
              const winnerName = winner.team.displayName.toLowerCase()
              const legTeam = leg.team.toLowerCase()
              const legLast = legTeam.split(' ').pop()
              won = winnerName.includes(legTeam) || legTeam.includes(winnerName) ||
                    (legLast.length > 3 && winnerName.includes(legLast))
            }
            layHist[date].legs[i].result = won ? 'W' : 'L'
            layChanged = true
          } catch(e) {}
        }
        const resolved = legsWithTeam.filter(l => l.result !== null)
        if (resolved.length === legsWithTeam.length && legsWithTeam.length > 0 && !layHist[date].overallResult) {
          const hits = resolved.filter(l => l.result === 'W').length
          layHist[date].overallResult = hits / resolved.length >= 0.7 ? 'W' : 'L'
          layHist[date].hitCount = hits
          layHist[date].totalCount = resolved.length
          layChanged = true
        }
      }
      if (layChanged) await saveLayHistory(layHist)

      // Resolve any unresolved prediction legs
      let predChanged = false
      for (const [date, entry] of Object.entries(predHist)) {
        if (!entry?.legs) continue
        const legsWithTeam = entry.legs.filter(l => l.team)
        if (legsWithTeam.every(l => l.result !== null) && entry.overallResult) continue
        for (let i = 0; i < entry.legs.length; i++) {
          const leg = entry.legs[i]
          if (leg.result !== null || !leg.team || !leg.sport) continue
          try {
            const events = await fetchEspnDate(leg.sport, date.replace(/-/g, ''))
            const homeLower = leg.home?.toLowerCase() || ''
            const homeLast  = homeLower.split(' ').pop()
            const event = events.find(e =>
              (e.competitions?.[0]?.competitors || []).some(c => {
                const dn = c.team.displayName.toLowerCase()
                return homeLower.includes(dn) || dn.includes(homeLower) ||
                       (homeLast.length > 3 && dn.includes(homeLast))
              })
            )
            if (!event) continue
            const comp = event.competitions?.[0]
            if (!comp?.status?.type?.completed) continue

            // Spread picks: check coverage, not just winner
            let won
            if (leg.market === 'spreads' && leg.point != null) {
              const competitors = comp.competitors || []
              const legTeamL = leg.team.toLowerCase()
              const legLastWord = legTeamL.split(' ').pop()
              const pickedComp = competitors.find(c => {
                const dn = c.team.displayName.toLowerCase()
                const sn = c.team.shortDisplayName?.toLowerCase() || ''
                return dn.includes(legTeamL) || legTeamL.includes(dn) ||
                       (legLastWord.length > 3 && (dn.includes(legLastWord) || sn.includes(legLastWord)))
              })
              if (!pickedComp) continue
              const oppComp = competitors.find(c => c.id !== pickedComp.id)
              const pickedScore = parseFloat(pickedComp.score)
              const oppScore    = parseFloat(oppComp?.score ?? 0)
              if (isNaN(pickedScore)) continue
              won = (pickedScore - oppScore + leg.point) > 0
            } else {
              const winner = comp.competitors?.find(c => c.winner)
              if (!winner) continue
              const winnerName = winner.team.displayName.toLowerCase()
              const legTeam = leg.team.toLowerCase()
              const legLast = legTeam.split(' ').pop()
              won = winnerName.includes(legTeam) || legTeam.includes(winnerName) ||
                    (legLast.length > 3 && winnerName.includes(legLast))
            }
            predHist[date].legs[i].result = won ? 'W' : 'L'
            predChanged = true
          } catch(e) {}
        }
        // Only count legs that have a team pick (skip team=null legs)
        const resolved = legsWithTeam.filter(l => l.result !== null)
        if (resolved.length === legsWithTeam.length && legsWithTeam.length > 0 && !predHist[date].overallResult) {
          const hits = resolved.filter(l => l.result === 'W').length
          predHist[date].overallResult = hits / resolved.length >= 0.7 ? 'W' : 'L'
          predHist[date].hitCount = hits
          predHist[date].totalCount = resolved.length
          predChanged = true
        }
      }
      if (predChanged) await savePredictions(predHist)

      setAllData({ appState, dogState, layHist, predHist, ouHist, propHist })
      const allDays = new Set([
        ...Object.keys(appState.picks || {}),
        ...Object.keys(dogState.picks || {}),
        ...Object.keys(layHist),
        ...Object.keys(predHist),
        ...Object.keys(ouHist),
        ...Object.keys(propHist),
      ])
      const past = [...allDays].filter(k => k < today).sort((a, b) => b.localeCompare(a))
      if (past.length > 0) setSelectedKey(past[0])
      setLoading(false)
    }
    load()
  }, [])

  // Fetch game scores whenever the selected day changes
  useEffect(() => {
    if (!selectedKey || !allData) return
    const { appState, dogState, layHist, predHist, propHist } = allData
    const toFetch = [] // { sport, gameId }

    const collect = (pick) => {
      if (pick?.gameId && pick?.sport) toFetch.push({ sport: pick.sport, gameId: pick.gameId })
    }
    collect(appState.picks?.[selectedKey])
    collect(dogState.picks?.[selectedKey])
    ;(layHist[selectedKey]?.legs || []).forEach(collect)
    ;(predHist[selectedKey]?.legs || []).forEach(collect)
    const propDay = propHist[selectedKey] || {}
    Object.values(propDay).forEach(v => { if (v?.gameId) collect(v) })

    const unique = [...new Map(toFetch.map(x => [x.gameId, x])).values()]
    if (unique.length === 0) return

    Promise.all(unique.map(({ sport, gameId }) =>
      fetchGameScore(sport, gameId).then(data => ({ gameId, data }))
    )).then(results => {
      setGameScores(prev => {
        const next = { ...prev }
        results.forEach(({ gameId, data }) => { if (data) next[gameId] = data })
        return next
      })
    })
  }, [selectedKey, allData])

  if (loading) return <p style={{ color: '#555', fontSize: '0.85rem' }}>Loading history...</p>

  const today = getTodayKey()
  const { appState, dogState, layHist, predHist, ouHist, propHist } = allData

  const allDays = new Set([
    ...Object.keys(appState.picks || {}),
    ...Object.keys(dogState.picks || {}),
    ...Object.keys(layHist),
    ...Object.keys(predHist),
    ...Object.keys(ouHist),
    ...Object.keys(propHist),
  ])
  const pastDays = [...allDays].filter(k => k < today).sort((a, b) => b.localeCompare(a))

  if (pastDays.length === 0) {
    return (
      <div>
        <h2 style={{ margin: '0 0 0.3rem', fontSize: '1rem', color: '#aaa' }}>📋 PAST LAYS</h2>
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.5rem', textAlign: 'center', marginTop: '1rem' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🎯</div>
          <div style={{ color: '#555', fontSize: '0.85rem' }}>No past picks yet. History shows up here after your first day.</div>
        </div>
      </div>
    )
  }

  const lockDays = pastDays.filter(k => appState.picks?.[k]?.result)
  const lockW = lockDays.filter(k => appState.picks[k].result === 'W').length
  const lockL = lockDays.filter(k => appState.picks[k].result === 'L').length
  const layDays = pastDays.filter(k => layHist[k]?.overallResult)
  const layW = layDays.filter(k => layHist[k].overallResult === 'W').length
  const layL = layDays.filter(k => layHist[k].overallResult === 'L').length

  const key = selectedKey || pastDays[0]
  const lock = appState.picks?.[key] || null
  const dog  = dogState.picks?.[key] || null
  const ou   = ouHist[key] || null
  const pred = predHist[key] || null
  const lay  = layHist[key] || null
  const prop = propHist[key] || null

  const propEntries = prop
    ? Object.entries(prop).filter(([, v]) => typeof v === 'object' && v !== null && v.player)
    : []

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: '0 0 0.3rem', fontSize: '1rem', color: '#aaa' }}>📋 PAST LAYS</h2>
        <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>Every pick, every day — see what hit and what didn't.</p>
      </div>

      {/* Record pills */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {(lockW + lockL) > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.45rem 0.85rem', fontSize: '0.78rem' }}>
            <span style={{ color: '#555' }}>🔒 Lock</span>
            <span style={{ color: W_COLOR, fontWeight: 'bold' }}>{lockW}W</span>
            <span style={{ color: '#333' }}>–</span>
            <span style={{ color: L_COLOR, fontWeight: 'bold' }}>{lockL}L</span>
            <span style={{ color: lockW >= lockL ? W_COLOR : L_COLOR, fontWeight: 'bold' }}>{Math.round(lockW / (lockW + lockL) * 100)}%</span>
          </div>
        )}
        {(layW + layL) > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.45rem 0.85rem', fontSize: '0.78rem' }}>
            <span style={{ color: '#555' }}>🎯 Lay</span>
            <span style={{ color: W_COLOR, fontWeight: 'bold' }}>{layW}W</span>
            <span style={{ color: '#333' }}>–</span>
            <span style={{ color: L_COLOR, fontWeight: 'bold' }}>{layL}L</span>
            <span style={{ color: layW >= layL ? W_COLOR : L_COLOR, fontWeight: 'bold' }}>{Math.round(layW / (layW + layL) * 100)}%</span>
          </div>
        )}
      </div>

      {/* Day selector */}
      <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>
        {pastDays.map(dk => {
          const result = layHist[dk]?.overallResult || appState.picks?.[dk]?.result || null
          const isSelected = dk === key
          return (
            <button key={dk} onClick={() => setSelectedKey(dk)} style={{
              flexShrink: 0, padding: '0.4rem 0.8rem', borderRadius: '8px',
              cursor: 'pointer', fontWeight: 'bold', fontSize: '0.75rem',
              background: isSelected ? (result === 'W' ? '#0a2a1a' : result === 'L' ? '#2a0a0a' : '#222') : '#111',
              border: `1px solid ${isSelected ? (result === 'W' ? '#00ff8866' : result === 'L' ? '#ff444466' : '#444') : '#222'}`,
              color: isSelected ? (result === 'W' ? W_COLOR : result === 'L' ? L_COLOR : '#fff') : (result === 'W' ? '#00ff8855' : result === 'L' ? '#ff444455' : '#333'),
            }}>
              {fmtDateLabel(dk)}{result === 'W' ? ' ✅' : result === 'L' ? ' ❌' : ''}
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: '0.88rem', fontWeight: 'bold', color: '#555', marginBottom: '0.85rem' }}>
        {fmtDateLabel(key)}
      </div>

      {/* 1. Lock */}
      {lock && (() => {
        const gs = gameScores[lock.gameId]
        let scoreInfo = null
        if (gs?.score) {
          const entries = Object.entries(gs.score)
          if (entries.length >= 2) {
            const home = entries.find(([n]) => n.toLowerCase().includes((lock.home || '').toLowerCase().split(' ').pop())) || entries[0]
            const away = entries.find(([n]) => n !== home?.[0]) || entries[1]
            scoreInfo = `Final: ${away?.[0]?.split(' ').pop() || '?'} ${away?.[1]} – ${home?.[0]?.split(' ').pop() || '?'} ${home?.[1]}`
          }
        }
        return (
          <Section emoji="🔒" title="Lock of the Day" accent="#00ff88" badge={resultBadge(lock.result, null, null)}>
            <LegRow
              label={`${lock.sport} · ${lock.market === 'h2h' ? 'MONEYLINE' : `SPREAD ${lock.point > 0 ? '+' : ''}${lock.point}`}`}
              labelColor="#00ff88" team={lock.team}
              sub={`${lock.away} vs ${lock.home}`}
              result={lock.result} odds={lock.odds} scoreInfo={scoreInfo}
            />
            {lock.odds != null && <TotalOddsRow legs={[lock]} label="SLIP ODDS" />}
            {lock.stake != null && (
              <div style={{ fontSize: '0.72rem', color: '#333', marginTop: '0.15rem' }}>
                Stake 🪙{lock.stake}
                {lock.result === 'W' && lock.profit != null && <span style={{ color: W_COLOR, marginLeft: '0.5rem' }}>+🪙{lock.profit.toFixed(2)}</span>}
              </div>
            )}
          </Section>
        )
      })()}

      {/* 2. Dog */}
      {dog && (() => {
        const gs = gameScores[dog.gameId]
        let scoreInfo = null
        if (gs?.score) {
          const entries = Object.entries(gs.score)
          if (entries.length >= 2) {
            const home = entries.find(([n]) => n.toLowerCase().includes((dog.home || '').toLowerCase().split(' ').pop())) || entries[0]
            const away = entries.find(([n]) => n !== home?.[0]) || entries[1]
            scoreInfo = `Final: ${away?.[0]?.split(' ').pop() || '?'} ${away?.[1]} – ${home?.[0]?.split(' ').pop() || '?'} ${home?.[1]}`
          }
        }
        return (
          <Section emoji="🐕" title="Dog of the Day" accent="#ff9944" badge={resultBadge(dog.result, null, null)}>
            <LegRow
              label={`${dog.sport} · UNDERDOG ML`} labelColor="#ff9944"
              team={dog.team} sub={`${dog.away} vs ${dog.home}`}
              result={dog.result} odds={dog.odds} scoreInfo={scoreInfo}
            />
            {dog.odds != null && <TotalOddsRow legs={[dog]} label="SLIP ODDS" />}
          </Section>
        )
      })()}

      {/* 3. Double Lock */}
      {ou && lock && (() => {
        const gs = gameScores[lock.gameId]
        let scoreInfo = null
        if (gs?.score) {
          const entries = Object.entries(gs.score)
          if (entries.length >= 2) {
            const home = entries.find(([n]) => n.toLowerCase().includes((lock.home || '').toLowerCase().split(' ').pop())) || entries[0]
            const away = entries.find(([n]) => n !== home?.[0]) || entries[1]
            const total = entries.reduce((s, [, v]) => s + (parseFloat(v) || 0), 0)
            scoreInfo = `Final: ${away?.[0]?.split(' ').pop()} ${away?.[1]} – ${home?.[0]?.split(' ').pop()} ${home?.[1]} · Total ${total}`
          }
        }
        return (
          <Section emoji="🔒🔒" title="Double Lock — O/U" accent="#00ff88"
            badge={ou.result ? resultBadge(ou.result, null, null) : null}>
            <LegRow label="LEG 1 · LOCK" labelColor="#00ff88" team={lock.team}
              sub={lock.market === 'h2h' ? 'Moneyline' : `Spread ${lock.point > 0 ? '+' : ''}${lock.point}`}
              result={lock.result} odds={lock.odds} scoreInfo={scoreInfo} />
            <LegRow label="LEG 2 · O/U" labelColor="#8888ff"
              team={`${ou.name} ${ou.point}`}
              sub={`${lock.away} vs ${lock.home} — Total`}
              result={ou.result ?? null} odds={ou.odds}
              scoreInfo={scoreInfo ? `Total: ${Object.values(gs?.score || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)} · line ${ou.point}` : null} />
            <TotalOddsRow legs={[lock, ou].filter(l => l?.odds != null)} label="PARLAY TOTAL" />
          </Section>
        )
      })()}

      {/* 4. Predictions */}
      {pred?.legs?.length > 0 && (() => {
        const renderedLegs = pred.legs.filter(l => l.team)
        return (
          <Section emoji="🔮" title="Predictions" accent="#8888ff"
            badge={pred.overallResult ? resultBadge(pred.overallResult, pred.hitCount, pred.totalCount) : null}>
            {renderedLegs.reduce((acc, leg, i) => {
              if (!leg.isLock && !leg.isDog) acc.n++
              const n = acc.n
              const gs = gameScores[leg.gameId]
              let scoreInfo = null
              if (gs?.score) {
                const entries = Object.entries(gs.score)
                if (entries.length >= 2) {
                  const home = entries.find(([nm]) => nm.toLowerCase().includes((leg.home || '').toLowerCase().split(' ').pop())) || entries[0]
                  const away = entries.find(([nm]) => nm !== home?.[0]) || entries[1]
                  scoreInfo = `Final: ${away?.[0]?.split(' ').pop()} ${away?.[1]} – ${home?.[0]?.split(' ').pop()} ${home?.[1]}`
                }
              }
              acc.els.push(
                <LegRow key={leg.gameId || i}
                  label={leg.isLock ? '🔒 LOCK' : leg.isDog ? '🐕 DOG' : `LEG ${n}`}
                  labelColor={leg.isLock ? '#00ff88' : leg.isDog ? '#ff9944' : '#8888ff'}
                  team={leg.team} sub={`${leg.away} vs ${leg.home} · ${leg.sport}`}
                  result={leg.result} odds={leg.odds ?? null} scoreInfo={scoreInfo} />
              )
              return acc
            }, { n: 0, els: [] }).els}
            <TotalOddsRow legs={renderedLegs} label="PARLAY TOTAL" />
          </Section>
        )
      })()}

      {/* 5. Lay of the Day */}
      {lay?.legs?.length > 0 && (() => {
        const layLegs = lay.legs
        return (
          <Section emoji="🎯" title="Lay of the Day" accent="#8888ff"
            badge={lay.overallResult ? resultBadge(lay.overallResult, lay.hitCount, lay.totalCount) : null}>
            {layLegs.reduce((acc, leg, i) => {
              if (!leg.isLock && !leg.isDog) acc.n++
              const n = acc.n
              const gs = gameScores[leg.gameId]
              let scoreInfo = null
              if (gs?.score) {
                const entries = Object.entries(gs.score)
                if (entries.length >= 2) {
                  const home = entries.find(([nm]) => nm.toLowerCase().includes((leg.home || '').toLowerCase().split(' ').pop())) || entries[0]
                  const away = entries.find(([nm]) => nm !== home?.[0]) || entries[1]
                  scoreInfo = `Final: ${away?.[0]?.split(' ').pop()} ${away?.[1]} – ${home?.[0]?.split(' ').pop()} ${home?.[1]}`
                }
              }
              acc.els.push(
                <LegRow key={leg.gameId || i}
                  label={leg.isLock ? '🔒 LOCK' : leg.isDog ? '🐕 DOG' : `LEG ${n}`}
                  labelColor={leg.isLock ? '#00ff88' : leg.isDog ? '#ff9944' : '#8888ff'}
                  team={leg.team || '—'} sub={`${leg.away} vs ${leg.home} · ${leg.sport}`}
                  result={leg.result} odds={leg.odds ?? null} scoreInfo={scoreInfo} />
              )
              return acc
            }, { n: 0, els: [] }).els}
            <TotalOddsRow legs={layLegs} label="PARLAY TOTAL" />
          </Section>
        )
      })()}

      {/* 6. Prop */}
      {propEntries.length > 0 && (
        <Section emoji="🎲" title="Prop Pick" accent="#ffdd44">
          {propEntries.map(([teamKey, pick], i) => {
            const gs = gameScores[pick.gameId]
            let scoreInfo = null
            if (gs?.playerStats && pick.player) {
              const pStats = gs.playerStats[pick.player]
              if (pStats) {
                const statDef = PROP_STAT_MAP[pick.marketKey] || { label: pick.marketKey, espnKeys: [] }
                const statVal = statDef.espnKeys.map(k => pStats[k]).find(v => v != null)
                if (statVal != null) {
                  const actual = parseFloat(statVal)
                  const line = parseFloat(pick.line)
                  const hit = pick.side === 'over' ? actual > line : actual < line
                  scoreInfo = `${pick.player}: ${statVal} ${statDef.label} · line ${pick.line} · ${hit ? 'HIT' : 'MISS'}`
                }
              }
            }
            return (
              <LegRow key={i}
                label={`${pick.sport} · ${(pick.label || 'PROP').toUpperCase()} · ${(pick.side || '').toUpperCase()}`}
                labelColor="#ffdd44"
                team={`${pick.player} ${pick.side === 'over' ? '⬆' : '⬇'} ${pick.line}`}
                sub={`${pick.team || teamKey}`}
                result={pick.result} odds={pick.odds} scoreInfo={scoreInfo} />
            )
          })}
        </Section>
      )}

      {!lock && !dog && !ou && !pred && !lay && propEntries.length === 0 && (
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.25rem', color: '#444', fontSize: '0.85rem', textAlign: 'center' }}>
          No picks recorded for {fmtDateLabel(key)}.
        </div>
      )}
    </div>
  )
}