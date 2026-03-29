import React, { useState, useEffect } from 'react'
import { getTodayKey, ensureAmerican, formatOdds, combineParlayOdds, getGameDateLabel, calcPayout, fetchMlbProbablePitchers, getProbablePitcher } from '../utils/odds.js'
import { loadPredictions, savePredictions, loadLayHistory, saveLayHistory, loadOuPick, saveOuPick, fetchEspnDate, loadState, loadAllData, saveAllData } from '../hooks/useSaveData.js'
import ParlaySection from '../components/ParlaySection.jsx'
import SportFilter, { filterBySport } from '../components/SportFilter.jsx'

export default function ParlaysTab({ allGames, loading, todayLock, todayDog, onLockChange }) {
  const todayKey = getTodayKey()

  const [predictionsHistory, setPredictionsHistory] = useState({})
  const [layHistoryState, setLayHistoryState] = useState({})

  const todayPredictions = predictionsHistory[todayKey] || null
  const todayLay = layHistoryState[todayKey] || null

  const [selectedGames, setSelectedGames] = useState([])
  const [selectedTeams, setSelectedTeams] = useState({})
  const [selectedOdds, setSelectedOdds] = useState({})
  const [predictionsLocked, setPredictionsLocked] = useState(false)
  const [layRemovedGames, setLayRemovedGames] = useState([])
  const [layLocked, setLayLocked] = useState(false)
  const [sportTab, setSportTab] = useState('ALL')
  const [mlbPitchers, setMlbPitchers] = useState({})
  const [gamesBrowserOpen, setGamesBrowserOpen] = useState(true)
  const [todayFilter, setTodayFilter] = useState('today')

  // ── F5 / Halftime state ──
  const [f5State, setF5State] = useState({})
  const [f5Locked, setF5Locked] = useState(false)
  const [f5Modal, setF5Modal] = useState(null)   // { game, sport, linesData }
  const [f5LinesLoading, setF5LinesLoading] = useState(false)
  const [f5LinesCache, setF5LinesCache] = useState({})
  const [f5SelIdx, setF5SelIdx] = useState(null)  // F5 modal selected option index
  const [f5DateFilter, setF5DateFilter] = useState('today') // 'today' | 'future'

  const F5_LABELS = {
    MLB: { title: 'First 5 Innings', short: 'F5', emoji: '⚾', color: '#4c9be8' },
    NBA: { title: 'First Half',      short: 'H1', emoji: '🏀', color: '#c89b3c' },
    NFL: { title: 'First Half',      short: 'H1', emoji: '🏈', color: '#7ac96f' },
  }
  const SPORT_KEY_MAP_F5 = { NBA: 'basketball_nba', MLB: 'baseball_mlb', NFL: 'americanfootball_nfl' }
  const F5_API_KEY = '9556a1b199876f898bdc45023a854ed2'

  const todayF5 = f5State[todayKey] || {}

  useEffect(() => {
    loadAllData().then(d => {
      setF5State(d.f5 || {})
      // F5 locked if today's picks exist and locked flag is set
      const todayK = getTodayKey()
      setF5Locked(!!(d.f5?.[todayK]?._locked))
    })
  }, [])

  async function saveF5(updated) {
    setF5State(updated)
    const current = await loadAllData()
    await saveAllData({ ...current, f5: updated })
  }

  async function lockF5() {
    const todayK = getTodayKey()
    const updated = { ...f5State, [todayK]: { ...f5State[todayK], _locked: true } }
    await saveF5(updated)
    setF5Locked(true)
  }

  async function openF5Game(game) {
    const sport = game.sportLabel
    if (!F5_LABELS[sport]) return
    setF5LinesLoading(true)

    // _dk is already merged onto ESPN games by odds.js — just read it directly
    let linesData = game._dk?.f5 || null

    setF5LinesLoading(false)
    setF5SelIdx(null)
    setF5Modal({ game, sport, linesData })
  }

    async function confirmF5Pick(pickData) {
    const updated = { ...f5State, [todayKey]: { ...todayF5, [pickData.sport]: pickData } }
    await saveF5(updated)
    setF5SelIdx(null)
    setF5Modal(null)
  }

  async function f5NoGuess(sport) {
    const updated = { ...f5State, [todayKey]: { ...todayF5, [sport]: { noGuess: true, sport, result: null, date: todayKey } } }
    await saveF5(updated)
  }

  useEffect(() => {
    const hasMlb = allGames.some(g => g.sportLabel === 'MLB')
    if (hasMlb) fetchMlbProbablePitchers().then(map => setMlbPitchers(map))
  }, [allGames])

  useEffect(() => {
    async function loadParlaySavedState() {
      const pred = await loadPredictions()
      const lay = await loadLayHistory()
      setPredictionsHistory(pred)
      setLayHistoryState(lay)
      const predToday = pred[todayKey]
      const layToday = lay[todayKey]
      if (predToday) {
        setSelectedGames(predToday.legs.filter(l => !l.isLock).map(l => l.gameId))
        const map = {}
        const oddsMap = {}
        predToday.legs.forEach(l => { if (!l.isLock) { map[l.gameId] = l.team; if (l.odds != null) oddsMap[l.gameId] = l.odds } })
        setSelectedTeams(map)
        setSelectedOdds(oddsMap)
        setPredictionsLocked(true)
      }
      if (layToday && predToday) {
        const layIds = new Set(layToday.legs.map(l => l.gameId))
        setLayRemovedGames(predToday.legs.map(l => l.gameId).filter(id => !layIds.has(id)))
        setLayLocked(true)
      }
    }
    loadParlaySavedState()
  }, [])

  const [ouPick, setOuPick] = useState({})
  const [ouModal, setOuModal] = useState(null)

  useEffect(() => { loadOuPick().then(p => setOuPick(p || {})) }, [])

  const todayOuPick = ouPick[todayKey] || null

  const lockGame = todayLock ? (
    allGames.find(g => g.id === todayLock.gameId) ||
    allGames.find(g => g.home_team === todayLock.home && g.away_team === todayLock.away)
  ) : null
  const ouMarket = lockGame?.bookmakers?.[0]?.markets?.find(m => m.key === 'totals')
  const ouOptions = ouMarket ? ouMarket.outcomes : []

  async function confirmOuPick(outcome) {
    const updated = { ...ouPick, [todayKey]: { name: outcome.name, point: outcome.point, odds: ensureAmerican(outcome.price) } }
    await saveOuPick(updated)
    setOuPick(updated)
    setOuModal(null)
  }

  const leg1 = todayLock ? {
    label: todayLock.team,
    desc: todayLock.market === 'h2h' ? 'Moneyline' : `Spread ${todayLock.point > 0 ? '+' : ''}${todayLock.point}`,
    odds: todayLock.odds,
  } : null

  const leg2 = todayOuPick ? {
    label: `${todayOuPick.name} ${todayOuPick.point}`,
    desc: lockGame ? `${lockGame.home_team} vs ${lockGame.away_team} — Total` : 'Total',
    odds: todayOuPick.odds,
  } : null

  const doubleLockOdds = leg1 && leg2 ? combineParlayOdds([leg1.odds, leg2.odds]) : null

  const lockGameId = todayLock?.gameId || null
  const dogGameId = todayDog?.gameId || null

  const predictionsSlip = (() => {
    if (predictionsLocked && todayPredictions) {
      const mapped = todayPredictions.legs.map(leg => {
        const live = allGames.find(g => g.id === leg.gameId)
        return live || { id: leg.gameId, home_team: leg.home, away_team: leg.away, sportLabel: leg.sport, bookmakers: [], _leg: leg }
      })
      return [...mapped].sort((a, b) => {
        const legA = todayPredictions.legs.find(l => l.gameId === a.id)
        const legB = todayPredictions.legs.find(l => l.gameId === b.id)
        const rank = l => l?.isLock ? 0 : l?.isDog ? 1 : 2
        return rank(legA) - rank(legB)
      })
    }
    const autoIds = []
    if (lockGameId) autoIds.push(lockGameId)
    if (dogGameId && dogGameId !== lockGameId) autoIds.push(dogGameId)
    const ids = [...autoIds, ...selectedGames.filter(id => !autoIds.includes(id))]
    return allGames.filter(g => ids.includes(g.id))
  })()

  const laySlip = predictionsSlip.filter(g => !layRemovedGames.includes(g.id))

  const calcSlipOdds = (games) => {
    if (games.length < 2) return null
    const favOdds = games.map(game => {
      const ml = game.bookmakers?.[0]?.markets?.find(m => m.key === 'h2h')
      const fav = ml?.outcomes?.reduce((a, b) => ensureAmerican(a.price) < ensureAmerican(b.price) ? a : b)
      return fav ? ensureAmerican(fav.price) : -110
    })
    return combineParlayOdds(favOdds)
  }

  const predictionsOdds = predictionsLocked ? calcSlipOdds(predictionsSlip) : null
  const layOdds = layLocked ? calcSlipOdds(laySlip) : null

  const [openLay, setOpenLay] = useState(false)
  useEffect(() => { if (predictionsLocked) setOpenLay(true) }, [predictionsLocked])

  async function lockPredictions() {
    const legs = predictionsSlip.map(game => {
      const isLock = game.id === lockGameId
      const isDog = game.id === dogGameId && !isLock
      const team = isLock ? todayLock?.team : isDog ? todayDog?.team : selectedTeams[game.id]
      const odds = isLock ? (todayLock?.odds ?? null) : isDog ? (todayDog?.odds ?? null) : (selectedOdds[game.id] ?? null)
      // Store market + point so the resolver can check spread coverage, not just ML win
      const market = isLock ? (todayLock?.market ?? 'h2h') : 'h2h'
      const point  = isLock ? (todayLock?.point  ?? null) : null
      return { gameId: game.id, home: game.home_team, away: game.away_team, sport: game.sportLabel, team: team || null, odds, market, point, isLock, isDog, result: null }
    }).sort((a, b) => { const rank = l => l.isLock ? 0 : l.isDog ? 1 : 2; return rank(a) - rank(b) })
    const updated = { ...predictionsHistory, [todayKey]: { legs, lockedAt: Date.now() } }
    await savePredictions(updated)
    setPredictionsHistory(updated)
    setPredictionsLocked(true)
    setLayRemovedGames([])
    setLayLocked(false)
  }

  async function lockLay() {
    const legs = laySlip.map(game => {
      const isLock = game.id === lockGameId
      const isDog = game.id === dogGameId && !isLock
      const team = isLock ? todayLock?.team : isDog ? todayDog?.team : selectedTeams[game.id]
      const odds = isLock ? (todayLock?.odds ?? null) : isDog ? (todayDog?.odds ?? null) : (selectedOdds[game.id] ?? null)
      const market = isLock ? (todayLock?.market ?? 'h2h') : 'h2h'
      const point  = isLock ? (todayLock?.point  ?? null) : null
      return { gameId: game.id, home: game.home_team, away: game.away_team, sport: game.sportLabel, team: team || null, odds, market, point, isLock, isDog, result: null }
    }).sort((a, b) => { const rank = l => l.isLock ? 0 : l.isDog ? 1 : 2; return rank(a) - rank(b) })
    const hist = await loadLayHistory()
    const updated = { ...hist, [todayKey]: { legs, lockedAt: Date.now() } }
    await saveLayHistory(updated)
    setLayHistoryState(updated)
    setLayLocked(true)
  }

  useEffect(() => {
    async function resolvePredictions() {
      const hist = await loadPredictions()
      let changed = false
      for (const [date, entry] of Object.entries(hist)) {
        if (!entry.legs) continue
        const allResolved = entry.legs.every(l => l.result !== null)
        if (allResolved) continue
        for (let i = 0; i < entry.legs.length; i++) {
          const leg = entry.legs[i]
          if (leg.result !== null || !leg.team) continue
          if (!leg.sport) continue
          try {
            const dateStr = date.replace(/-/g, '')
            const events = await fetchEspnDate(leg.sport, dateStr)
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

            // Spread picks: check if picked team covered the line, not just won
            // ML picks (or no market stored): check who won
            let won
            if (leg.market === 'spreads' && leg.point != null) {
              const competitors = comp.competitors || []
              const _lt = leg.team.toLowerCase()
              const _ll = _lt.split(' ').pop()
              const pickedComp = competitors.find(c => {
                const dn = c.team.displayName.toLowerCase()
                const sn = c.team.shortDisplayName?.toLowerCase() || ''
                return dn.includes(_lt) || _lt.includes(dn) ||
                       (_ll.length > 3 && (dn.includes(_ll) || sn.includes(_ll)))
              })
              if (!pickedComp) continue
              const oppComp = competitors.find(c => c.id !== pickedComp.id)
              const pickedScore = parseFloat(pickedComp.score)
              const oppScore    = parseFloat(oppComp?.score ?? 0)
              if (isNaN(pickedScore)) continue
              // leg.point is the spread for picked team (e.g. -1.5 = fav, +1.5 = dog)
              // Covers if pickedScore + leg.point > oppScore (push = loss per standard rules)
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
            hist[date].legs[i].result = won ? 'W' : 'L'
            changed = true
          } catch(e) { console.error('[Predictions resolve]', e) }
        }
        // Only count legs that have a team pick (skip team=null legs)
        const legsWithTeamP = hist[date].legs.filter(l => l.team)
        const resolvedLegs = legsWithTeamP.filter(l => l.result !== null)
        if (resolvedLegs.length === legsWithTeamP.length && legsWithTeamP.length > 0 && !hist[date].overallResult) {
          const hits = resolvedLegs.filter(l => l.result === 'W').length
          hist[date].overallResult = hits / resolvedLegs.length >= 0.7 ? 'W' : 'L'
          hist[date].hitCount = hits
          hist[date].totalCount = resolvedLegs.length
          changed = true
        }
      }
      if (changed) { await savePredictions(hist); setPredictionsHistory({ ...hist }) }
    }
    resolvePredictions()
    const predInterval = setInterval(resolvePredictions, 5 * 60 * 1000)
    return () => clearInterval(predInterval)
  }, [])

  useEffect(() => {
    async function resolveLay() {
      const hist = await loadLayHistory()
      let changed = false
      for (const [date, entry] of Object.entries(hist)) {
        if (!entry || !entry.legs) continue
        // Only skip if every leg with a team is resolved AND overallResult already set
        const legsWithTeam = entry.legs.filter(l => l.team)
        const allResolved = legsWithTeam.every(l => l.result !== null)
        if (allResolved && entry.overallResult) continue
        for (let i = 0; i < entry.legs.length; i++) {
          const leg = entry.legs[i]
          if (leg.result !== null || !leg.team) continue
          if (!leg.sport) continue
          try {
            const dateStr = date.replace(/-/g, '')
            const events = await fetchEspnDate(leg.sport, dateStr)
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

            // Spread picks: check coverage against the line, not just who won
            // ML picks (or legs without market stored): check winner
            let won
            if (leg.market === 'spreads' && leg.point != null) {
              const competitors = comp.competitors || []
              const _lt = leg.team.toLowerCase()
              const _ll = _lt.split(' ').pop()
              const pickedComp = competitors.find(c => {
                const dn = c.team.displayName.toLowerCase()
                const sn = c.team.shortDisplayName?.toLowerCase() || ''
                return dn.includes(_lt) || _lt.includes(dn) ||
                       (_ll.length > 3 && (dn.includes(_ll) || sn.includes(_ll)))
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
            hist[date].legs[i].result = won ? 'W' : 'L'
            changed = true
          } catch(e) { console.error('[Lay resolve]', e) }
        }
        // Only set overallResult once ALL legs with teams are resolved
        const resolvedLegs = legsWithTeam.filter(l => l.result !== null)
        if (resolvedLegs.length === legsWithTeam.length && legsWithTeam.length > 0 && !hist[date].overallResult) {
          const hits = resolvedLegs.filter(l => l.result === 'W').length
          hist[date].overallResult = hits / resolvedLegs.length >= 0.7 ? 'W' : 'L'
          hist[date].hitCount = hits
          hist[date].totalCount = resolvedLegs.length
          changed = true
        }
      }
      if (changed) { await saveLayHistory(hist); setLayHistoryState({ ...hist }) }
    }
    resolveLay()
    const layInterval = setInterval(resolveLay, 5 * 60 * 1000)
    return () => clearInterval(layInterval)
  }, [])

  useEffect(() => {
    async function resolveOu() {
      const hist = await loadOuPick()
      const appSt = await loadState()
      let changed = false
      for (const [date, entry] of Object.entries(hist)) {
        if (!entry || entry.result != null) continue
        const lockPick = appSt.picks?.[date]
        if (!lockPick?.home || !lockPick?.sport) continue
        try {
          const dateStr = date.replace(/-/g, '')
          const events = await fetchEspnDate(lockPick.sport, dateStr)
          const homeLower = lockPick.home?.toLowerCase() || ''
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
          const scores = comp.competitors?.map(c => parseFloat(c.score)).filter(s => !isNaN(s))
          if (scores.length < 2) continue
          const total = scores.reduce((a, b) => a + b, 0)
          const line = entry.point
          if (total > line) hist[date].result = entry.name === 'Over' ? 'W' : 'L'
          else if (total < line) hist[date].result = entry.name === 'Under' ? 'W' : 'L'
          // exact tie = push, leave null
          changed = true
        } catch(e) { console.error('[OU resolve]', e) }
      }
      if (changed) { await saveOuPick(hist); setOuPick({ ...hist }) }
    }
    resolveOu()
  }, [])


  const yesterdayKey = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
  const yesterdayPred = predictionsHistory[yesterdayKey]
  const yesterdayLay = layHistoryState[yesterdayKey]
  const showYesterdayCard = !!(yesterdayPred?.overallResult || yesterdayLay?.overallResult)
  const fmtDate = (d) => { if (!d) return null; const [,mm,dd] = d.split('-'); return `${mm}/${dd}` }

  return (
    <div>
      {ouModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: '14px', padding: '2rem', width: '100%', maxWidth: '420px' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem' }}>🔒🔒 Double Lock — Pick O/U</h2>
            <p style={{ color: '#555', fontSize: '0.8rem', marginBottom: '1.5rem' }}>Your lock is set. Now pick the Over or Under to complete the parlay.</p>
            <div style={{ background: '#0a2a1a', border: '1px solid #00ff8833', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.68rem', color: '#00ff88', fontWeight: 'bold', marginBottom: '0.3rem' }}>🔒 LEG 1 — LOCKED</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 'bold' }}>{todayLock.team}</div>
                  <div style={{ color: '#555', fontSize: '0.75rem' }}>{todayLock.market === 'h2h' ? 'Moneyline' : `Spread ${todayLock.point > 0 ? '+' : ''}${todayLock.point}`}</div>
                </div>
                <div style={{ fontWeight: 'bold', color: '#00ff88' }}>{formatOdds(todayLock.odds)}</div>
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#555', marginBottom: '0.75rem', textAlign: 'center' }}>
              {lockGame?.away_team} vs {lockGame?.home_team}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {ouOptions.map(o => (
                <button key={o.name} onClick={() => confirmOuPick(o)} style={{
                  flex: 1, padding: '1rem', borderRadius: '10px', cursor: 'pointer',
                  background: o.name === 'Over' ? '#0a2a1a' : '#2a0a1a',
                  border: `1px solid ${o.name === 'Over' ? '#00ff88' : '#ff4488'}`,
                  color: o.name === 'Over' ? '#00ff88' : '#ff4488', fontWeight: 'bold', fontSize: '1rem',
                }}>
                  <div style={{ fontSize: '1.1rem' }}>{o.name === 'Over' ? '⬆' : '⬇'} {o.name}</div>
                  <div style={{ fontSize: '1.3rem', marginTop: '0.3rem' }}>{o.point}</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '0.2rem', opacity: 0.8 }}>{formatOdds(ensureAmerican(o.price))}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setOuModal(null)} style={{ width: '100%', padding: '0.75rem', background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: '#888', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: '#aaa' }}>🎰 PARLAYS</h2>
        <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>Your daily parlay slips — combined picks, combined odds.</p>
      </div>

      {/* 1. Double Lock */}
      <ParlaySection title="Double Lock" emoji="🔒🔒" defaultOpen={true} totalOdds={doubleLockOdds}>
        {!todayLock ? (
          <p style={{ color: '#555', fontSize: '0.85rem', margin: 0 }}>Make your Lock of the Day first — Double Lock will pair it with an O/U on that game.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a1a', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: '#00ff88', fontWeight: 'bold', marginBottom: '0.2rem' }}>LEG 1 · LOCKED</div>
                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{leg1.label}</div>
                <div style={{ color: '#555', fontSize: '0.75rem' }}>{leg1.desc}</div>
              </div>
              <div style={{ fontWeight: 'bold', color: leg1.odds > 0 ? '#ff9944' : '#00ff88', fontSize: '1rem' }}>{formatOdds(leg1.odds)}</div>
            </div>
            {leg2 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a1a', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                <div>
                  <div style={{ fontSize: '0.65rem', color: '#00ff88', fontWeight: 'bold', marginBottom: '0.2rem' }}>LEG 2 · LOCKED</div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{leg2.label}</div>
                  <div style={{ color: '#555', fontSize: '0.75rem' }}>{leg2.desc}</div>
                </div>
                <div style={{ fontWeight: 'bold', color: leg2.odds > 0 ? '#ff9944' : '#00ff88', fontSize: '1rem' }}>{formatOdds(leg2.odds)}</div>
              </div>
            ) : ouOptions.length > 0 ? (
              <button onClick={() => setOuModal(true)} style={{
                padding: '0.85rem 1rem', borderRadius: '8px', cursor: 'pointer',
                background: '#1a1a2a', border: '1px dashed #4444aa',
                color: '#8888ff', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'left',
              }}>
                <span style={{ marginRight: '0.5rem' }}>➕</span> Pick O/U to complete Double Lock
                <div style={{ fontSize: '0.72rem', color: '#555', fontWeight: 'normal', marginTop: '0.2rem' }}>{lockGame?.away_team} vs {lockGame?.home_team}</div>
              </button>
            ) : (
              <p style={{ color: '#555', fontSize: '0.85rem', margin: 0 }}>No O/U line available for this game.</p>
            )}
          </div>
        )}
      </ParlaySection>

      {/* 2. Predictions */}
      <ParlaySection title="Predictions" emoji="🔮" defaultOpen={true} totalOdds={predictionsOdds}>

        {showYesterdayCard && (
          <div style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.68rem', color: '#555', fontWeight: 'bold', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>
              📅 YESTERDAY · {fmtDate(yesterdayKey)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {yesterdayPred?.overallResult && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: yesterdayPred.overallResult === 'W' ? '#0a2a1a' : '#2a0a0a',
                  border: `1px solid ${yesterdayPred.overallResult === 'W' ? '#00ff8855' : '#ff444455'}`,
                  borderRadius: '8px', padding: '0.65rem 0.9rem',
                }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#555', marginBottom: '0.15rem' }}>🔮 PREDICTIONS</div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: yesterdayPred.overallResult === 'W' ? '#00ff88' : '#ff4444' }}>
                      {yesterdayPred.hitCount}/{yesterdayPred.totalCount} legs hit
                    </div>
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 'bold', padding: '0.25rem 0.65rem', borderRadius: '5px', background: yesterdayPred.overallResult === 'W' ? '#00ff8818' : '#ff444418', color: yesterdayPred.overallResult === 'W' ? '#00ff88' : '#ff4444' }}>
                    {Math.round(yesterdayPred.hitCount / yesterdayPred.totalCount * 100)}%{yesterdayPred.overallResult === 'W' ? ' ✅' : ' ❌'}
                  </div>
                </div>
              )}
              {yesterdayLay?.overallResult && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: yesterdayLay.overallResult === 'W' ? '#0a2a1a' : '#2a0a0a',
                  border: `1px solid ${yesterdayLay.overallResult === 'W' ? '#00ff8855' : '#ff444455'}`,
                  borderRadius: '8px', padding: '0.65rem 0.9rem',
                }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#555', marginBottom: '0.15rem' }}>🎯 LAY OF THE DAY</div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: yesterdayLay.overallResult === 'W' ? '#00ff88' : '#ff4444' }}>
                      {yesterdayLay.hitCount}/{yesterdayLay.totalCount} legs hit
                    </div>
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 'bold', padding: '0.25rem 0.65rem', borderRadius: '5px', background: yesterdayLay.overallResult === 'W' ? '#00ff8818' : '#ff444418', color: yesterdayLay.overallResult === 'W' ? '#00ff88' : '#ff4444' }}>
                    {Math.round(yesterdayLay.hitCount / yesterdayLay.totalCount * 100)}%{yesterdayLay.overallResult === 'W' ? ' ✅' : ' ❌'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {allGames.length === 0 && !predictionsLocked ? (
          <p style={{ color: '#555', fontSize: '0.85rem', margin: 0 }}>No games loaded yet — check the Games tab first.</p>
        ) : (
          <div>
            {!predictionsLocked && (
              <p style={{ color: '#555', fontSize: '0.8rem', margin: '0 0 1rem' }}>
                Tap a game to <strong style={{ color: '#00ff88' }}>add</strong> it, then pick your team.
                {lockGameId && <span style={{ color: '#555' }}> Your lock is auto-included.</span>}
                {dogGameId && dogGameId !== lockGameId && <span style={{ color: '#555' }}> Your dog pick is auto-included.</span>}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              {predictionsLocked && todayPredictions ? (
                todayPredictions.legs.reduce((acc, leg) => {
                  if (!leg.isLock && !leg.isDog) acc.n++
                  const n = acc.n
                  acc.els.push(
                    <div key={leg.gameId} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a1a',
                      border: `1px solid ${leg.result === 'W' ? '#00ff8844' : leg.result === 'L' ? '#ff444444' : leg.isLock ? '#00ff8844' : leg.isDog ? '#ff994444' : '#2a2a2a'}`,
                      borderRadius: '8px', padding: '0.75rem 1rem',
                    }}>
                      <div>
                        <div style={{ fontSize: '0.65rem', color: leg.isLock ? '#00ff88' : leg.isDog ? '#ff9944' : '#8888ff', fontWeight: 'bold', marginBottom: '0.15rem' }}>
                          {leg.isLock ? '🔒 LOCK' : leg.isDog ? '🐕 DOG' : `LEG ${n}`} · {leg.sport}
                        </div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{leg.team || '—'}</div>
                        <div style={{ color: '#555', fontSize: '0.72rem' }}>{leg.away} vs {leg.home}</div>
                      </div>
                      <div style={{ fontSize: '1.2rem' }}>{leg.result === 'W' ? '✅' : leg.result === 'L' ? '❌' : '⏳'}</div>
                    </div>
                  )
                  return acc
                }, { n: 0, els: [] }).els
              ) : (
                <>
                  {/* ── GAME BROWSER — tap to add to slip ── */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <button
                      onClick={() => setGamesBrowserOpen(o => !o)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: 0 }}
                    >
                      <span style={{ fontSize: '0.65rem', color: '#444', fontWeight: 'bold', letterSpacing: '0.07em' }}>
                        🎮 GAME BROWSER
                      </span>
                      <span style={{ color: '#333', fontSize: '0.65rem' }}>{gamesBrowserOpen ? '▲' : '▼'}</span>
                    </button>
                    {gamesBrowserOpen && (
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        {['today', 'all'].map(f => (
                          <button key={f} onClick={() => setTodayFilter(f)} style={{
                            fontSize: '0.62rem', padding: '0.15rem 0.55rem',
                            background: todayFilter === f ? '#1a1a1a' : 'none',
                            border: `1px solid ${todayFilter === f ? '#333' : '#1a1a1a'}`,
                            borderRadius: '4px', color: todayFilter === f ? '#aaa' : '#444',
                            cursor: 'pointer', fontWeight: todayFilter === f ? 'bold' : 'normal',
                          }}>
                            {f === 'today' ? "📅 Today" : "📋 All"}
                          </button>
                        ))}
                        <button onClick={() => {
                          // Select all visible (filtered, non-final, non-live, non-auto) games
                          const now = new Date()
                          const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                          const tomorrowMidnight = new Date(todayMidnight.getTime() + 86400000)
                          const visibleGames = filterBySport(allGames, sportTab).filter(game => {
                            if (game.id === lockGameId || game.id === dogGameId) return false
                            const espnState = game.espnStatus?.type?.state
                            if (espnState === 'post' || game.espnStatus?.type?.completed) return false
                            if (espnState === 'in') return false
                            if (todayFilter === 'today') {
                              const gd = new Date(game.commence_time)
                              if (gd < todayMidnight || gd >= tomorrowMidnight) return false
                            }
                            return true
                          })
                          const visibleIds = visibleGames.map(g => g.id)
                          const allSelected = visibleIds.every(id => selectedGames.includes(id))
                          if (allSelected) {
                            // Deselect all visible
                            setSelectedGames(s => s.filter(id => !visibleIds.includes(id)))
                            setSelectedTeams(t => { const n = {...t}; visibleIds.forEach(id => delete n[id]); return n })
                          } else {
                            // Select all visible
                            setSelectedGames(s => [...new Set([...s, ...visibleIds])])
                          }
                        }} style={{
                          fontSize: '0.62rem', padding: '0.15rem 0.6rem',
                          background: 'none', border: '1px solid #00ff8822',
                          borderRadius: '4px', color: '#00ff8888', cursor: 'pointer',
                        }}>
                          ✓ All
                        </button>
                      </div>
                    )}
                  </div>
                  {gamesBrowserOpen && (
                    <>
                  <SportFilter games={allGames} value={sportTab} onChange={setSportTab} label="game" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1.25rem' }}>
                    {filterBySport(allGames, sportTab).map(game => {
                      const isLockGame = game.id === lockGameId
                      const isDogGame = game.id === dogGameId && !isLockGame
                      const isAutoIncluded = isLockGame || isDogGame
                      const isSelected = isAutoIncluded || selectedGames.includes(game.id)
                      const espnState = game.espnStatus?.type?.state
                      const isFinal = espnState === 'post' || game.espnStatus?.type?.completed
                      const isLive = espnState === 'in'
                      if (isFinal) return null  // hide completed games
                      // Today filter: only show today's games (or always show lock/dog games)
                      if (todayFilter === 'today' && !isAutoIncluded) {
                        const gameDate = new Date(game.commence_time)
                        const now = new Date()
                        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                        const tomorrowMidnight = new Date(todayMidnight.getTime() + 86400000)
                        if (gameDate < todayMidnight || gameDate >= tomorrowMidnight) return null
                      }
                      return (
                        <div
                          key={game.id}
                          onClick={() => {
                            if (isAutoIncluded || isLive) return
                            if (isSelected) { setSelectedGames(s => s.filter(id => id !== game.id)); setSelectedTeams(t => { const n = {...t}; delete n[game.id]; return n }) }
                            else setSelectedGames(s => [...s, game.id])
                          }}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: isSelected ? '#1a1a1a' : '#111',
                            border: `1px solid ${isLockGame ? '#00ff8833' : isDogGame ? '#ff994433' : isSelected ? '#333' : '#1a1a1a'}`,
                            borderRadius: '8px', padding: '0.7rem 0.9rem',
                            cursor: isAutoIncluded || isLive ? 'default' : 'pointer',
                            opacity: isLive ? 0.5 : 1,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.62rem', color: isLockGame ? '#00ff88' : isDogGame ? '#ff9944' : '#444', marginBottom: '0.1rem', fontWeight: isAutoIncluded ? 'bold' : 'normal' }}>
                              {isLockGame ? '🔒 ' : isDogGame ? '🐕 ' : ''}{game.sportLabel}
                              {isLive && <span style={{ color: '#ff9944', marginLeft: '0.4rem' }}>· 🔴 LIVE</span>}
                            </div>
                            <div style={{ fontWeight: 'bold', fontSize: '0.88rem' }}>
                              {game.away_team} <span style={{ color: '#333', fontWeight: 'normal' }}>@</span> {game.home_team}
                            </div>
                            <div style={{ fontSize: '0.62rem', color: '#444', marginTop: '0.1rem' }}>{getGameDateLabel(game.commence_time)}</div>
                            {game.sportLabel === 'MLB' && (() => {
                              const awayP = getProbablePitcher(game.away_team, mlbPitchers)
                              const homeP = getProbablePitcher(game.home_team, mlbPitchers)
                              if (!awayP && !homeP) return null
                              return (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem', background: '#0d1a2a', border: '1px solid #1a3a5a', borderRadius: '5px', padding: '0.18rem 0.5rem' }}>
                                  <span style={{ fontSize: '0.58rem', color: '#4c9be8' }}>⚾</span>
                                  <span style={{ fontSize: '0.6rem', color: '#4c9be855' }}>{game.away_team.split(' ').pop()}:</span>
                                  <span style={{ fontSize: '0.6rem', color: awayP ? '#7ab8e8' : '#2a4a6a', fontWeight: awayP ? 'bold' : 'normal' }}>{awayP || 'TBA'}</span>
                                  <span style={{ fontSize: '0.55rem', color: '#1a3a5a' }}>·</span>
                                  <span style={{ fontSize: '0.6rem', color: '#4c9be855' }}>{game.home_team.split(' ').pop()}:</span>
                                  <span style={{ fontSize: '0.6rem', color: homeP ? '#7ab8e8' : '#2a4a6a', fontWeight: homeP ? 'bold' : 'normal' }}>{homeP || 'TBA'}</span>
                                </div>
                              )
                            })()}
                          </div>
                          <div style={{ fontSize: '1rem', color: isLockGame ? '#00ff88' : isDogGame ? '#ff9944' : isSelected ? '#ff4444' : '#444' }}>
                            {isLockGame ? '🔒' : isDogGame ? '🐕' : isSelected ? '✕' : '＋'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                    </>
                  )}

                  {/* ── SLIP — all legs with team pickers, combined odds, lock button ── */}
                  {predictionsSlip.length > 0 && (
                    <div style={{ background: '#0d1a0d', border: '1px solid #00ff8822', borderRadius: '12px', padding: '1rem', marginTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.65rem', color: '#00ff88', fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                        🎟 PARLAY SLIP · {predictionsSlip.length} LEG{predictionsSlip.length !== 1 ? 'S' : ''}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.85rem' }}>
                        {predictionsSlip.map((leg, i) => {
                          // Pre-lock: leg is a raw game object (has .id). Post-lock: leg has .gameId
                          const gid = leg.id || leg.gameId
                          const game = allGames.find(g => g.id === gid) || leg
                          const bm = game?.bookmakers?.[0]
                          const ml = bm?.markets?.find(m => m.key === 'h2h')
                          const isLockLeg = gid === lockGameId
                          const isDogLeg = gid === dogGameId && !isLockLeg
                          const isAutoLeg = isLockLeg || isDogLeg
                          // Pre-lock: team comes from selectedTeams; post-lock: from leg.team
                          const chosenTeam = leg.team || selectedTeams[gid]
                          const chosenOdds = leg.odds || selectedOdds[gid]
                          const awayName = leg.away_team || leg.away
                          const homeName = leg.home_team || leg.home
                          const sportName = leg.sportLabel || leg.sport
                          return (
                            <div key={gid || i} style={{ background: '#111', border: `1px solid ${isLockLeg ? '#00ff8833' : isDogLeg ? '#ff994433' : '#222'}`, borderRadius: '8px', overflow: 'hidden' }}>
                              <div style={{ padding: '0.6rem 0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <div style={{ fontSize: '0.6rem', color: isLockLeg ? '#00ff88' : isDogLeg ? '#ff9944' : '#555', marginBottom: '0.1rem' }}>
                                    {isLockLeg ? '🔒 LOCK · ' : isDogLeg ? '🐕 DOG · ' : `LEG ${predictionsSlip.slice(0, i).filter(l => { const g = l.id || l.gameId; return g !== lockGameId && g !== dogGameId }).length + 1} · `}{sportName}
                                  </div>
                                  <div style={{ fontWeight: 'bold', fontSize: '0.82rem' }}>
                                    {awayName} <span style={{ color: '#333' }}>@</span> {homeName}
                                  </div>
                                  {sportName === 'MLB' && (() => {
                                    const awayP = getProbablePitcher(awayName, mlbPitchers)
                                    const homeP = getProbablePitcher(homeName, mlbPitchers)
                                    if (!awayP && !homeP) return null
                                    return (
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem', background: '#0d1a2a', border: '1px solid #1a3a5a', borderRadius: '5px', padding: '0.18rem 0.5rem' }}>
                                        <span style={{ fontSize: '0.58rem', color: '#4c9be8' }}>⚾</span>
                                        <span style={{ fontSize: '0.6rem', color: '#4c9be855' }}>{(awayName || '').split(' ').pop()}:</span>
                                        <span style={{ fontSize: '0.6rem', color: awayP ? '#7ab8e8' : '#2a4a6a', fontWeight: awayP ? 'bold' : 'normal' }}>{awayP || 'TBA'}</span>
                                        <span style={{ fontSize: '0.55rem', color: '#1a3a5a' }}>·</span>
                                        <span style={{ fontSize: '0.6rem', color: '#4c9be855' }}>{(homeName || '').split(' ').pop()}:</span>
                                        <span style={{ fontSize: '0.6rem', color: homeP ? '#7ab8e8' : '#2a4a6a', fontWeight: homeP ? 'bold' : 'normal' }}>{homeP || 'TBA'}</span>
                                      </div>
                                    )
                                  })()}
                                </div>
                                {chosenTeam && (
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: isLockLeg ? '#00ff88' : isDogLeg ? '#ff9944' : '#fff' }}>{chosenTeam}</div>
                                    {chosenOdds && <div style={{ fontSize: '0.68rem', color: '#555' }}>{formatOdds(chosenOdds)}</div>}
                                  </div>
                                )}
                              </div>
                              {!isAutoLeg && ml && (
                                <div style={{ display: 'flex', borderTop: '1px solid #1a1a1a' }}>
                                  {ml.outcomes.map(o => {
                                    const odds = ensureAmerican(o.price)
                                    const isChosen = chosenTeam === o.name
                                    return (
                                      <button key={o.name}
                                        onClick={() => { setSelectedTeams(t => ({ ...t, [gid]: o.name })); setSelectedOdds(t => ({ ...t, [gid]: odds })) }}
                                        style={{
                                          flex: 1, padding: '0.55rem 0.4rem', border: 'none',
                                          background: isChosen ? '#0a2a1a' : '#141414',
                                          color: isChosen ? '#00ff88' : '#555',
                                          cursor: 'pointer', fontSize: '0.76rem', fontWeight: isChosen ? 'bold' : 'normal',
                                          borderRight: '1px solid #1a1a1a', transition: 'all 0.12s',
                                        }}>
                                        {o.name.split(' ').pop()} <span style={{ opacity: 0.6 }}>{formatOdds(odds)}</span>
                                      </button>
                                    )
                                  })}
                                  {!ml && (
                                    <div style={{ flex: 1, padding: '0.55rem', textAlign: 'center', color: '#333', fontSize: '0.72rem' }}>
                                      No odds — pick team manually
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      {/* Combined odds */}
                      {(() => {
                        const slipOdds = calcSlipOdds(predictionsSlip)
                        const allPicked = predictionsSlip.every(l => {
                          const gid = l.id || l.gameId
                          const isAuto = gid === lockGameId || gid === dogGameId
                          return isAuto || l.team || selectedTeams[gid]
                        })
                        return slipOdds ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderTop: '1px solid #1a2a1a', marginBottom: '0.75rem' }}>
                            <div>
                              <div style={{ fontSize: '0.6rem', color: '#555', marginBottom: '0.1rem' }}>PARLAY ODDS</div>
                              <div style={{ fontWeight: 'bold', color: '#00ff88', fontSize: '1.1rem' }}>{formatOdds(slipOdds)}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.6rem', color: '#555', marginBottom: '0.1rem' }}>1 COIN WINS</div>
                              <div style={{ fontWeight: 'bold', color: '#00ff88', fontSize: '1.1rem' }}>{calcPayout(slipOdds, 1).toFixed(2)}</div>
                            </div>
                          </div>
                        ) : null
                      })()}
                      <button
                        disabled={predictionsSlip.length < 2 || !predictionsSlip.every(l => { const gid = l.id || l.gameId; return gid === lockGameId || gid === dogGameId || l.team || selectedTeams[gid] })}
                        onClick={lockPredictions}
                        style={(() => {
                          const ready = predictionsSlip.length >= 2 && predictionsSlip.every(l => { const gid = l.id || l.gameId; return gid === lockGameId || gid === dogGameId || l.team || selectedTeams[gid] })
                          return {
                            width: '100%', padding: '0.85rem', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.9rem', border: 'none',
                            background: ready ? '#00ff88' : '#1a2a1a',
                            color: ready ? '#000' : '#335533',
                            cursor: ready ? 'pointer' : 'not-allowed',
                            transition: 'all 0.15s',
                          }
                        })()}>
                        {predictionsSlip.length < 2 ? 'Add at least 2 games' : !predictionsSlip.every(l => { const gid = l.id || l.gameId; return gid === lockGameId || gid === dogGameId || l.team || selectedTeams[gid] }) ? 'Pick a team for each leg' : `Lock Parlay (${predictionsSlip.length} legs) 🔒`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            {predictionsLocked && predictionsOdds && (
              <div style={{ background: '#0a2a1a', border: '1px solid #00ff8833', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#555', marginBottom: '0.2rem', letterSpacing: '0.04em' }}>🔮 PARLAY ODDS</div>
                    <div style={{ fontWeight: 'bold', color: '#00ff88', fontSize: '1.2rem' }}>{formatOdds(predictionsOdds)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.65rem', color: '#555', marginBottom: '0.2rem', letterSpacing: '0.04em' }}>💰 1 COIN WINS</div>
                    <div style={{ fontWeight: 'bold', color: '#00ff88', fontSize: '1.2rem' }}>{calcPayout(predictionsOdds, 1).toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', color: '#555' }}>{predictionsSlip.length} game{predictionsSlip.length !== 1 ? 's' : ''} in slip</span>
              {predictionsLocked && (
                <span style={{ color: '#00ff88', fontSize: '0.8rem', fontWeight: 'bold' }}>✅ Locked in</span>
              )}
            </div>
          </div>
        )}
      </ParlaySection>

      {/* 3. Lay of the Day */}
      <ParlaySection title="Lay of the Day" emoji="🎯" defaultOpen={false} totalOdds={layOdds} forceOpen={openLay}>
        {!predictionsLocked ? (
          <p style={{ color: '#555', fontSize: '0.85rem', margin: 0 }}>Lock in your Predictions first — then trim down to your 2–4 most confident picks.</p>
        ) : (
          <div>
            {!layLocked && (
              <p style={{ color: '#555', fontSize: '0.8rem', margin: '0 0 1rem' }}>
                Tap ✕ to <strong style={{ color: '#ff4444' }}>remove</strong> a game. Keep 2–4 legs, then lock in.
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {layLocked && todayLay ? (
                todayLay.legs.reduce((acc, leg) => {
                  if (!leg.isLock && !leg.isDog) acc.n++
                  const legNum = acc.n
                  acc.els.push(
                    <div key={leg.gameId} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a1a',
                      border: `1px solid ${leg.result === 'W' ? '#00ff8844' : leg.result === 'L' ? '#ff444444' : leg.isLock ? '#00ff8844' : leg.isDog ? '#ff994444' : '#8888ff44'}`,
                      borderRadius: '8px', padding: '0.75rem 1rem',
                    }}>
                      <div>
                        <div style={{ fontSize: '0.65rem', color: leg.isLock ? '#00ff88' : leg.isDog ? '#ff9944' : '#8888ff', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                          {leg.isLock ? '🔒 LOCK' : leg.isDog ? '🐕 DOG' : `LEG ${legNum}`}
                        </div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{leg.team || '—'}</div>
                        <div style={{ color: '#555', fontSize: '0.72rem' }}>{leg.away} vs {leg.home}</div>
                        {leg.odds != null && (
                          <div style={{ fontSize: '0.72rem', color: leg.odds < 0 ? '#00ff88' : '#ff9944', fontWeight: 'bold', marginTop: '0.15rem' }}>
                            {formatOdds(leg.odds)}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '1.2rem' }}>{leg.result === 'W' ? '✅' : leg.result === 'L' ? '❌' : '⏳'}</div>
                    </div>
                  )
                  return acc
                }, { n: 0, els: [] }).els
              ) : (
                predictionsSlip.map((game) => {
                  const bm = game.bookmakers?.[0]
                  const ml = bm?.markets?.find(m => m.key === 'h2h')
                  const isRemoved = layRemovedGames.includes(game.id)
                  const isLockGame = game.id === lockGameId
                  const isDogGame = game.id === dogGameId && !isLockGame
                  const chosenTeam = isLockGame ? todayLock?.team : isDogGame ? todayDog?.team : selectedTeams[game.id]
                  const pickedOutcome = ml?.outcomes?.find(o => o.name === chosenTeam) || ml?.outcomes?.reduce((a, b) => ensureAmerican(a.price) < ensureAmerican(b.price) ? a : b)
                  const canRemove = !isLockGame && !isDogGame && laySlip.length > 2
                  const canAdd = isRemoved && laySlip.length < 4
                  const legNum = laySlip.filter(g => !layRemovedGames.includes(g.id)).indexOf(game) + 1
                  return (
                    <div key={game.id} onClick={() => {
                      if (layLocked || isLockGame || isDogGame) return
                      if (isRemoved && canAdd) setLayRemovedGames(r => r.filter(id => id !== game.id))
                      else if (!isRemoved && canRemove) setLayRemovedGames(r => [...r, game.id])
                    }} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: isRemoved ? '#111' : isLockGame ? '#0d0d0d' : '#1a1a1a',
                      border: `1px solid ${isRemoved ? '#1a1a1a' : isLockGame ? '#1e1e1e' : isDogGame ? '#ff994444' : '#2a2a2a'}`,
                      borderRadius: '8px', padding: '0.75rem 1rem',
                      opacity: isRemoved ? 0.3 : isLockGame ? 0.45 : 1,
                      cursor: (isLockGame || isDogGame || (!canRemove && !isRemoved) || (!canAdd && isRemoved)) ? 'default' : 'pointer',
                      transition: 'all 0.15s',
                    }}>
                      <div>
                        <div style={{ fontSize: '0.65rem', color: isLockGame ? '#333' : isDogGame ? '#ff9944' : '#8888ff', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                          {isLockGame ? '🔒 LOCK — fixed' : isDogGame ? '🐕 DOG' : isRemoved ? 'REMOVED' : `LEG ${legNum}`}
                        </div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: isLockGame ? '#555' : '#fff' }}>{pickedOutcome?.name || '—'}</div>
                        <div style={{ color: '#333', fontSize: '0.72rem' }}>{game.away_team} vs {game.home_team}</div>
                        <div style={{ fontSize: '0.65rem', color: isLockGame ? '#2a2a2a' : '#444', marginTop: '0.2rem' }}>
                          {getGameDateLabel(game.commence_time)}
                        </div>
                        {game.sportLabel === 'MLB' && (() => {
                          const awayP = getProbablePitcher(game.away_team, mlbPitchers)
                          const homeP = getProbablePitcher(game.home_team, mlbPitchers)
                          if (!awayP && !homeP) return null
                          return (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem', background: '#0d1a2a', border: '1px solid #1a3a5a', borderRadius: '5px', padding: '0.18rem 0.5rem' }}>
                              <span style={{ fontSize: '0.58rem', color: '#4c9be8' }}>⚾</span>
                              <span style={{ fontSize: '0.6rem', color: '#4c9be855' }}>{game.away_team.split(' ').pop()}:</span>
                              <span style={{ fontSize: '0.6rem', color: awayP ? '#7ab8e8' : '#2a4a6a', fontWeight: awayP ? 'bold' : 'normal' }}>{awayP || 'TBA'}</span>
                              <span style={{ fontSize: '0.55rem', color: '#1a3a5a' }}>·</span>
                              <span style={{ fontSize: '0.6rem', color: '#4c9be855' }}>{game.home_team.split(' ').pop()}:</span>
                              <span style={{ fontSize: '0.6rem', color: homeP ? '#7ab8e8' : '#2a4a6a', fontWeight: homeP ? 'bold' : 'normal' }}>{homeP || 'TBA'}</span>
                            </div>
                          )
                        })()}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ fontWeight: 'bold', color: isLockGame ? '#333' : pickedOutcome && ensureAmerican(pickedOutcome.price) < 0 ? '#00ff88' : '#ff9944', fontSize: '1rem' }}>
                          {pickedOutcome ? formatOdds(ensureAmerican(pickedOutcome.price)) : '—'}
                        </div>
                        <div style={{ fontSize: '1.1rem', opacity: isLockGame ? 0.3 : 1 }}>
                          {isRemoved ? (canAdd ? '➕' : '—') : isLockGame ? '🔒' : isDogGame ? '🐕' : (canRemove ? '✕' : '—')}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            {!layLocked && laySlip.length >= 2 && (
              <div style={{ background: '#1a1a2a', border: '1px solid #8888ff44', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#555', fontSize: '0.78rem' }}>{laySlip.length} legs · Lay of the Day</span>
                  <span style={{ fontWeight: 'bold', color: '#8888ff', fontSize: '1.2rem' }}>{formatOdds(calcSlipOdds(laySlip))}</span>
                </div>
              </div>
            )}
            {layLocked && layOdds && (
              <div style={{ background: '#12122a', border: '1px solid #8888ff33', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#555', marginBottom: '0.2rem', letterSpacing: '0.04em' }}>🎯 PARLAY ODDS</div>
                    <div style={{ fontWeight: 'bold', color: '#8888ff', fontSize: '1.2rem' }}>{formatOdds(layOdds)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.65rem', color: '#555', marginBottom: '0.2rem', letterSpacing: '0.04em' }}>💰 1 COIN WINS</div>
                    <div style={{ fontWeight: 'bold', color: '#8888ff', fontSize: '1.2rem' }}>{calcPayout(layOdds, 1).toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', color: laySlip.length < 2 || laySlip.length > 4 ? '#ff4444' : '#555' }}>
                {laySlip.length} leg{laySlip.length !== 1 ? 's' : ''}
                {laySlip.length < 2 ? ' — need at least 2' : laySlip.length > 4 ? ' — max 4' : ' ✓'}
              </span>
              {!layLocked ? (
                <button disabled={laySlip.length < 2 || laySlip.length > 4} onClick={lockLay} style={{
                  padding: '0.6rem 1.25rem', borderRadius: '7px', fontWeight: 'bold', fontSize: '0.85rem',
                  background: laySlip.length >= 2 && laySlip.length <= 4 ? '#8888ff' : '#1a1a1a',
                  color: laySlip.length >= 2 && laySlip.length <= 4 ? '#000' : '#333',
                  border: `1px solid ${laySlip.length >= 2 && laySlip.length <= 4 ? '#8888ff' : '#2a2a2a'}`,
                  cursor: laySlip.length >= 2 && laySlip.length <= 4 ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                }}>Lock Lay 🎯</button>
              ) : (
                <span style={{ color: '#8888ff', fontSize: '0.8rem', fontWeight: 'bold' }}>✅ Lay locked</span>
              )}
            </div>
          </div>
        )}
      </ParlaySection>

      {/* ── 4. F5 / Halftime Slip ── */}
      <ParlaySection title="F5 / Halftime" emoji="⚡" defaultOpen={false}>
        <div style={{ padding: '0.75rem' }}>
          <p style={{ margin: '0 0 1rem', color: '#444', fontSize: '0.8rem' }}>
            First 5 innings (MLB) · First half (NBA/NFL) · One pick per sport · Push on tie
          </p>

          {/* Today's F5 picks */}
          {/* Today's F5 picks — editable until game starts (result === null) */}
          {Object.keys(todayF5).filter(k => k !== '_locked').length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1rem' }}>
              {Object.entries(todayF5).filter(([k]) => k !== '_locked').map(([sport, pick]) => {
                if (!pick) return null
                const meta = F5_LABELS[sport]
                const canChange = !f5Locked && pick.result === null
                const borderColor = pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : pick.result === 'P' ? '#aaa' : f5Locked ? (meta?.color || '#555') + '44' : (meta?.color || '#555') + '66'
                return (
                  <div key={sport} style={{ background: '#111', border: `1px solid ${borderColor}`, borderRadius: '8px', padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: '0.62rem', color: meta?.color, fontWeight: 'bold', marginBottom: '0.2rem' }}>
                        {meta?.emoji} {sport} {meta?.short} · TODAY
                      </div>
                      {canChange && (
                        <button
                          onClick={async () => {
                            const updated = { ...f5State, [todayKey]: { ...todayF5 } }
                            delete updated[todayKey][sport]
                            await saveF5(updated)
                          }}
                          style={{ background: 'transparent', border: '1px solid #333', borderRadius: '5px', color: '#555', cursor: 'pointer', fontSize: '0.68rem', padding: '0.15rem 0.55rem', fontWeight: 'bold' }}
                        >
                          ✏️ Change
                        </button>
                      )}
                    </div>
                    {pick.noGuess
                      ? <div style={{ color: '#555', fontSize: '0.85rem', fontStyle: 'italic' }}>No guess — sitting out</div>
                      : <>
                          <div style={{ fontWeight: 'bold', fontSize: '0.92rem' }}>{pick.team}</div>
                          <div style={{ fontSize: '0.72rem', color: '#555', marginTop: '0.1rem' }}>
                            {pick.marketType === 'moneyline' ? 'Moneyline' : `Spread ${pick.point > 0 ? '+' : ''}${pick.point}`}
                            {' · '}{formatOdds(pick.odds)} · {pick.away} @ {pick.home}
                          </div>
                        </>
                    }
                    {!pick.noGuess && pick.result === null && <div style={{ fontSize: '0.7rem', color: '#555', marginTop: '0.3rem' }}>⏳ Pending...</div>}
                    {pick.result === 'W' && <div style={{ fontSize: '0.78rem', color: '#00ff88', fontWeight: 'bold', marginTop: '0.3rem' }}>✅ WIN</div>}
                    {pick.result === 'L' && <div style={{ fontSize: '0.78rem', color: '#ff4444', fontWeight: 'bold', marginTop: '0.3rem' }}>❌ LOSS</div>}
                    {pick.result === 'P' && <div style={{ fontSize: '0.78rem', color: '#aaa', fontWeight: 'bold', marginTop: '0.3rem' }}>🤝 PUSH</div>}
                  </div>
                )
              })}
              {/* Lock button — only show if not locked yet */}
              {!f5Locked ? (
                <button
                  onClick={lockF5}
                  style={{
                    width: '100%', padding: '0.75rem', borderRadius: '8px', fontWeight: 'bold',
                    fontSize: '0.85rem', border: 'none', cursor: 'pointer',
                    background: '#ff9944', color: '#000', marginTop: '0.25rem',
                  }}
                >
                  ⚡ Lock F5 Picks 🔒
                </button>
              ) : (
                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#ff9944', fontWeight: 'bold', marginTop: '0.25rem' }}>
                  ⚡ F5 picks locked in
                </div>
              )}
            </div>
          )}

          {/* No-guess + game picker — per sport, only show unpicked sports */}
          {(() => {
            const sportsInGames = new Set(allGames.map(g => g.sportLabel))
            const unpicked = Object.keys(F5_LABELS).filter(s => sportsInGames.has(s) && !todayF5[s])
            if (!unpicked.length || f5Locked) return null
            const now = new Date()
            const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            const tomorrowMidnight = new Date(todayMidnight.getTime() + 86400000)
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Date filter tabs */}
                <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.25rem' }}>
                  {['today', 'future'].map(f => (
                    <button key={f} onClick={() => setF5DateFilter(f)} style={{
                      fontSize: '0.62rem', padding: '0.15rem 0.6rem',
                      background: f5DateFilter === f ? '#1a1a1a' : 'none',
                      border: `1px solid ${f5DateFilter === f ? '#333' : '#1a1a1a'}`,
                      borderRadius: '4px', color: f5DateFilter === f ? '#aaa' : '#444',
                      cursor: 'pointer', fontWeight: f5DateFilter === f ? 'bold' : 'normal',
                    }}>
                      {f === 'today' ? '📅 Today' : '🌅 Future'}
                    </button>
                  ))}
                </div>
                {unpicked.map(sport => {
                  const meta = F5_LABELS[sport]
                  // Filter by date tab and game state
                  const sportGames = allGames.filter(g => {
                    if (g.sportLabel !== sport) return false
                    const state = g.espnStatus?.type?.state
                    const completed = g.espnStatus?.type?.completed
                    if (completed || state === 'post' || state === 'in') return false
                    const gd = new Date(g.commence_time)
                    if (f5DateFilter === 'today') return gd >= todayMidnight && gd < tomorrowMidnight
                    if (f5DateFilter === 'future') return gd >= tomorrowMidnight
                    return true
                  })
                  if (!sportGames.length) return (
                    <div key={sport} style={{ fontSize: '0.7rem', color: '#333', padding: '0.5rem 0' }}>
                      {meta.emoji} No {sport} games {f5DateFilter === 'today' ? 'today' : 'upcoming'}
                    </div>
                  )
                  return (
                    <div key={sport}>
                      <div style={{ fontSize: '0.68rem', color: meta.color, fontWeight: 'bold', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>
                        {meta.emoji} {sport} · {meta.title}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.4rem' }}>
                        {sportGames.map(game => {
                          const espnState = game.espnStatus?.type?.state
                          const isLive = espnState === 'in'
                          const isFinal = espnState === 'post' || game.espnStatus?.type?.completed
                          const isUnavailable = isLive || isFinal
                          const score = game.espnScores
                          const scoreStr = score ? `${game.away_team.split(' ').pop()} ${score.away} – ${game.home_team.split(' ').pop()} ${score.home}` : ''
                          return (
                            <div
                              key={game.id}
                              onClick={() => !isUnavailable && openF5Game(game)}
                              style={{
                                background: isUnavailable ? '#111' : '#1a1a1a',
                                border: `1px solid ${isLive ? '#ff994433' : isFinal ? '#1e1e1e' : '#2a2a2a'}`,
                                borderRadius: '8px', padding: '0.8rem 1rem',
                                cursor: isUnavailable ? 'default' : 'pointer',
                                opacity: isFinal ? 0.45 : 1,
                                transition: 'border-color 0.15s',
                              }}
                              onMouseEnter={e => { if (!isUnavailable) e.currentTarget.style.borderColor = meta.color + '88' }}
                              onMouseLeave={e => { if (!isUnavailable) e.currentTarget.style.borderColor = isLive ? '#ff994433' : '#2a2a2a' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '0.88rem', color: isFinal ? '#555' : '#fff' }}>
                                  {game.away_team} <span style={{ color: '#333' }}>@</span> {game.home_team}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#555', textAlign: 'right' }}>
                                  {isLive && <span style={{ color: '#ff9944', fontWeight: 'bold', display: 'block' }}>🔴 LIVE{scoreStr ? ` · ${scoreStr}` : ''}</span>}
                                  {isFinal && <span style={{ color: '#444', display: 'block' }}>✓ Final{scoreStr ? ` · ${scoreStr}` : ''}</span>}
                                  {!isUnavailable && getGameDateLabel(game.commence_time)}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <button onClick={() => f5NoGuess(sport)} style={{
                        width: '100%', padding: '0.45rem', background: 'transparent', border: '1px solid #1e1e1e',
                        borderRadius: '6px', color: '#333', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 'bold',
                      }}>
                        No Guess for {sport}
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </ParlaySection>

      {/* F5 Pick Modal */}
      {f5Modal && (() => {
        const { game, sport, linesData } = f5Modal
        const meta = F5_LABELS[sport]
        // linesData is now { h2h, runline, total } from /dk-f5 (scraper format)
        const options = []
        if (linesData?.h2h) {
          const { homeName, awayName, homeOdds, awayOdds } = linesData.h2h
          options.push({ team: awayName || game.away_team, odds: awayOdds, marketType: 'moneyline', point: null, label: 'Moneyline' })
          options.push({ team: homeName || game.home_team, odds: homeOdds, marketType: 'moneyline', point: null, label: 'Moneyline' })
        }
        if (linesData?.runline) {
          const { homeName, awayName, homeOdds, awayOdds, homePoint, awayPoint } = linesData.runline
          options.push({ team: awayName || game.away_team, odds: awayOdds, marketType: 'spread', point: awayPoint, label: `Run Line ${awayPoint > 0 ? '+' : ''}${awayPoint}` })
          options.push({ team: homeName || game.home_team, odds: homeOdds, marketType: 'spread', point: homePoint, label: `Run Line ${homePoint > 0 ? '+' : ''}${homePoint}` })
        }
        const noLines = options.length === 0
        const sel = f5SelIdx !== null ? options[f5SelIdx] : null
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div style={{ background: '#141414', border: '1px solid #333', borderRadius: '14px', padding: '1.75rem', width: '100%', maxWidth: '440px' }}>
              <div style={{ fontSize: '0.65rem', color: meta.color, fontWeight: 'bold', marginBottom: '0.25rem' }}>
                {meta.emoji} {sport} · {meta.title}
              </div>
              <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem' }}>{game.away_team} @ {game.home_team}</h2>
              <p style={{ margin: '0 0 1.25rem', color: '#444', fontSize: '0.75rem' }}>{getGameDateLabel(game.commence_time)}</p>
              {f5LinesLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#555' }}>⏳ Loading lines...</div>
              ) : noLines ? (
                <div style={{ background: '#1a1a1a', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', marginBottom: '1.25rem' }}>
                  <div style={{ color: '#555', fontSize: '0.85rem' }}>No {meta.short} lines available yet.</div>
                  <div style={{ color: '#444', fontSize: '0.75rem', marginTop: '0.35rem' }}>Lines typically post a few hours before gametime.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1.25rem', maxHeight: '50vh', overflowY: 'auto' }}>
                  {options.map((opt, i) => (
                    <button key={i} onClick={() => setF5SelIdx(i)} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.8rem 1rem', borderRadius: '9px', cursor: 'pointer',
                      background: f5SelIdx === i ? '#0d150d' : '#1a1a1a',
                      border: `1px solid ${f5SelIdx === i ? meta.color : '#2a2a2a'}`,
                      color: '#fff', transition: 'all 0.15s',
                    }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{opt.team}</div>
                        <div style={{ fontSize: '0.68rem', color: '#555', marginTop: '0.1rem' }}>{opt.label}</div>
                      </div>
                      <div style={{ fontWeight: 'bold', color: opt.odds < 0 ? '#00ff88' : '#ff9944' }}>{formatOdds(opt.odds)}</div>
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => setF5Modal(null)} style={{ flex: 1, padding: '0.85rem', background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: '#888', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                <button
                  disabled={!sel}
                  onClick={() => sel && confirmF5Pick({ ...sel, sport, gameId: game.id, home: game.home_team, away: game.away_team, date: todayKey, result: null })}
                  style={{ flex: 2, padding: '0.85rem', borderRadius: '8px', fontWeight: 'bold', cursor: sel ? 'pointer' : 'not-allowed', background: sel ? meta.color : '#222', border: 'none', color: sel ? '#000' : '#555', transition: 'all 0.15s' }}
                >
                  Lock {meta.short} ⚡
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}