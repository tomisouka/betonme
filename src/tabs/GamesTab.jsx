import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatOdds, getSportsInSeason } from '../utils/odds.js'
import TodoBox from '../components/TodoBox.jsx'

const ESPN_ENDPOINTS = {
  NBA: 'basketball/nba',
  NFL: 'football/nfl',
  MLB: 'baseball/mlb',
}

// Returns { state: 'pre'|'in'|'post', label: string } for a game given ESPN events
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
  const state = status.type?.state   // 'pre' | 'in' | 'post'
  const completed = status.type?.completed

  if (completed || state === 'post') {
    // Show winner if available
    const comps = match.competitions?.[0]?.competitors || []
    const winner = comps.find(c => c.winner)
    const scores = comps.map(c => `${c.team.abbreviation} ${c.score}`).join(' · ')
    return { state: 'post', label: scores ? `Final · ${scores}` : 'Final' }
  }
  if (state === 'in') {
    const clock = status.displayClock
    const period = status.period
    const sport = game.sportLabel
    let periodLabel = period ? `P${period}` : ''
    if (sport === 'NBA') periodLabel = period ? `Q${period}` : ''
    if (sport === 'NFL') periodLabel = period ? `Q${period}` : ''
    if (sport === 'MLB') periodLabel = period ? `Inn ${period}` : ''
    return { state: 'in', label: [periodLabel, clock].filter(Boolean).join(' · ') || 'In Progress' }
  }
  return { state: 'pre', label: null }
}

export default function GamesTab({ allGames, loading, onRefresh, cacheAge }) {
  const [selectedGame, setSelectedGame] = useState(null)
  const [market, setMarket] = useState('h2h')
  const [espnByLeague, setEspnByLeague] = useState({})  // { NBA: [...events], ... }
  const [statusLoading, setStatusLoading] = useState(false)

  useEffect(() => {
    if (!allGames.length) return
    fetchEspnStatuses()
  }, [allGames])

  async function fetchEspnStatuses() {
    setStatusLoading(true)
    const sports = getSportsInSeason()
    const result = {}
    await Promise.all(sports.map(async sport => {
      const endpoint = ESPN_ENDPOINTS[sport.label]
      if (!endpoint) return
      try {
        const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${endpoint}/scoreboard?dates=${today}`)
        const data = await res.json()
        result[sport.label] = data.events || []
      } catch (e) {
        console.error(`[ESPN status] ${sport.label} failed`, e)
      }
    }))
    setEspnByLeague(result)
    setStatusLoading(false)
  }

  const chartData = (() => {
    if (!selectedGame) return []
    const bm = selectedGame.bookmakers?.[0]
    if (!bm) return []
    const m = bm.markets?.find(m => m.key === market)
    if (!m) return []
    return m.outcomes.map(o => ({ team: o.name, odds: o.price, point: o.point }))
  })()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', color: '#aaa' }}>🎮 GAMES</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {cacheAge && <span style={{ color: '#555', fontSize: '0.8rem' }}>Last fetched: {cacheAge}</span>}
          <button onClick={onRefresh} style={{ padding: '0.4rem 1rem', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>🔄 Refresh</button>
        </div>
      </div>
      <TodoBox items={[
        "Show each team's last 7-day ML/spread win/loss record per game card (needs historical odds + results API — candidates: SportsDataIO, ActionNetwork, paid the-odds-api tier)",
      ]} />

      {loading && <p style={{ color: '#888' }}>Fetching odds...</p>}
      {statusLoading && <p style={{ color: '#555', fontSize: '0.8rem' }}>⏳ Checking game statuses...</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '2rem' }}>
        {allGames.map(game => {
          const bm = game.bookmakers?.[0]
          const ml = bm?.markets?.find(m => m.key === 'h2h')
          const sp = bm?.markets?.find(m => m.key === 'spreads')
          const espnEvents = espnByLeague[game.sportLabel]
          const status = getGameStatus(game, espnEvents)
          const isLive = status?.state === 'in'
          const isFinal = status?.state === 'post'
          const isUnavailable = isLive || isFinal

          return (
            <div key={game.id} onClick={() => setSelectedGame(game)} style={{
              padding: '1rem', borderRadius: '8px', cursor: 'pointer',
              background: selectedGame?.id === game.id ? '#1a3a2a' : '#1a1a1a',
              border: `1px solid ${selectedGame?.id === game.id ? '#00ff88' : isLive ? '#ff994444' : isFinal ? '#33333388' : '#2a2a2a'}`,
              opacity: isFinal ? 0.55 : 1,
              position: 'relative',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#555', fontSize: '0.75rem', marginRight: '0.5rem' }}>{game.sportLabel}</span>
                  <strong>{game.home_team}</strong>
                  <span style={{ color: '#555', margin: '0 0.5rem' }}>vs</span>
                  <strong>{game.away_team}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {isLive && (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 'bold', padding: '0.15rem 0.55rem',
                      background: '#2a1500', border: '1px solid #ff994466',
                      borderRadius: '4px', color: '#ff9944',
                    }}>
                      🔴 LIVE · {status.label}
                    </span>
                  )}
                  {isFinal && (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 'bold', padding: '0.15rem 0.55rem',
                      background: '#1a1a1a', border: '1px solid #33333388',
                      borderRadius: '4px', color: '#555',
                    }}>
                      ✓ {status.label}
                    </span>
                  )}
                  <span style={{ color: '#555', fontSize: '0.8rem' }}>
                    {new Date(game.commence_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              {ml && (
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
                  <span style={{ color: '#666' }}>ML:</span>
                  {ml.outcomes.map(o => (
                    <span key={o.name} style={{ color: isUnavailable ? '#444' : (o.price < 0 ? '#00ff88' : '#ff9944') }}>
                      {o.name} <strong>{formatOdds(o.price)}</strong>
                    </span>
                  ))}
                  {sp && <>
                    <span style={{ color: '#666', marginLeft: '1rem' }}>SP:</span>
                    {sp.outcomes.map(o => (
                      <span key={o.name} style={{ color: isUnavailable ? '#444' : '#aaa' }}>
                        {o.name} <strong>{o.point > 0 ? `+${o.point}` : o.point} ({formatOdds(o.price)})</strong>
                      </span>
                    ))}
                  </>}
                </div>
              )}
            </div>
          )
        })}
        {!loading && allGames.length === 0 && <p style={{ color: '#555' }}>No games found.</p>}
      </div>

      {selectedGame && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {['h2h', 'spreads'].map(m => (
              <button key={m} onClick={() => setMarket(m)} style={{
                padding: '0.4rem 1rem',
                background: market === m ? '#00ff88' : '#222',
                color: market === m ? '#000' : '#fff',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem'
              }}>{m === 'h2h' ? 'Moneyline' : 'Spread'}</button>
            ))}
          </div>
          <h3 style={{ marginBottom: '1rem' }}>{selectedGame.away_team} vs {selectedGame.home_team}</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <XAxis dataKey="team" stroke="#aaa" tick={{ fontSize: 12 }} />
                <YAxis stroke="#aaa" />
                <Tooltip
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #333' }}
                  formatter={(val, _, props) => [`${formatOdds(val)}${props.payload.point !== undefined ? ` (${props.payload.point > 0 ? '+' : ''}${props.payload.point})` : ''}`, 'Odds']}
                />
                <Bar dataKey="odds" fill="#00ff88" radius={[4, 4, 0, 0]}
                  label={{ position: 'top', formatter: formatOdds, fill: '#fff', fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: '#555' }}>No {market === 'h2h' ? 'moneyline' : 'spread'} data for this game.</p>
          )}
        </div>
      )}
    </div>
  )
}