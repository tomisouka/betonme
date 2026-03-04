import React, { useState, useEffect } from 'react'
import { getTodayKey, ensureAmerican, formatOdds } from '../utils/odds.js'
import { STORAGE_KEYS, loadPropPick, savePropPick } from '../hooks/useSaveData.js'
import TodoBox from '../components/TodoBox.jsx'
import PropSection, { ODDS_API_PROP_MARKETS, PROP_MARKET_LABELS, MARKET_ORDER } from '../components/PropSection.jsx'

const API_KEY = '9556a1b199876f898bdc45023a854ed2'

export default function PropsTab({ todayLock, allGames }) {
  const todayKey = getTodayKey()

  const [propPick, setPropPick] = useState({})
  const [propModal, setPropModal] = useState(null)
  const [selectedSide, setSelectedSide] = useState(null)
  const [propLines, setPropLines] = useState([])
  const [propsLoading, setPropsLoading] = useState(false)
  const [propsFetched, setPropsFetched] = useState(false)
  const [propsError, setPropsError] = useState(null)
  const [renderError, setRenderError] = useState(null)

  const todayTeamPicks = propPick[todayKey] || {}

  useEffect(() => { loadPropPick().then(p => setPropPick(p || {})) }, [])

  const pickedTeams = {}
  Object.entries(todayTeamPicks).forEach(([team, pick]) => {
    if (pick?.player) pickedTeams[team] = `${pick.player}|${pick.marketKey}`
  })

  const SPORT_KEY_MAP = { NBA: 'basketball_nba', MLB: 'baseball_mlb', NFL: 'americanfootball_nfl' }
  const sportLabel = todayLock?.sport || null
  const sportKey = sportLabel ? SPORT_KEY_MAP[sportLabel] : null
  const eventId = todayLock?.gameId || null
  const propsCacheKey = `${todayKey}_${eventId}`

  async function fetchProps(force = false) {
    if (!eventId || !sportKey || !sportLabel) return
    if (!force) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.PROPS_DAY_CACHE)
        if (raw) {
          const cache = JSON.parse(raw)
          if (cache[propsCacheKey]) {
            const cached = cache[propsCacheKey].lines || []
            const lockGame = allGames.find(g => g.id === eventId)
            const homeTeam = lockGame?.home_team || todayLock?.home || ''
            const awayTeam = lockGame?.away_team || todayLock?.away || ''
            const hasTeams = cached.length === 0 || (cached[0].team && cached[0].team !== '')
            if (hasTeams) {
              setPropLines(cached)
              setPropsFetched(true)
              return
            }
            const byMarket = {}
            cached.forEach(l => {
              if (!byMarket[l.marketKey]) byMarket[l.marketKey] = []
              byMarket[l.marketKey].push(l)
            })
            const retagged = []
            Object.entries(byMarket).forEach(([, mLines]) => {
              mLines.sort((a, b) => b.line - a.line)
              const half = Math.ceil(mLines.length / 2)
              mLines.forEach((l, i) => { l.team = i < half ? homeTeam : awayTeam; retagged.push(l) })
            })
            cache[propsCacheKey].lines = retagged
            localStorage.setItem(STORAGE_KEYS.PROPS_DAY_CACHE, JSON.stringify(cache))
            setPropLines(retagged)
            setPropsFetched(true)
            return
          }
        }
      } catch {}
    }
    setPropsLoading(true)
    setPropsError(null)
    try {
      const markets = (ODDS_API_PROP_MARKETS[sportLabel] || []).join(',')
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${eventId}/odds?apiKey=${API_KEY}&regions=us&markets=${markets}&oddsFormat=american&bookmakers=draftkings`
      const res = await fetch(url)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setPropsError(err.message || `Error ${res.status}`)
        setPropsLoading(false)
        setPropsFetched(true)
        return
      }
      const data = await res.json()
      const lines = []
      const bm = data.bookmakers?.[0]
      const lockGame = allGames.find(g => g.id === eventId)
      const homeTeam = lockGame?.home_team || todayLock?.home || ''
      const awayTeam = lockGame?.away_team || todayLock?.away || ''

      if (bm) {
        bm.markets?.forEach(market => {
          const label = PROP_MARKET_LABELS[market.key]
          if (!label) return
          const byPlayer = {}
          market.outcomes?.forEach(o => {
            const player = o.description || 'Unknown'
            if (!byPlayer[player]) byPlayer[player] = {}
            byPlayer[player][o.name.toLowerCase()] = { price: ensureAmerican(o.price), point: o.point }
          })
          Object.entries(byPlayer).forEach(([player, sides]) => {
            if (!sides.over && !sides.under) return
            const line = sides.over?.point ?? sides.under?.point
            if (line == null) return
            lines.push({
              player, marketKey: market.key, label, line,
              overOdds: sides.over?.price ?? -110,
              underOdds: sides.under?.price ?? -110,
              team: '',
            })
          })
        })
      }

      const byMarket = {}
      lines.forEach(l => {
        if (!byMarket[l.marketKey]) byMarket[l.marketKey] = []
        byMarket[l.marketKey].push(l)
      })
      const taggedLines = []
      Object.entries(byMarket).forEach(([, mLines]) => {
        mLines.sort((a, b) => b.line - a.line)
        const half = Math.ceil(mLines.length / 2)
        mLines.forEach((l, i) => { l.team = i < half ? homeTeam : awayTeam; taggedLines.push(l) })
      })

      try {
        const raw = localStorage.getItem(STORAGE_KEYS.PROPS_DAY_CACHE)
        const cache = raw ? JSON.parse(raw) : {}
        cache[propsCacheKey] = { lines: taggedLines, fetchedAt: Date.now() }
        localStorage.setItem(STORAGE_KEYS.PROPS_DAY_CACHE, JSON.stringify(cache))
      } catch {}

      setPropLines(taggedLines)
    } catch (e) {
      setPropsError('Failed to fetch props — check your connection.')
    }
    setPropsLoading(false)
    setPropsFetched(true)
  }

  useEffect(() => {
    if (todayLock && !propsFetched && !propsLoading) fetchProps(false)
  }, [todayLock])

  function openPropModal(prop) {
    setSelectedSide(null)
    setPropModal(prop)
  }

  async function confirmPropPick() {
    if (!propModal || !selectedSide) return
    const updated = {
      ...propPick,
      [todayKey]: {
        ...todayTeamPicks,
        [propModal.team]: {
          player: propModal.player,
          marketKey: propModal.marketKey,
          label: propModal.label,
          line: propModal.line,
          side: selectedSide,
          odds: selectedSide === 'over' ? propModal.overOdds : propModal.underOdds,
          sport: sportLabel,
          team: propModal.team,
          result: null,
        }
      }
    }
    await savePropPick(updated)
    setPropPick(updated)
    setPropModal(null)
    setSelectedSide(null)
  }

  const marketOrder = MARKET_ORDER[sportLabel] || []
  const groupedProps = marketOrder.map(mKey => ({
    marketKey: mKey,
    label: PROP_MARKET_LABELS[mKey],
    props: propLines.filter(p => p.marketKey === mKey).sort((a, b) => b.line - a.line),
  })).filter(g => g.props.length > 0)

  const lockGame = allGames.find(g => g.id === eventId)
  const homeTeam = lockGame?.home_team || todayLock?.home || ''
  const awayTeam = lockGame?.away_team || todayLock?.away || ''

  const ml = lockGame?.bookmakers?.[0]?.markets?.find(m => m.key === 'h2h')
  const teamColorMap = {}
  if (ml?.outcomes) {
    ml.outcomes.forEach(o => {
      teamColorMap[o.name] = ensureAmerican(o.price) < 0 ? '#00ff88' : '#ff9944'
    })
  }

  if (renderError) return (
    <div style={{ padding: '2rem', color: '#ff4444' }}>
      <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>⚠ Props failed to render</div>
      <div style={{ fontSize: '0.8rem', color: '#555' }}>{renderError}</div>
      <button onClick={() => { setRenderError(null); setPropLines([]); setPropsFetched(false) }} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#222', border: '1px solid #444', borderRadius: '6px', color: '#aaa', cursor: 'pointer' }}>Reset Props</button>
    </div>
  )

  return (
    <div>
      {propModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: '14px', padding: '2rem', width: '100%', maxWidth: '420px' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem' }}>🎲 Confirm Prop Pick</h2>
            <p style={{ color: '#555', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
              One prop per team · <span style={{ color: '#8888ff' }}>{propModal.team}</span>
            </p>
            <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.3rem' }}>{propModal.label}</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>{propModal.player}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff' }}>Line: {propModal.line}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {['over', 'under'].map(side => (
                <button key={side} onClick={() => setSelectedSide(side)} style={{
                  flex: 1, padding: '1rem', borderRadius: '10px', cursor: 'pointer',
                  background: selectedSide === side ? (side === 'over' ? '#0a2a1a' : '#2a0a1a') : '#1a1a1a',
                  border: `1px solid ${selectedSide === side ? (side === 'over' ? '#00ff88' : '#ff4488') : '#333'}`,
                  color: side === 'over' ? '#00ff88' : '#ff4488',
                  fontWeight: 'bold', fontSize: '0.95rem', transition: 'all 0.15s',
                }}>
                  <div>{side === 'over' ? '⬆ Over' : '⬇ Under'}</div>
                  <div style={{ fontSize: '1.1rem', marginTop: '0.3rem' }}>{propModal.line}</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '0.2rem', opacity: 0.8 }}>
                    {formatOdds(side === 'over' ? propModal.overOdds : propModal.underOdds)}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setPropModal(null)} style={{ flex: 1, padding: '0.85rem', background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: '#888', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button onClick={confirmPropPick} disabled={!selectedSide} style={{
                flex: 2, padding: '0.85rem',
                background: selectedSide ? '#8888ff' : '#222', border: 'none', borderRadius: '8px',
                color: selectedSide ? '#000' : '#555',
                cursor: selectedSide ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '1rem', transition: 'all 0.15s'
              }}>Lock Prop 🎲</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: '#aaa' }}>🎲 PROPS</h2>
        <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>One prop per team per day — from your lock game.</p>
        <TodoBox items={["Player team color coordination (fav/dog) needs real roster API — heuristic player split is unreliable."]} />
      </div>

      {!todayLock && (
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔒</div>
          <div style={{ color: '#555', fontSize: '0.88rem' }}>Make your Lock of the Day first — props are pulled from that game.</div>
        </div>
      )}

      {todayLock && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#555' }}>
              {sportLabel} · {todayLock.home} vs {todayLock.away}
            </div>
            {propsFetched && !propsLoading && (
              <button onClick={() => fetchProps(true)} style={{ padding: '0.35rem 0.85rem', background: '#222', color: '#aaa', border: '1px solid #333', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' }}>
                🔄 Refresh
              </button>
            )}
          </div>

          {Object.keys(todayTeamPicks).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {[homeTeam, awayTeam].filter(Boolean).map(team => {
                const pick = todayTeamPicks[team]
                if (!pick) return null
                return (
                  <div key={team} style={{
                    background: '#111',
                    border: `1px solid ${pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#8888ff44'}`,
                    borderRadius: '10px', padding: '0.85rem 1.1rem',
                  }}>
                    <div style={{ fontSize: '0.65rem', color: '#8888ff', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                      🎲 {team.toUpperCase()} PROP
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{pick.player}</div>
                        <div style={{ color: '#555', fontSize: '0.75rem' }}>
                          {pick.label} · {pick.side === 'over' ? '⬆ Over' : '⬇ Under'} {pick.line}
                        </div>
                      </div>
                      <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#8888ff' }}>{formatOdds(pick.odds)}</div>
                    </div>
                    {pick.result === null && <div style={{ marginTop: '0.4rem', color: '#555', fontSize: '0.73rem' }}>⏳ Pending...</div>}
                    {pick.result === 'W' && <div style={{ marginTop: '0.35rem', color: '#00ff88', fontWeight: 'bold', fontSize: '0.85rem' }}>✅ WIN</div>}
                    {pick.result === 'L' && <div style={{ marginTop: '0.35rem', color: '#ff4444', fontWeight: 'bold', fontSize: '0.85rem' }}>❌ LOSS</div>}
                  </div>
                )
              })}
            </div>
          )}

          {propsLoading && <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#555' }}>⏳ Fetching props...</div>}

          {propsError && (
            <div style={{ background: '#2a0a0a', border: '1px solid #ff444433', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
              <div style={{ color: '#ff4444', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>⚠ Props unavailable</div>
              <div style={{ color: '#555', fontSize: '0.78rem' }}>{propsError}</div>
              <button onClick={() => fetchProps(true)} style={{ marginTop: '0.75rem', padding: '0.4rem 1rem', background: '#222', color: '#aaa', border: '1px solid #333', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>Try again</button>
            </div>
          )}

          {propsFetched && !propsLoading && !propsError && propLines.length === 0 && (
            <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.25rem' }}>
              <div style={{ fontWeight: 'bold', color: '#888', marginBottom: '0.25rem' }}>No prop lines available yet.</div>
              <div style={{ color: '#444', fontSize: '0.78rem' }}>Props typically drop a few hours before game time. Check back soon.</div>
            </div>
          )}

          {propLines.length > 0 && (
            <div>
              {groupedProps.map((group, i) => (
                <PropSection
                  key={group.marketKey}
                  marketKey={group.marketKey}
                  label={group.label}
                  props={group.props}
                  pickedTeams={pickedTeams}
                  onPick={openPropModal}
                  defaultOpen={i === 0}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  teamColorMap={teamColorMap}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
