import React, { useState, useEffect } from 'react'
import { loadLayHistory, saveLayHistory, loadPredictions, savePredictions, loadState, saveState, loadDogState, saveDogStateServer, loadOuPick, saveOuPick, loadPropPick, fetchEspnDate, loadAllData } from '../hooks/useSaveData.js'
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

export default function PastLayTab({ todayLock, onRefresh }) {
  const [allData, setAllData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshed, setRefreshed] = useState(false)
  const [selectedKey, setSelectedKey] = useState(null)
  const [gameScores, setGameScores] = useState({}) // gameId -> { score, playerStats }
  const [showLayPopup, setShowLayPopup] = useState(false)
  const [showPastSlip, setShowPastSlip] = useState(null) // { dateKey, lay, lock }
  const [todayLayData, setTodayLayData] = useState(null)

  async function load() {
      setLoading(true)
      const [appState, dogState, layHist, predHist, ouHist, propHist, allServerData] = await Promise.all([
        loadState(), loadDogState(), loadLayHistory(), loadPredictions(), loadOuPick(), loadPropPick(), loadAllData(),
      ])
      const allInHist = allServerData?.allIn || {}

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

      setAllData({ appState, dogState, layHist, predHist, ouHist, propHist, allInHist })

      // Also load today's lay for popup
      const todayKey = getTodayKey()
      const todayLay = layHist[todayKey] || null
      setTodayLayData(todayLay)

      const allDays = new Set([
        ...Object.keys(appState.picks || {}),
        ...Object.keys(dogState.picks || {}),
        ...Object.keys(layHist),
        ...Object.keys(predHist),
        ...Object.keys(ouHist),
        ...Object.keys(propHist),
      ])
      // Always show the last 7 days in the selector even if no picks were made
      const todayDateObj = new Date(todayKey + 'T12:00:00')
      for (let i = 1; i <= 7; i++) {
        const d = new Date(todayDateObj)
        d.setDate(d.getDate() - i)
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        allDays.add(`${yyyy}-${mm}-${dd}`)
      }
      const past = [...allDays].filter(k => k < todayKey).sort((a, b) => b.localeCompare(a))
      if (past.length > 0) setSelectedKey(past[0])
      setLoading(false)
      setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  async function handleRefresh() {
    setRefreshing(true)
    setRefreshed(false)
    if (onRefresh) onRefresh()
    await load()
    setRefreshed(true)
    setTimeout(() => setRefreshed(false), 2000)
  }

  // Fetch game scores whenever the selected day changes
  useEffect(() => {
    if (!selectedKey || !allData) return
    const { appState, dogState, layHist, predHist, propHist, allInHist } = allData
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
  const { appState, dogState, layHist, predHist, ouHist, propHist, allInHist } = allData

  const allDays = new Set([
    ...Object.keys(appState.picks || {}),
    ...Object.keys(dogState.picks || {}),
    ...Object.keys(layHist),
    ...Object.keys(predHist),
    ...Object.keys(ouHist),
    ...Object.keys(propHist),
  ])
  // Fill in the last 7 days so recent days with no picks still appear in the selector
  // This ensures yesterday (and up to 6 days back) always shows up
  const todayDate = new Date(today + 'T12:00:00')
  for (let i = 1; i <= 7; i++) {
    const d = new Date(todayDate)
    d.setDate(d.getDate() - i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    allDays.add(`${yyyy}-${mm}-${dd}`)
  }
  const pastDays = [...allDays].filter(k => k < today).sort((a, b) => b.localeCompare(a))

  if (pastDays.length === 0) {
    return (
      <div>
        {showLayPopup && (
          <LayOfDayPopup lay={todayLayData} lock={todayLock} onClose={() => setShowLayPopup(false)} />
        )}
        <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: '0 0 0.3rem', fontSize: '1rem', color: '#aaa' }}>📋 PAST LAYS</h2>
          </div>
          <button onClick={handleRefresh} disabled={refreshing} style={{ fontSize: '0.62rem', padding: '0.28rem 0.65rem', background: 'transparent', border: '1px solid #252525', borderRadius: '5px', color: '#444', cursor: 'pointer' }}>
            {refreshing ? '↺ …' : '↺ Refresh'}
          </button>
        </div>
        <button onClick={() => setShowLayPopup(true)} style={{ width: '100%', background: '#111', border: '1px solid #00ff8822', borderRadius: '14px', padding: '0.9rem 1.25rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '0.6rem', color: '#00ff8866', fontWeight: 'bold', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>TODAY'S SLIP</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#fff' }}>🎯 Lay of the Day</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #0a2a1a 0%, #062010 100%)', border: '1px solid #00ff8844', borderRadius: '10px', padding: '0.5rem 1rem', fontSize: '0.72rem', fontWeight: 'bold', color: '#00ff88', display: 'flex', alignItems: 'center', gap: '0.3rem', boxShadow: '0 0 12px rgba(0,255,136,0.08)', letterSpacing: '0.03em' }}>View Slip <span style={{ fontSize: '0.85rem' }}>›</span></div>
        </button>
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
  const allIn = allInHist?.[key] || null

  const propEntries = prop
    ? Object.entries(prop).filter(([, v]) => typeof v === 'object' && v !== null && v.player)
    : []

  // ── DK-Style Bet Slip Modal ────────────────────────────────────────────────
  function BetSlipModal({ dateKey, lay, lock, allIn, onClose }) {
    const isToday = dateKey === getTodayKey()
    const hasLay = lay?.legs?.length > 0
    const hasLock = !!lock

    // Combine all legs: lock first, then lay legs (excluding isLock duplicate)
    const allLegs = []
    if (hasLock) {
      allLegs.push({
        ...lock,
        isLock: true, isDog: false,
        label: lock.team,
        marketLabel: lock.market === 'h2h' ? 'Moneyline' : `Spread ${lock.point > 0 ? '+' : ''}${lock.point}`,
        accentColor: '#00ff88',
        tag: '🔒 LOCK',
      })
    }
    if (hasLay) {
      let nonAutoIdx = 0
      lay.legs.filter(l => !l.isLock).forEach((leg) => {
        const isDog = leg.isDog
        const isSuperDog = leg.isSuperDog
        const isFav = leg.isFav
        const isHate = leg.isHate
        const isAuto = isDog || isSuperDog || isFav || isHate
        if (!isAuto) nonAutoIdx++
        allLegs.push({
          ...leg,
          label: leg.team || '—',
          marketLabel: leg.market === 'spreads' && leg.point != null
            ? `Spread ${leg.point > 0 ? '+' : ''}${leg.point}`
            : 'Moneyline',
          accentColor: isDog ? '#ff9944' : isSuperDog ? '#b44fff' : isFav ? '#4c9be8' : isHate ? '#ff4466' : '#8888ff',
          tag: isDog ? '🐕 DOG' : isSuperDog ? '⚡ SUPER' : isFav ? '⭐ FAV' : isHate ? '😤 HATE' : `LEG ${nonAutoIdx}`,
        })
      })
    }

    // Overall result
    const resolved = allLegs.filter(l => l.result !== null)
    const wins = resolved.filter(l => l.result === 'W').length
    const hasResult = hasLay && lay.overallResult
    const slipResult = hasResult ? lay.overallResult : null
    const pending = allLegs.some(l => l.result === null)
    const slipColor = slipResult === 'W' ? '#00ff88' : slipResult === 'L' ? '#ff4444' : '#8888ff'
    const slipGlow = slipResult === 'W' ? 'rgba(0,255,136,0.15)' : slipResult === 'L' ? 'rgba(255,68,68,0.12)' : 'rgba(136,136,255,0.08)'

    // Parlay odds
    const legsForOdds = allLegs.filter(l => l.odds != null)
    const totalOdds = legsForOdds.length >= 2 ? calcTotalOdds(legsForOdds) : legsForOdds[0]?.odds ?? null
    const fmtOdds = (o) => o == null ? '—' : o > 0 ? `+${o}` : `${o}`
    const payoutMultiplier = totalOdds != null
      ? totalOdds > 0 ? (1 + totalOdds / 100).toFixed(2) : (1 + 100 / Math.abs(totalOdds)).toFixed(2)
      : null

    const statusLabel = slipResult === 'W' ? '🎉 PARLAY WIN' : slipResult === 'L' ? '❌ PARLAY LOSS' : pending ? '⏳ IN PROGRESS' : '📋 SLIP'

    return (
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden',
            background: '#0a0a0a',
            borderRadius: '20px',
            boxShadow: `0 0 80px ${slipGlow}, 0 24px 60px rgba(0,0,0,0.9)`,
            border: `1px solid ${slipColor}33`,
          }}
        >

          {/* Header */}
          <div style={{
            padding: '1rem 1.4rem 0.85rem',
            borderBottom: `1px solid ${slipColor}22`,
            background: `linear-gradient(180deg, #111 0%, #0d0d0d 100%)`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.55rem', color: '#666', fontWeight: 'bold', letterSpacing: '0.14em', marginBottom: '0.3rem', textTransform: 'uppercase' }}>
                  {isToday ? "TODAY'S SLIP" : fmtDateLabel(dateKey)}
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#fff', marginBottom: '0.25rem' }}>
                  🎯 Lay of the Day
                </div>
                <div style={{ fontSize: '0.7rem', color: '#555' }}>
                  {allLegs.length}-Leg Parlay
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                <button onClick={onClose} style={{
                  background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '50%',
                  width: '32px', height: '32px', color: '#888', cursor: 'pointer',
                  fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>✕</button>
                {allLegs.length > 0 && (
                  <div style={{
                    background: `${slipColor}18`,
                    border: `1px solid ${slipColor}44`,
                    borderRadius: '8px', padding: '0.28rem 0.75rem',
                    fontSize: '0.68rem', fontWeight: 'bold', color: slipColor,
                    letterSpacing: '0.02em',
                  }}>
                    {statusLabel}
                    {slipResult && ` · ${wins}/${resolved.length}`}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* No picks state */}
          {allLegs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
              <div style={{ color: '#555', fontSize: '0.88rem' }}>{isToday ? 'No picks set yet today.' : 'No picks on this day.'}</div>
            </div>
          )}

          {/* Legs */}
          {allLegs.length > 0 && (
            <div style={{ padding: '0 1.25rem' }}>
              {allLegs.map((leg, idx) => {
                const legColor = leg.accentColor
                const resultIcon = leg.result === 'W' ? '✅' : leg.result === 'L' ? '❌' : '⏳'
                const isLast = idx === allLegs.length - 1
                const legBg = leg.result === 'W' ? '#0a1a0f' : leg.result === 'L' ? '#1a0a0a' : 'transparent'
                return (
                  <div key={idx} style={{
                    padding: '1rem 0',
                    borderBottom: isLast ? 'none' : `1px solid #1e1e1e`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.85rem',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Tag + sport row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '0.58rem', fontWeight: 'bold', letterSpacing: '0.07em',
                          color: legColor, background: `${legColor}18`,
                          border: `1px solid ${legColor}40`, padding: '0.12rem 0.5rem', borderRadius: '4px',
                        }}>{leg.tag}</span>
                        <span style={{ fontSize: '0.58rem', color: '#444', letterSpacing: '0.05em' }}>{leg.sport}</span>
                      </div>
                      {/* Team name */}
                      <div style={{
                        fontWeight: 'bold', fontSize: '1rem',
                        color: leg.result === 'W' ? '#fff' : leg.result === 'L' ? '#777' : '#eee',
                        marginBottom: '0.18rem', lineHeight: 1.2,
                      }}>
                        {leg.label}
                      </div>
                      {/* Market label */}
                      <div style={{ fontSize: '0.7rem', color: '#555', marginBottom: '0.12rem' }}>{leg.marketLabel}</div>
                      {/* Matchup */}
                      {leg.away && leg.home && (
                        <div style={{ fontSize: '0.65rem', color: '#3a3a3a' }}>{leg.away} vs {leg.home}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, paddingTop: '0.2rem' }}>
                      {leg.odds != null && (
                        <div style={{
                          fontSize: '0.95rem', fontWeight: 'bold',
                          color: leg.odds > 0 ? '#ff9944' : '#00ff88',
                          marginBottom: '0.3rem',
                        }}>
                          {fmtOdds(leg.odds)}
                        </div>
                      )}
                      <div style={{ fontSize: '1.25rem' }}>{resultIcon}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Perforation line */}
          {totalOdds != null && allLegs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
              <div style={{ width: '12px', height: '24px', borderRadius: '0 12px 12px 0', background: '#000', flexShrink: 0 }} />
              <div style={{ flex: 1, borderTop: '2px dashed #2a2a2a' }} />
              <div style={{ width: '12px', height: '24px', borderRadius: '12px 0 0 12px', background: '#000', flexShrink: 0 }} />
            </div>
          )}

          {/* Odds + payout footer */}
          {totalOdds != null && allLegs.length >= 1 && (
            <div style={{ padding: '1rem 1.4rem 0.5rem', background: '#080808' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.55rem', color: '#444', letterSpacing: '0.1em', fontWeight: 'bold', marginBottom: '0.22rem' }}>PARLAY ODDS</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: totalOdds > 0 ? '#ff9944' : '#4c9be8', lineHeight: 1 }}>
                    {fmtOdds(totalOdds)}
                  </div>
                </div>
                {payoutMultiplier && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.55rem', color: '#444', letterSpacing: '0.1em', fontWeight: 'bold', marginBottom: '0.22rem' }}>🪙1 WINS</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#ccc', lineHeight: 1 }}>
                      {payoutMultiplier}x
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Result banner */}
          {slipResult && (
            <div style={{
              margin: '0.75rem 1.25rem',
              background: slipResult === 'W'
                ? 'linear-gradient(135deg, #0a2a1a 0%, #061a0f 100%)'
                : 'linear-gradient(135deg, #2a0a0a 0%, #1a0606 100%)',
              border: `1px solid ${slipColor}55`,
              borderRadius: '12px', padding: '1rem 1.1rem',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '0.58rem', color: slipColor, fontWeight: 'bold', letterSpacing: '0.1em', marginBottom: '0.25rem', opacity: 0.8 }}>FINAL RESULT</div>
                <div style={{ fontSize: '0.9rem', color: slipColor, fontWeight: 'bold' }}>
                  {wins}/{resolved.length} legs hit · {slipResult === 'W' ? 'Parlay WIN 🎉' : 'Parlay LOSS'}
                </div>
              </div>
              <div style={{ fontSize: '1.75rem' }}>{slipResult === 'W' ? '✅' : '❌'}</div>
            </div>
          )}

          {/* Locked stamp */}
          {!slipResult && allLegs.length > 0 && (
            <div style={{ textAlign: 'center', padding: '0.5rem 0 0.25rem', fontSize: '0.58rem', color: '#2a2a2a', letterSpacing: '0.1em' }}>
              ●●● LOCKED IN ●●●
            </div>
          )}

          {/* 🚀 All In Slip */}
          {allIn?.legs?.length > 0 && (
            <div style={{ borderTop: '1px solid #1e1e1e', marginTop: '0.5rem' }}>
              <div style={{ padding: '0.75rem 1.4rem 0.25rem', fontSize: '0.55rem', color: '#888', fontWeight: 'bold', letterSpacing: '0.14em' }}>
                🚀 ALL IN SLIP · {allIn.legs.length} LEG{allIn.legs.length !== 1 ? 'S' : ''}
              </div>
              {allIn.legs.map((leg, idx) => {
                const isLast = idx === allIn.legs.length - 1
                const resultIcon = leg.result === 'W' ? '✅' : leg.result === 'L' ? '❌' : '⏳'
                return (
                  <div key={idx} style={{
                    padding: '0.75rem 1.25rem',
                    borderBottom: isLast ? 'none' : '1px solid #1a1a1a',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.58rem', color: '#b44fff', fontWeight: 'bold', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>
                        🚀 ALL IN
                      </div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#eee', marginBottom: '0.15rem', lineHeight: 1.2 }}>
                        {leg.team || '—'}
                      </div>
                      {leg.away && leg.home && (
                        <div style={{ fontSize: '0.62rem', color: '#3a3a3a' }}>{leg.away} vs {leg.home}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {leg.odds != null && (
                        <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: leg.odds > 0 ? '#ff9944' : '#00ff88', marginBottom: '0.25rem' }}>
                          {fmtOdds(leg.odds)}
                        </div>
                      )}
                      <div style={{ fontSize: '1.1rem' }}>{resultIcon}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ height: '1.75rem' }} />
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Bet Slip Modal — today or selected past day */}
      {showLayPopup && (
        <BetSlipModal
          dateKey={getTodayKey()}
          lay={todayLayData}
          lock={todayLock}
          allIn={allInHist?.[getTodayKey()] || null}
          onClose={() => setShowLayPopup(false)}
        />
      )}
      {showPastSlip && (
        <BetSlipModal
          dateKey={showPastSlip.dateKey}
          lay={showPastSlip.lay}
          lock={showPastSlip.lock}
          allIn={allInHist?.[showPastSlip.dateKey] || null}
          onClose={() => setShowPastSlip(null)}
        />
      )}

      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: '0 0 0.3rem', fontSize: '1rem', color: '#aaa' }}>📋 PAST LAYS</h2>
          <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>Every pick, every day — see what hit and what didn't.</p>
        </div>
        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            fontSize: '0.62rem', padding: '0.28rem 0.65rem',
            background: refreshed ? '#0a2a1a' : 'transparent',
            border: `1px solid ${refreshed ? '#00ff8844' : '#252525'}`,
            borderRadius: '5px',
            color: refreshing ? '#333' : refreshed ? '#00ff88' : '#444',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
            flexShrink: 0,
          }}
        >
          {refreshing ? '↺ …' : refreshed ? '✓ Updated' : '↺ Refresh'}
        </button>
      </div>

      {/* Lay of the Day CTA button */}
      <button
        onClick={() => setShowLayPopup(true)}
        style={{
          width: '100%',
          background: 'linear-gradient(135deg, #111 0%, #0d1a0d 100%)',
          border: '1px solid #00ff8822',
          borderRadius: '14px',
          padding: '0.9rem 1.25rem',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
          transition: 'border-color 0.2s ease',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#00ff8844'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#00ff8822'}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '0.6rem', color: '#00ff8866', fontWeight: 'bold', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>TODAY'S SLIP</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#fff' }}>🎯 Lay of the Day</div>
          <div style={{ fontSize: '0.7rem', color: '#333', marginTop: '0.15rem' }}>
            {todayLock ? `🔒 ${todayLock.team?.split(' ').pop()} locked` : 'No lock set yet'}
            {todayLayData?.legs?.length > 0 ? ` · ${todayLayData.legs.filter(l => !l.isLock).length} lay leg${todayLayData.legs.filter(l => !l.isLock).length !== 1 ? 's' : ''}` : ''}
          </div>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, #0a2a1a 0%, #062010 100%)',
          border: '1px solid #00ff8844',
          borderRadius: '10px',
          padding: '0.5rem 1rem',
          fontSize: '0.72rem',
          fontWeight: 'bold',
          color: '#00ff88',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          boxShadow: '0 0 12px rgba(0,255,136,0.08)',
          letterSpacing: '0.03em',
        }}>
          View Slip <span style={{ fontSize: '0.85rem' }}>›</span>
        </div>
      </button>

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

      {/* Day selector — clean grid instead of horizontal scroll */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.6rem', color: '#333', letterSpacing: '0.1em', fontWeight: 'bold', marginBottom: '0.6rem' }}>SELECT DAY</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem' }}>
          {/* TODAY button */}
          {(() => {
            const dk = today
            const isSelected = dk === key
            const todayHasLock = !!(appState.picks?.[dk])
            const todayHasLay = !!(layHist[dk]?.legs?.length > 0)
            const todayHasDog = !!(dogState.picks?.[dk])
            const todayHasPred = !!(predHist[dk])
            const hasAnyPick = todayHasLock || todayHasLay || todayHasDog || todayHasPred
            return (
              <button key={dk} onClick={() => setSelectedKey(dk)} style={{
                padding: '0.45rem 0.3rem', borderRadius: '8px',
                cursor: 'pointer', fontWeight: isSelected ? 'bold' : 'normal',
                fontSize: '0.72rem', textAlign: 'center',
                background: isSelected ? '#1a1a0a' : '#111',
                border: `1px solid ${isSelected ? '#aaaa4466' : (hasAnyPick ? '#2a2a14' : '#1a1a14')}`,
                color: isSelected ? '#cccc44' : (hasAnyPick ? '#666633' : '#333322'),
                transition: 'all 0.12s',
              }}>
                <div style={{ fontSize: '0.48rem', color: isSelected ? '#aaaa44' : '#555533', marginBottom: '0.1rem', fontWeight: 'bold', letterSpacing: '0.06em' }}>TODAY</div>
                <div style={{ fontSize: '0.65rem' }}>{fmtDateLabel(dk).split(' ')[1]}</div>
                <div style={{ fontSize: '0.48rem', color: isSelected ? '#cccc44' : '#555533', marginTop: '0.1rem' }}>
                  {[todayHasLock && '🔒', todayHasLay && '🎯', todayHasDog && '🐕', todayHasPred && '🔮'].filter(Boolean).join(' ') || '—'}
                </div>
              </button>
            )
          })()}
          {pastDays.slice(0, 11).map(dk => {
            const result = layHist[dk]?.overallResult || appState.picks?.[dk]?.result || null
            const isSelected = dk === key
            const hasAnyPick = !!(appState.picks?.[dk] || dogState.picks?.[dk] || layHist[dk] || predHist[dk])
            return (
              <button key={dk} onClick={() => setSelectedKey(dk)} style={{
                padding: '0.45rem 0.3rem', borderRadius: '8px',
                cursor: 'pointer', fontWeight: isSelected ? 'bold' : 'normal',
                fontSize: '0.72rem', textAlign: 'center',
                background: isSelected
                  ? (result === 'W' ? '#0a2a1a' : result === 'L' ? '#2a0a0a' : '#1a1a2a')
                  : '#111',
                border: `1px solid ${isSelected
                  ? (result === 'W' ? '#00ff8866' : result === 'L' ? '#ff444466' : '#4444aa66')
                  : (hasAnyPick ? '#1e1e1e' : '#161616')}`,
                color: isSelected
                  ? (result === 'W' ? W_COLOR : result === 'L' ? L_COLOR : '#8888ff')
                  : (hasAnyPick ? '#444' : '#2a2a2a'),
                transition: 'all 0.12s',
              }}>
                <div style={{ fontSize: '0.58rem', color: isSelected ? 'inherit' : '#2a2a2a', marginBottom: '0.15rem', opacity: 0.7 }}>
                  {fmtDateLabel(dk).split(' ')[0]}
                </div>
                <div>{fmtDateLabel(dk).split(' ')[1]}</div>
                {result && <div style={{ fontSize: '0.65rem', marginTop: '0.1rem' }}>{result === 'W' ? '✅' : '❌'}</div>}
                {!result && hasAnyPick && <div style={{ fontSize: '0.55rem', color: '#2a2a2a', marginTop: '0.1rem' }}>·</div>}
              </button>
            )
          })}
        </div>
        {pastDays.length > 11 && (
          <div style={{ fontSize: '0.65rem', color: '#2a2a2a', textAlign: 'center', marginTop: '0.5rem' }}>
            Showing today + 11 most recent days
          </div>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        marginBottom: '1rem', padding: '0.6rem 1rem',
        background: key === today ? '#0d0d08' : '#0d0d0d',
        border: `1px solid ${key === today ? '#2a2a14' : '#1a1a1a'}`,
        borderRadius: '10px',
      }}>
        <div style={{ fontSize: '1.25rem' }}>📅</div>
        <div>
          <div style={{ fontSize: '0.58rem', color: key === today ? '#aaaa44' : '#333', letterSpacing: '0.1em', fontWeight: 'bold' }}>
            {key === today ? 'TODAY · IN PROGRESS' : 'VIEWING'}
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 'bold', color: key === today ? '#cccc66' : '#888' }}>{fmtDateLabel(key)}</div>
        </div>
        {(() => {
          const r = layHist[key]?.overallResult || appState.picks?.[key]?.result || null
          const hasSlipData = !!(layHist[key]?.legs?.length || appState.picks?.[key])
          return (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {hasSlipData && (
                <button
                  onClick={() => setShowPastSlip({ dateKey: key, lay: layHist[key] || null, lock: appState.picks?.[key] || null })}
                  style={{ fontSize: '0.65rem', padding: '0.28rem 0.65rem', background: '#0d0d1a', border: '1px solid #8888ff44', borderRadius: '6px', color: '#8888ff', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  🎯 Slip
                </button>
              )}
              {r && (
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', padding: '0.25rem 0.65rem', borderRadius: '6px', background: r === 'W' ? '#0a2a1a' : '#2a0a0a', border: `1px solid ${r === 'W' ? '#00ff8844' : '#ff444444'}`, color: r === 'W' ? W_COLOR : L_COLOR }}>
                  {r === 'W' ? '✅ W' : '❌ L'}
                </div>
              )}
            </div>
          )
        })()}
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
              if (!leg.isLock && !leg.isDog && !leg.isSuperDog && !leg.isFav && !leg.isHate) acc.n++
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
              const legLabel = leg.isLock ? '🔒 LOCK' : leg.isDog ? '🐕 DOG' : leg.isSuperDog ? '⚡ SUPER' : leg.isFav ? '⭐ FAV' : leg.isHate ? '😤 HATE' : `LEG ${n}`
              const legColor = leg.isLock ? '#00ff88' : leg.isDog ? '#ff9944' : leg.isSuperDog ? '#b44fff' : leg.isFav ? '#4c9be8' : leg.isHate ? '#ff4466' : '#8888ff'
              acc.els.push(
                <LegRow key={leg.gameId || i}
                  label={legLabel}
                  labelColor={legColor}
                  team={leg.team} sub={`${leg.away} vs ${leg.home} · ${leg.sport}`}
                  result={leg.result} odds={leg.odds ?? null} scoreInfo={scoreInfo} />
              )
              return acc
            }, { n: 0, els: [] }).els}
            <TotalOddsRow legs={renderedLegs} label="PARLAY TOTAL" />
          </Section>
        )
      })()}

      {/* 5. All In */}
      {allIn?.legs?.length > 0 && (() => {
        const allInW = allIn.legs.filter(l => l.result === 'W').length
        const allInResolved = allIn.legs.filter(l => l.result !== null).length
        const allInOverall = allInResolved === allIn.legs.length && allIn.legs.length > 0
          ? (allInW === allIn.legs.length ? 'W' : 'L') : null
        return (
          <Section emoji="🚀" title="All In" accent="#b44fff"
            badge={allInOverall ? resultBadge(allInOverall, allInW, allIn.legs.length) : null}>
            {allIn.legs.map((leg, i) => (
              <LegRow key={i}
                label={`${leg.sport || ''} · MONEYLINE`}
                labelColor="#b44fff"
                team={leg.team || '—'}
                sub={leg.away && leg.home ? `${leg.away} vs ${leg.home}` : ''}
                result={leg.result ?? null}
                odds={leg.odds}
              />
            ))}
          </Section>
        )
      })()}

      {/* 6. Lay of the Day */}
      {lay?.legs?.length > 0 && (() => {
        const layLegs = lay.legs
        return (
          <Section emoji="🎯" title="Lay of the Day" accent="#8888ff"
            badge={lay.overallResult ? resultBadge(lay.overallResult, lay.hitCount, lay.totalCount) : null}>
            {layLegs.reduce((acc, leg, i) => {
              if (!leg.isLock && !leg.isDog && !leg.isSuperDog && !leg.isFav && !leg.isHate) acc.n++
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
              const legLabel = leg.isLock ? '🔒 LOCK' : leg.isDog ? '🐕 DOG' : leg.isSuperDog ? '⚡ SUPER' : leg.isFav ? '⭐ FAV' : leg.isHate ? '😤 HATE' : `LEG ${n}`
              const legColor = leg.isLock ? '#00ff88' : leg.isDog ? '#ff9944' : leg.isSuperDog ? '#b44fff' : leg.isFav ? '#4c9be8' : leg.isHate ? '#ff4466' : '#8888ff'
              acc.els.push(
                <LegRow key={leg.gameId || i}
                  label={legLabel}
                  labelColor={legColor}
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
      {propEntries.length > 0 && (() => {
        const resolvedProps = propEntries.filter(([, p]) => p.result !== null)
        const propW = resolvedProps.filter(([, p]) => p.result === 'W').length
        const propL = resolvedProps.filter(([, p]) => p.result === 'L').length
        const propTotal = resolvedProps.length
        const propOverall = propTotal > 0 ? (propW / propTotal >= 0.5 ? 'W' : 'L') : null
        return (
        <Section emoji="🎲" title="Prop Pick" accent="#ffdd44"
          badge={propOverall ? resultBadge(propOverall, propW, propTotal) : null}>
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
        )
      })()}

      {!lock && !dog && !ou && !pred && !lay && propEntries.length === 0 && !allIn && (
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.25rem', color: '#444', fontSize: '0.85rem', textAlign: 'center' }}>
          No picks recorded for {fmtDateLabel(key)}.
        </div>
      )}
    </div>
  )
}