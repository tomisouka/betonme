import React, { useState } from 'react'
import { getSportsInSeason, ensureAmerican, formatOdds } from '../utils/odds.js'

const API_KEY = '9556a1b199876f898bdc45023a854ed2'

const BETONLINE_SPORT_URLS = {
  NBA: 'https://www.betonline.ag/sportsbook/basketball/nba',
  MLB: 'https://www.betonline.ag/sportsbook/baseball/mlb',
  NFL: 'https://www.betonline.ag/sportsbook/football/nfl',
}

export default function LiveTab({ todayLock, todayDog }) {
  const [liveData, setLiveData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  async function fetchLive() {
    setLoading(true)
    try {
      const sports = getSportsInSeason()
      const results = []
      for (const sport of sports) {
        const res = await fetch(
          `https://api.the-odds-api.com/v4/sports/${sport.key}/odds/?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&bookmakers=betonlineag&oddsFormat=american`
        )
        const data = await res.json()
        if (Array.isArray(data)) data.forEach(g => results.push({ ...g, sportLabel: sport.label }))
      }
      setLiveData(results)
    } catch (e) {
      console.error('Live fetch error', e)
    }
    setLoading(false)
    setFetched(true)
  }

  const sortedGames = (() => {
    if (!liveData) return []
    const lockId = todayLock?.gameId
    const dogId = todayDog?.gameId
    return [...liveData].sort((a, b) => {
      const aScore = a.id === lockId ? 0 : a.id === dogId ? 1 : 2
      const bScore = b.id === lockId ? 0 : b.id === dogId ? 1 : 2
      return aScore - bScore
    })
  })()

  return (
    <div>
      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: '#aaa' }}>⚡ LIVE PICKS</h2>
        <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>
          On-demand live lines — your lock and dog are pinned at the top.
        </p>
      </div>

      {!fetched && !loading && (
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <button onClick={fetchLive} style={{
            padding: '1rem 2.5rem', background: '#00ff88', border: 'none',
            borderRadius: '10px', color: '#000', fontWeight: 'bold',
            fontSize: '1rem', cursor: 'pointer',
          }}>⚡ Fetch Live Lines</button>
          <div style={{ color: '#333', fontSize: '0.78rem', marginTop: '0.75rem' }}>Pulls fresh odds right now — not cached</div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#888' }}>⚡ Fetching live lines...</div>
      )}

      {fetched && !loading && liveData && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ color: '#555', fontSize: '0.8rem' }}>{liveData.length} games · fetched just now</span>
            <button onClick={fetchLive} style={{ padding: '0.4rem 1rem', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' }}>🔄 Refresh</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {sortedGames.map(game => {
              const bm = game.bookmakers?.[0]
              const ml = bm?.markets?.find(m => m.key === 'h2h')
              const sp = bm?.markets?.find(m => m.key === 'spreads')
              const ou = bm?.markets?.find(m => m.key === 'totals')
              const isLock = game.id === todayLock?.gameId
              const isDog = game.id === todayDog?.gameId && !isLock
              const isHighlighted = isLock || isDog
              const betOnlineUrl = BETONLINE_SPORT_URLS[game.sportLabel]

              return (
                <div key={game.id} style={{
                  background: isLock ? '#0d2a1a' : isDog ? '#2a1a0a' : '#1a1a1a',
                  border: `1px solid ${isLock ? '#00ff8855' : isDog ? '#ff994455' : '#2a2a2a'}`,
                  borderRadius: '10px', padding: '1rem 1.25rem',
                }}>
                  {isHighlighted && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                      <div style={{
                        fontSize: '0.65rem', fontWeight: 'bold', letterSpacing: '0.05em',
                        color: isLock ? '#00ff88' : '#ff9944',
                        background: isLock ? '#00ff8815' : '#ff994415',
                        border: `1px solid ${isLock ? '#00ff8833' : '#ff994433'}`,
                        borderRadius: '4px', padding: '0.15rem 0.5rem',
                        display: 'inline-block',
                      }}>
                        {isLock ? '🔒 YOUR LOCK' : '🐕 YOUR DOG'}
                      </div>
                      {betOnlineUrl && (
                        <a href={betOnlineUrl} target="_blank" rel="noopener noreferrer" style={{
                          fontSize: '0.72rem', color: '#8888ff', fontWeight: 'bold',
                          textDecoration: 'none', padding: '0.2rem 0.6rem',
                          border: '1px solid #8888ff44', borderRadius: '5px',
                          background: '#8888ff11',
                        }}>
                          View on BetOnline ↗
                        </a>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div>
                      <span style={{ color: '#555', fontSize: '0.72rem', marginRight: '0.5rem' }}>{game.sportLabel}</span>
                      <strong>{game.home_team}</strong>
                      <span style={{ color: '#444', margin: '0 0.4rem' }}>vs</span>
                      <strong>{game.away_team}</strong>
                    </div>
                    <span style={{ color: '#444', fontSize: '0.78rem' }}>
                      {new Date(game.commence_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.82rem', flexWrap: 'wrap' }}>
                    {ml && ml.outcomes.map(o => (
                      <span key={o.name} style={{ color: ensureAmerican(o.price) < 0 ? '#00ff88' : '#ff9944' }}>
                        {o.name} <strong>{formatOdds(ensureAmerican(o.price))}</strong>
                      </span>
                    ))}
                    {sp && sp.outcomes.map(o => (
                      <span key={o.name} style={{ color: '#8888ff' }}>
                        {o.name} <strong>{o.point > 0 ? '+' : ''}{o.point}</strong>
                      </span>
                    ))}
                    {ou && <span style={{ color: '#aaa' }}>
                      O/U <strong>{ou.outcomes[0]?.point}</strong>
                    </span>}
                  </div>

                  {(isLock || isDog) && (
                    <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid #ffffff0a', fontSize: '0.75rem', color: '#555' }}>
                      {isLock && <span>Your pick: <strong style={{ color: '#00ff88' }}>{todayLock.team}</strong> · {todayLock.market === 'h2h' ? 'ML' : `Spread ${todayLock.point > 0 ? '+' : ''}${todayLock.point}`} {formatOdds(todayLock.odds)}</span>}
                      {isDog && <span>Your dog: <strong style={{ color: '#ff9944' }}>{todayDog.team}</strong> · ML {formatOdds(todayDog.odds)}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
