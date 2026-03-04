import React, { useState, useEffect } from 'react'
import { getTodayKey, ensureAmerican, formatOdds, combineParlayOdds } from '../utils/odds.js'
import { loadPredictions, savePredictions, loadLayHistory, saveLayHistory, loadOuPick, saveOuPick } from '../hooks/useSaveData.js'
import TodoBox from '../components/TodoBox.jsx'
import ParlaySection from '../components/ParlaySection.jsx'

export default function ParlaysTab({ allGames, loading, todayLock, todayDog, onLockChange }) {
  const todayKey = getTodayKey()

  const [predictionsHistory, setPredictionsHistory] = useState({})
  const [layHistoryState, setLayHistoryState] = useState({})

  const todayPredictions = predictionsHistory[todayKey] || null
  const todayLay = layHistoryState[todayKey] || null

  const [selectedGames, setSelectedGames] = useState([])
  const [selectedTeams, setSelectedTeams] = useState({})
  const [predictionsLocked, setPredictionsLocked] = useState(false)
  const [layRemovedGames, setLayRemovedGames] = useState([])
  const [layLocked, setLayLocked] = useState(false)

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
        predToday.legs.forEach(l => { if (!l.isLock) map[l.gameId] = l.team })
        setSelectedTeams(map)
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
      return { gameId: game.id, home: game.home_team, away: game.away_team, sport: game.sportLabel, team: team || null, isLock, isDog, result: null }
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
      return { gameId: game.id, home: game.home_team, away: game.away_team, sport: game.sportLabel, team: team || null, isLock, isDog, result: null }
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
      const ESPN_ENDPOINTS = { MLB: 'baseball/mlb', NFL: 'football/nfl', NBA: 'basketball/nba' }
      let changed = false
      for (const [date, entry] of Object.entries(hist)) {
        if (!entry.legs) continue
        const allResolved = entry.legs.every(l => l.result !== null)
        if (allResolved) continue
        for (let i = 0; i < entry.legs.length; i++) {
          const leg = entry.legs[i]
          if (leg.result !== null || !leg.team) continue
          const endpoint = ESPN_ENDPOINTS[leg.sport]
          if (!endpoint) continue
          try {
            const dateStr = date.replace(/-/g, '')
            const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${endpoint}/scoreboard?dates=${dateStr}`)
            const data = await res.json()
            const event = (data.events || []).find(e =>
              (e.competitions?.[0]?.competitors || []).some(c =>
                leg.home?.toLowerCase().includes(c.team.displayName.toLowerCase()) ||
                c.team.displayName.toLowerCase().includes(leg.home?.toLowerCase())
              )
            )
            if (!event) continue
            const comp = event.competitions?.[0]
            if (!comp?.status?.type?.completed) continue
            const winner = comp.competitors?.find(c => c.winner)
            if (!winner) continue
            const winnerName = winner.team.displayName
            const won = winnerName.toLowerCase().includes(leg.team.toLowerCase()) || leg.team.toLowerCase().includes(winnerName.toLowerCase())
            hist[date].legs[i].result = won ? 'W' : 'L'
            changed = true
          } catch(e) { console.error('[Predictions resolve]', e) }
        }
        const resolvedLegs = hist[date].legs.filter(l => l.result !== null)
        if (resolvedLegs.length === hist[date].legs.length && resolvedLegs.length > 0) {
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
  }, [])

  useEffect(() => {
    async function resolveLay() {
      const hist = await loadLayHistory()
      const ESPN_ENDPOINTS = { MLB: 'baseball/mlb', NFL: 'football/nfl', NBA: 'basketball/nba' }
      let changed = false
      for (const [date, entry] of Object.entries(hist)) {
        if (!entry || !entry.legs) continue
        const allResolved = entry.legs.every(l => l.result !== null)
        if (allResolved && entry.overallResult) continue
        for (let i = 0; i < entry.legs.length; i++) {
          const leg = entry.legs[i]
          if (leg.result !== null || !leg.team) continue
          const endpoint = ESPN_ENDPOINTS[leg.sport]
          if (!endpoint) continue
          try {
            const dateStr = date.replace(/-/g, '')
            const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${endpoint}/scoreboard?dates=${dateStr}`)
            const data = await res.json()
            const event = (data.events || []).find(e =>
              (e.competitions?.[0]?.competitors || []).some(c =>
                leg.home?.toLowerCase().includes(c.team.displayName.toLowerCase()) ||
                c.team.displayName.toLowerCase().includes(leg.home?.toLowerCase())
              )
            )
            if (!event) continue
            const comp = event.competitions?.[0]
            if (!comp?.status?.type?.completed) continue
            const winner = comp.competitors?.find(c => c.winner)
            if (!winner) continue
            const winnerName = winner.team.displayName
            const won = winnerName.toLowerCase().includes(leg.team.toLowerCase()) || leg.team.toLowerCase().includes(winnerName.toLowerCase())
            hist[date].legs[i].result = won ? 'W' : 'L'
            changed = true
          } catch(e) { console.error('[Lay resolve]', e) }
        }
        const resolvedLegs = hist[date].legs.filter(l => l.result !== null)
        if (resolvedLegs.length === hist[date].legs.length && resolvedLegs.length > 0 && !hist[date].overallResult) {
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
  }, [])

  const yesterdayKey = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()
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
        <TodoBox items={[
          "Dog of the day leg ordering — should always appear as leg 2 (after lock) in predictions slip.",
          "Dog pick should auto-tag as isDog on predictions when picked same day — currently requires re-locking predictions.",
          "Game matchup display — always show away team on left, home team on right (e.g. Hornets vs Celtics).",
          "Show individual leg odds on the lay slip so the user can see which leg added the most value.",
        ]} />
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
        <TodoBox items={["Add a 'Yesterday' tab inside Predictions showing the user's selections from the previous day."]} />

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
                todayPredictions.legs.map((leg, i) => (
                  <div key={leg.gameId} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a1a',
                    border: `1px solid ${leg.result === 'W' ? '#00ff8844' : leg.result === 'L' ? '#ff444444' : leg.isLock ? '#00ff8844' : leg.isDog ? '#ff994444' : '#2a2a2a'}`,
                    borderRadius: '8px', padding: '0.75rem 1rem',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: leg.isLock ? '#00ff88' : leg.isDog ? '#ff9944' : '#8888ff', fontWeight: 'bold', marginBottom: '0.15rem' }}>
                        {leg.isLock ? '🔒 LOCK' : leg.isDog ? '🐕 DOG' : `LEG ${i + 1}`} · {leg.sport}
                      </div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{leg.team || '—'}</div>
                      <div style={{ color: '#555', fontSize: '0.72rem' }}>{leg.away} vs {leg.home}</div>
                    </div>
                    <div style={{ fontSize: '1.2rem' }}>{leg.result === 'W' ? '✅' : leg.result === 'L' ? '❌' : '⏳'}</div>
                  </div>
                ))
              ) : (
                allGames.map(game => {
                  const bm = game.bookmakers?.[0]
                  const ml = bm?.markets?.find(m => m.key === 'h2h')
                  const isLockGame = game.id === lockGameId
                  const isDogGame = game.id === dogGameId && !isLockGame
                  const isAutoIncluded = isLockGame || isDogGame
                  const isSelected = isAutoIncluded || selectedGames.includes(game.id)
                  const chosenTeam = isLockGame ? todayLock?.team : isDogGame ? todayDog?.team : selectedTeams[game.id]
                  return (
                    <div key={game.id} style={{ borderRadius: '8px', overflow: 'hidden', border: `1px solid ${isLockGame ? '#00ff8844' : isDogGame ? '#ff994444' : isSelected ? '#2a2a2a' : '#1a1a1a'}`, transition: 'all 0.15s' }}>
                      <div
                        onClick={() => {
                          if (predictionsLocked || isAutoIncluded) return
                          if (isSelected) { setSelectedGames(s => s.filter(id => id !== game.id)); setSelectedTeams(t => { const n = {...t}; delete n[game.id]; return n }) }
                          else { setSelectedGames(s => [...s, game.id]) }
                        }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isSelected ? '#1a1a1a' : '#111', padding: '0.75rem 1rem', cursor: predictionsLocked || isAutoIncluded ? 'default' : 'pointer' }}
                      >
                        <div>
                          <div style={{ fontSize: '0.65rem', color: isLockGame ? '#00ff88' : isDogGame ? '#ff9944' : '#555', marginBottom: '0.15rem', fontWeight: isAutoIncluded ? 'bold' : 'normal' }}>
                            {isLockGame ? '🔒 LOCK GAME · ' : isDogGame ? '🐕 DOG GAME · ' : ''}{game.sportLabel}
                          </div>
                          <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                            {game.away_team} <span style={{ color: '#333' }}>vs</span> {game.home_team}
                          </div>
                          {chosenTeam && (
                            <div style={{ fontSize: '0.72rem', color: isLockGame ? '#00ff88' : isDogGame ? '#ff9944' : '#00ff88', marginTop: '0.15rem', fontWeight: 'bold' }}>
                              ✓ {chosenTeam}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '1.1rem' }}>{isLockGame ? '🔒' : isDogGame ? '🐕' : isSelected ? '✕' : '➕'}</div>
                      </div>
                      {isSelected && !predictionsLocked && !isAutoIncluded && ml && (
                        <div style={{ display: 'flex', borderTop: '1px solid #222' }}>
                          {ml.outcomes.map(o => {
                            const odds = ensureAmerican(o.price)
                            const isChosen = chosenTeam === o.name
                            return (
                              <button key={o.name} onClick={(e) => { e.stopPropagation(); setSelectedTeams(t => ({ ...t, [game.id]: o.name })) }} style={{
                                flex: 1, padding: '0.6rem 0.5rem', border: 'none',
                                background: isChosen ? (odds < 0 ? '#0a2a1a' : '#2a1a0a') : '#141414',
                                color: isChosen ? (odds < 0 ? '#00ff88' : '#ff9944') : '#444',
                                cursor: 'pointer', fontSize: '0.8rem', fontWeight: isChosen ? 'bold' : 'normal',
                                borderRight: '1px solid #1a1a1a', transition: 'all 0.15s',
                              }}>
                                {o.name} <span style={{ opacity: 0.7 }}>{formatOdds(odds)}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
            {!predictionsLocked && predictionsSlip.length >= 2 && (
              <div style={{ background: '#0a2a1a', border: '1px solid #00ff8833', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#555', fontSize: '0.78rem' }}>{predictionsSlip.length} legs</span>
                  <span style={{ fontWeight: 'bold', color: '#00ff88', fontSize: '1.1rem' }}>
                    {(() => { const o = calcSlipOdds(predictionsSlip); return o ? formatOdds(o) : '—' })()}
                  </span>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', color: '#555' }}>{predictionsSlip.length} game{predictionsSlip.length !== 1 ? 's' : ''} in slip</span>
              {!predictionsLocked ? (
                <button disabled={predictionsSlip.length < 2} onClick={lockPredictions} style={{
                  padding: '0.6rem 1.25rem', borderRadius: '7px', fontWeight: 'bold', fontSize: '0.85rem',
                  background: predictionsSlip.length >= 2 ? '#00ff88' : '#222',
                  color: predictionsSlip.length >= 2 ? '#000' : '#555',
                  border: 'none', cursor: predictionsSlip.length >= 2 ? 'pointer' : 'not-allowed',
                }}>Lock In Predictions 🔒</button>
              ) : (
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
                todayLay.legs.map((leg, i) => (
                  <div key={leg.gameId} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a1a',
                    border: `1px solid ${leg.result === 'W' ? '#00ff8844' : leg.result === 'L' ? '#ff444444' : leg.isLock ? '#00ff8844' : leg.isDog ? '#ff994444' : '#8888ff44'}`,
                    borderRadius: '8px', padding: '0.75rem 1rem',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: leg.isLock ? '#00ff88' : leg.isDog ? '#ff9944' : '#8888ff', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                        {leg.isLock ? '🔒 LOCK' : leg.isDog ? '🐕 DOG' : `LEG ${i + 1}`}
                      </div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{leg.team || '—'}</div>
                      <div style={{ color: '#555', fontSize: '0.72rem' }}>{leg.away} vs {leg.home}</div>
                    </div>
                    <div style={{ fontSize: '1.2rem' }}>{leg.result === 'W' ? '✅' : leg.result === 'L' ? '❌' : '⏳'}</div>
                  </div>
                ))
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
                      background: isRemoved ? '#111' : '#1a1a1a',
                      border: `1px solid ${isRemoved ? '#1a1a1a' : isLockGame ? '#00ff8844' : isDogGame ? '#ff994444' : '#2a2a2a'}`,
                      borderRadius: '8px', padding: '0.75rem 1rem',
                      opacity: isRemoved ? 0.3 : 1,
                      cursor: (isLockGame || isDogGame || (!canRemove && !isRemoved) || (!canAdd && isRemoved)) ? 'default' : 'pointer',
                      transition: 'all 0.15s',
                    }}>
                      <div>
                        <div style={{ fontSize: '0.65rem', color: isLockGame ? '#00ff88' : isDogGame ? '#ff9944' : '#8888ff', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                          {isLockGame ? '🔒 LOCK' : isDogGame ? '🐕 DOG' : isRemoved ? 'REMOVED' : `LEG ${legNum}`}
                        </div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{pickedOutcome?.name || '—'}</div>
                        <div style={{ color: '#555', fontSize: '0.72rem' }}>{game.away_team} vs {game.home_team}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ fontWeight: 'bold', color: pickedOutcome && ensureAmerican(pickedOutcome.price) < 0 ? '#00ff88' : '#ff9944', fontSize: '1rem' }}>
                          {pickedOutcome ? formatOdds(ensureAmerican(pickedOutcome.price)) : '—'}
                        </div>
                        <div style={{ fontSize: '1.1rem' }}>
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
    </div>
  )
}
