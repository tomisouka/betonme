import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatOdds, getSportsInSeason, getGameDateLabel, fetchMlbProbablePitchers, getProbablePitcher } from '../utils/odds.js'

function getGameStatus(game) {
  // ESPN status is now embedded directly in the game object
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
    let periodLabel = period ? `P${period}` : ''
    if (sport === 'NBA') periodLabel = period ? `Q${period}` : ''
    if (sport === 'NFL') periodLabel = period ? `Q${period}` : ''
    if (sport === 'MLB') periodLabel = period ? `Inn ${period}` : ''
    const s = game.espnScores
    const scoreLabel = s ? `${game.away_team.split(' ').pop()} ${s.away} – ${game.home_team.split(' ').pop()} ${s.home}` : null
    const timePart = [periodLabel, clock].filter(Boolean).join(' ')
    return { state: 'in', label: [timePart, scoreLabel].filter(Boolean).join(' · ') || 'In Progress' }
  }
  return { state: 'pre', label: null }
}

const SPORT_TABS = ['ALL', 'NBA', 'MLB', 'NFL']

const SPORT_COLORS = {
  NBA: '#c89b3c',
  MLB: '#4c9be8',
  NFL: '#7ac96f',
  ALL: '#00ff88',
}

function FinalGamesSection({ games, renderGame }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0.5rem',
        }}
      >
        <span style={{ fontSize: '0.65rem', color: '#444', fontWeight: 'bold', letterSpacing: '0.08em' }}>
          ✓ FINAL · {games.length} game{games.length !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: '0.6rem', color: '#333' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {games.map(g => renderGame(g))}
        </div>
      )}
    </div>
  )
}

export default function GamesTab({ allGames, loading, onRefresh, cacheAge }) {
  const [selectedGame, setSelectedGame] = useState(null)
  const [market, setMarket] = useState('h2h')
  const [statusLoading, setStatusLoading] = useState(false)
  const [sportTab, setSportTab] = useState('ALL')
  const [mlbPitchers, setMlbPitchers] = useState({})

  // Auto-select first available sport tab based on what's in allGames
  useEffect(() => {
    if (!allGames.length) return
    const available = new Set(allGames.map(g => g.sportLabel))
    if (sportTab !== 'ALL' && !available.has(sportTab)) {
      setSportTab(available.size ? [...available][0] : 'ALL')
    }
    if (available.has('MLB')) {
      fetchMlbProbablePitchers().then(map => setMlbPitchers(map))
    }
  }, [allGames])

  const availableSports = new Set(allGames.map(g => g.sportLabel))
  const visibleTabs = SPORT_TABS.filter(t => t === 'ALL' || availableSports.has(t))

  const filteredGames = (sportTab === 'ALL'
    ? allGames
    : allGames.filter(g => g.sportLabel === sportTab)
  ).slice().sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))

  // Split games into today, tomorrow, later — using LOCAL date
  const localDateStr = (isoStr) => {
    const d = new Date(isoStr)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  const now = new Date()
  const todayStr    = localDateStr(now.toISOString())
  const tomorrowStr = localDateStr(new Date(now.getTime() + 86400000).toISOString())

  const todayGames    = filteredGames.filter(g => localDateStr(g.commence_time) === todayStr)
  const tomorrowGames = filteredGames.filter(g => localDateStr(g.commence_time) === tomorrowStr)
  const laterGames    = filteredGames.filter(g => localDateStr(g.commence_time) > tomorrowStr)

  const chartData = (() => {
    if (!selectedGame) return []
    const bm = selectedGame.bookmakers?.[0]
    if (!bm) return []
    const m = bm.markets?.find(m => m.key === market)
    if (!m) return []
    return m.outcomes.map(o => ({ team: o.name, odds: o.price, point: o.point }))
  })()

  const accentColor = SPORT_COLORS[sportTab] || '#00ff88'

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', color: '#aaa' }}>🎮 GAMES</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {cacheAge && <span style={{ color: '#555', fontSize: '0.75rem' }}>updated {cacheAge} · auto-refreshes every 8h</span>}

        </div>
      </div>

      {/* Today/Total summary pills */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.45rem 0.9rem', display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
          <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: accentColor, lineHeight: 1 }}>{todayGames.length}</span>
          <span style={{ fontSize: '0.68rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today</span>
        </div>
        {(tomorrowGames.length + laterGames.length) > 0 && (
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.45rem 0.9rem', display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
            <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#4c9be8', lineHeight: 1 }}>{tomorrowGames.length}</span>
            <span style={{ fontSize: '0.68rem', color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tomorrow</span>
          </div>
        )}
        <div style={{ background: '#1a1a1a', border: '1px solid #1e1e1e', borderRadius: '8px', padding: '0.45rem 0.9rem', display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
          <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#333', lineHeight: 1 }}>{filteredGames.length}</span>
          <span style={{ fontSize: '0.68rem', color: '#333', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
        </div>
      </div>

      {visibleTabs.length > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
          {visibleTabs.map(t => {
            const isActive = sportTab === t
            const color = SPORT_COLORS[t] || '#00ff88'
            return (
              <button
                key={t}
                onClick={() => { setSportTab(t); setSelectedGame(null) }}
                style={{
                  padding: '0.35rem 0.9rem',
                  background: isActive ? color : '#1a1a1a',
                  color: isActive ? '#000' : '#888',
                  border: `1px solid ${isActive ? color : '#333'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: isActive ? 'bold' : 'normal',
                  fontSize: '0.8rem',
                  transition: 'all 0.15s',
                }}
              >
                {t}
              </button>
            )
          })}
        </div>
      )}

      {loading && <p style={{ color: '#888' }}>Fetching odds...</p>}
      {/* Diagnostic warning if MLB expected but missing */}
      {!loading && availableSports.size > 0 && !availableSports.has('MLB') && (() => {
        const month = new Date().getMonth() + 1
        const day = new Date().getDate()
        if ((month === 3 && day >= 20) || (month >= 4 && month <= 10)) {
          return (
            <div style={{ padding: '0.6rem 0.9rem', background: '#1a1200', border: '1px solid #554400', borderRadius: '6px', color: '#aa8800', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
              ⚠️ MLB is in season but no games were returned — the bookmaker may not have posted lines yet, or the cache is stale. Try <strong>Refresh</strong>.
            </div>
          )
        }
        return null
      })()}

      <div style={{ marginBottom: '2rem' }}>
        {!loading && filteredGames.length === 0 && (
          <p style={{ color: '#555' }}>No {sportTab === 'ALL' ? '' : sportTab + ' '}games found.</p>
        )}
        {(() => {
          function renderGame(game) {
            const bm = game.bookmakers?.[0]
            const ml = bm?.markets?.find(m => m.key === 'h2h')
            const sp = bm?.markets?.find(m => m.key === 'spreads')
          const status = getGameStatus(game)
          const isLive = status?.state === 'in'
          const isFinal = status?.state === 'post'
          const isUnavailable = isLive || isFinal
          const sportColor = SPORT_COLORS[game.sportLabel] || '#aaa'
          const isMlb = game.sportLabel === 'MLB'
          const awayPitcher = isMlb ? getProbablePitcher(game.away_team, mlbPitchers) : null
          const homePitcher = isMlb ? getProbablePitcher(game.home_team, mlbPitchers) : null

          return (
            <div key={game.id} onClick={() => setSelectedGame(game)} style={{
              padding: '1rem', borderRadius: '8px', cursor: 'pointer',
              background: selectedGame?.id === game.id ? '#1a3a2a' : '#1a1a1a',
              border: `1px solid ${selectedGame?.id === game.id ? accentColor : isLive ? '#ff994444' : isFinal ? '#33333388' : '#2a2a2a'}`,
              opacity: isFinal ? 0.55 : 1,
              position: 'relative',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ color: sportColor, fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>{game.sportLabel}</span>
                  {isMlb ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div><strong>{game.away_team}</strong></div>
                        <div style={{ fontSize: '0.65rem', color: awayPitcher ? '#4c9be8' : '#333', marginTop: '0.1rem' }}>⚾ {awayPitcher || 'TBA'}</div>
                      </div>
                      <span style={{ color: '#444', fontSize: '0.8rem' }}>@</span>
                      <div style={{ textAlign: 'center' }}>
                        <div><strong>{game.home_team}</strong></div>
                        <div style={{ fontSize: '0.65rem', color: homePitcher ? '#4c9be8' : '#333', marginTop: '0.1rem' }}>⚾ {homePitcher || 'TBA'}</div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <strong>{game.home_team}</strong>
                      <span style={{ color: '#555', margin: '0 0.25rem' }}>vs</span>
                      <strong>{game.away_team}</strong>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {isLive && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', padding: '0.15rem 0.55rem', background: '#2a1500', border: '1px solid #ff994466', borderRadius: '4px', color: '#ff9944' }}>
                      🔴 LIVE · {status.label}
                    </span>
                  )}
                  {isFinal && (() => {
                    const score = game.espnScores
                    return (
                      <span style={{ fontSize: '0.7rem', fontWeight: 'bold', padding: '0.15rem 0.65rem', background: '#1a1a1a', border: '1px solid #33333388', borderRadius: '4px', color: '#555' }}>
                        {score ? `${game.away_team.split(' ').pop()} ${score.away} – ${game.home_team.split(' ').pop()} ${score.home}` : `✓ ${status.label}`}
                      </span>
                    )
                  })()}
                  <span style={{ color: '#555', fontSize: '0.8rem' }}>
                    {getGameDateLabel(game.commence_time)}
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
        }  // end renderGame

        const hasAny = todayGames.length + tomorrowGames.length + laterGames.length > 0
        return (
          <>
            {!loading && !hasAny && (
              <p style={{ color: '#555' }}>No {sportTab === 'ALL' ? '' : sportTab + ' '}games found.</p>
            )}

            {/* TODAY — live + upcoming only */}
            {(() => {
              const activeTodayGames = todayGames.filter(g => {
                const state = g.espnStatus?.type?.state
                const completed = g.espnStatus?.type?.completed
                return !completed && state !== 'post'
              })
              const finalTodayGames = todayGames.filter(g => {
                const state = g.espnStatus?.type?.state
                const completed = g.espnStatus?.type?.completed
                return completed || state === 'post'
              })
              return (
                <>
                  {activeTodayGames.length > 0 && (
                    <>
                      <div style={{ fontSize: '0.65rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                        📅 TODAY · {activeTodayGames.length} game{activeTodayGames.length !== 1 ? 's' : ''}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
                        {activeTodayGames.map(g => renderGame(g))}
                      </div>
                    </>
                  )}

                  {/* FINALS — collapsed by default */}
                  {finalTodayGames.length > 0 && (
                    <FinalGamesSection games={finalTodayGames} renderGame={renderGame} />
                  )}
                </>
              )
            })()}

            {/* TOMORROW */}
            {tomorrowGames.length > 0 && (
              <>
                <div style={{ fontSize: '0.65rem', color: '#4c9be8', fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  🌅 TOMORROW · {tomorrowGames.length} game{tomorrowGames.length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: laterGames.length > 0 ? '1.5rem' : 0 }}>
                  {tomorrowGames.map(g => renderGame(g))}
                </div>
              </>
            )}

            {/* LATER */}
            {laterGames.length > 0 && (
              <>
                <div style={{ fontSize: '0.65rem', color: '#444', fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  📆 LATER · {laterGames.length} game{laterGames.length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {laterGames.map(g => renderGame(g))}
                </div>
              </>
            )}
          </>
        )
        })()}
      </div>

      {selectedGame && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {['h2h', 'spreads'].map(m => (
              <button key={m} onClick={() => setMarket(m)} style={{
                padding: '0.4rem 1rem',
                background: market === m ? accentColor : '#222',
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
                <Bar dataKey="odds" fill={accentColor} radius={[4, 4, 0, 0]}
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