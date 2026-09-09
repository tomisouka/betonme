import React, { useState, useEffect } from 'react'
import { getTodayKey, ensureAmerican, formatOdds, calcProfit, getGameDateLabel, fetchEspnDate } from '../utils/odds.js'
import { loadSuperDogState, saveSuperDogState } from '../hooks/useSaveData.js'
import SportFilter, { filterBySport } from '../components/SportFilter.jsx'
import { getTeamLogoUrl, LOGO_STYLE } from '../utils/teamLogos.js'

const SUPERDOG_MIN_ODDS = 200  // +200 minimum to qualify as a super dog

export default function SuperDogTab({ allGames, loading, onSuperDogChange }) {
  const [sdState, setSdState]       = useState({})
  const [sdModal, setSdModal]       = useState(null)
  const [modalMarket, setModalMarket] = useState('ml')  // 'ml' | 'spread'
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sportTab, setSportTab]     = useState('ALL')

  const todayKey  = getTodayKey()
  const todayPick = sdState.picks?.[todayKey]

  async function saveState(s) {
    setSdState({ ...s })
    await saveSuperDogState(s)
  }

  // ── Load + resolve past picks ───────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const s = (await loadSuperDogState()) || {}
      setSdState(s)
    }
    init()
  }, [])

  useEffect(() => {
    async function resolve() {
      const s = await loadSuperDogState()
      if (!s.picks) return
      const pending = Object.entries(s.picks).filter(([, p]) => p.result === null || p.result === undefined)
      if (!pending.length) return

      for (const [date, pick] of pending) {
        if (!pick.sport) continue
        try {
          const events = await fetchEspnDate(pick.sport, date.replace(/-/g, ''))
          const homeLower = pick.home?.toLowerCase() || ''
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
          const winner = comp.competitors?.find(c => c.winner)
          if (!winner) continue
          const wnL    = winner.team.displayName.toLowerCase()
          const pickL  = pick.team.toLowerCase()
          const pickLast = pickL.split(' ').pop()
          const won = wnL.includes(pickL) || pickL.includes(wnL) ||
            (pickLast.length > 3 && wnL.includes(pickLast))
          const result = won ? 'W' : 'L'
          s.picks[date].result = result

          const prev = s.sdStreak || { type: null, count: 0, since: null }
          if (prev.type === result) {
            s.sdStreak = { type: result, count: prev.count + 1, since: prev.since }
          } else {
            s.sdStreak = { type: result, count: 1, since: date }
          }
        } catch (e) { console.error('SuperDog resolve error', e) }
      }
      await saveSuperDogState(s)
      setSdState({ ...s })
      if (onSuperDogChange) onSuperDogChange()
    }
    resolve()
    const interval = setInterval(resolve, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // ── Pick modal ──────────────────────────────────────────────────────────────
  function openModal(dog) {
    if (todayPick) return
    setModalMarket('ml')
    setSdModal(dog)
  }

  async function confirmPick() {
    if (!sdModal) return
    const dog = sdModal
    const useSpread = modalMarket === 'spread' && dog.spread !== null

    const s = (await loadSuperDogState()) || {}
    s.picks = s.picks || {}
    s.picks[todayKey] = {
      team:    dog.team,
      odds:    useSpread ? dog.spreadOdds : dog.mlOdds,
      market:  useSpread ? 'spread' : 'ml',
      point:   useSpread ? dog.spread : null,
      home:    dog.home,
      away:    dog.away,
      sport:   dog.sport,
      gameId:  dog.gameId,
      result:  null,
      isSuperDog: true,
    }
    await saveState(s)
    setSdModal(null)
    onSuperDogChange && onSuperDogChange()
  }

  // ── Build super dogs list ───────────────────────────────────────────────────
  const superdogs = []

  filterBySport(allGames, sportTab).forEach(game => {
    const bm = game.bookmakers?.[0]
    const ml = bm?.markets?.find(m => m.key === 'h2h')
    const sp = bm?.markets?.find(m => m.key === 'spreads')
    if (!ml) return

    ml.outcomes.forEach(outcome => {
      const odds = ensureAmerican(outcome.price)
      if (odds >= SUPERDOG_MIN_ODDS) {
        const opponent   = ml.outcomes.find(o => o.name !== outcome.name)
        const spreadOut  = sp?.outcomes.find(o => o.name === outcome.name)
        superdogs.push({
          team:         outcome.name,
          opponent:     opponent?.name || '???',
          opponentOdds: opponent ? ensureAmerican(opponent.price) : null,
          mlOdds:       odds,
          spread:       spreadOut ? spreadOut.point : null,
          spreadOdds:   spreadOut ? ensureAmerican(spreadOut.price) : null,
          sport:        game.sportLabel,
          gameTime:     game.commence_time,
          home:         game.home_team,
          away:         game.away_team,
          gameId:       game.id,
          awayPitcher:  game.pitchers?.away || null,
          homePitcher:  game.pitchers?.home || null,
        })
      }
    })
  })

  superdogs.sort((a, b) => {
    const toDateStr = iso => {
      const d = new Date(iso)
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    }
    const dayA = toDateStr(a.gameTime)
    const dayB = toDateStr(b.gameTime)
    if (dayA !== dayB) return dayA < dayB ? -1 : 1
    return b.mlOdds - a.mlOdds
  })

  // ── Stats ───────────────────────────────────────────────────────────────────
  const picks      = sdState.picks || {}
  const allResults = Object.values(picks).filter(p => p.result).map(p => p.result)
  const wins       = allResults.filter(r => r === 'W').length
  const losses     = allResults.filter(r => r === 'L').length
  const sdStreak   = sdState.sdStreak || null
  const fmtDate    = d => { if (!d) return null; const [,mm,dd] = d.split('-'); return `${mm}/${dd}` }

  // ── Date grouping ───────────────────────────────────────────────────────────
  const localDateStr = iso => {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  const now          = new Date()
  const todayStr     = localDateStr(now.toISOString())
  const tomorrowStr  = localDateStr(new Date(now.getTime() + 86400000).toISOString())
  const todayDogs    = superdogs.filter(d => localDateStr(d.gameTime) === todayStr)
  const tomorrowDogs = superdogs.filter(d => localDateStr(d.gameTime) === tomorrowStr)
  const laterDogs    = superdogs.filter(d => localDateStr(d.gameTime) > tomorrowStr)

  // ── Styles ──────────────────────────────────────────────────────────────────
  const PURPLE       = '#b44fff'
  const PURPLE_DIM   = '#7a2ab8'
  const PURPLE_BG    = '#1a0a2a'
  const PURPLE_BORDER = '#b44fff55'

  const SectionHeader = ({ emoji, label, color, count }) => (
    <div style={{ fontSize: '0.65rem', color, fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {emoji} {label} <span style={{ color: '#444', fontWeight: 'normal' }}>· {count} super dog{count !== 1 ? 's' : ''}</span>
    </div>
  )

  let globalIdx = 0

  const renderCard = dog => {
    const i = globalIdx++
    const isHome    = dog.home === dog.team
    const isPicked  = todayPick?.team === dog.team && todayPick?.home === dog.home
    const isSelected = !!todayPick && isPicked
    const borderColor = isSelected ? PURPLE : (todayPick && !isPicked) ? '#1a1a1a' : PURPLE_BORDER
    const bgColor     = isSelected ? '#2a0a3a' : (todayPick && !isPicked) ? '#111' : PURPLE_BG
    const opacity     = todayPick && !isPicked ? 0.45 : 1

    return (
      <div
        key={`${dog.gameId}-${dog.team}`}
        onClick={() => !todayPick && openModal(dog)}
        style={{
          background: bgColor, border: `1px solid ${borderColor}`,
          borderRadius: '12px', padding: '1.25rem',
          cursor: todayPick ? 'default' : 'pointer',
          opacity, transition: 'opacity 0.2s, border-color 0.2s',
          position: 'relative',
        }}
      >
        {isSelected && (
          <div style={{
            position: 'absolute', top: '0.75rem', right: '0.75rem',
            background: PURPLE, color: '#000', fontSize: '0.65rem',
            fontWeight: 'bold', borderRadius: '4px', padding: '0.15rem 0.5rem',
          }}>✓ YOUR PICK</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: dog.sport === 'MLB' ? '0.3rem' : '0.75rem' }}>
          <div style={{ fontSize: '0.72rem', color: '#555' }}>
            {dog.sport} · {getGameDateLabel(dog.gameTime)}
          </div>
          <div style={{
            background: '#00000044', border: `1px solid ${PURPLE_BORDER}`,
            borderRadius: '5px', padding: '0.15rem 0.5rem',
            fontSize: '0.68rem', color: PURPLE, fontWeight: 'bold', letterSpacing: '0.05em',
          }}>#{i + 1} ⚡ SUPER DOG</div>
        </div>

        {dog.sport === 'MLB' && (() => {
          const awayP = dog.awayPitcher
          const homeP = dog.homePitcher
          return (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', background: '#0d1a2a', border: '1px solid #1a3a5a', borderRadius: '5px', padding: '0.2rem 0.6rem' }}>
              <span style={{ fontSize: '0.6rem', color: '#4c9be8' }}>⚾</span>
              <span style={{ fontSize: '0.62rem', color: '#4c9be855' }}>{dog.away.split(' ').pop()}:</span>
              <span style={{ fontSize: '0.62rem', color: awayP ? '#7ab8e8' : '#3a6a8a', fontWeight: awayP ? 'bold' : 'normal' }}>{awayP || 'TBA'}</span>
              <span style={{ fontSize: '0.55rem', color: '#1a3a5a' }}>·</span>
              <span style={{ fontSize: '0.62rem', color: '#4c9be855' }}>{dog.home.split(' ').pop()}:</span>
              <span style={{ fontSize: '0.62rem', color: homeP ? '#7ab8e8' : '#3a6a8a', fontWeight: homeP ? 'bold' : 'normal' }}>{homeP || 'TBA'}</span>
            </div>
          )
        })()}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.68rem', color: PURPLE, fontWeight: 'bold', marginBottom: '0.2rem' }}>⚡ SUPER DOG · {isHome ? 'HOME' : 'AWAY'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {getTeamLogoUrl(dog.team, dog.sport) && <img src={getTeamLogoUrl(dog.team, dog.sport)} style={{ ...LOGO_STYLE, width: '26px', height: '26px' }} alt="" />}
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{dog.team}</div>
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: PURPLE }}>{formatOdds(dog.mlOdds)}</div>
          </div>
          <div style={{ color: '#333', fontWeight: 'bold', fontSize: '0.85rem' }}>VS</div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: '0.68rem', color: '#555', fontWeight: 'bold', marginBottom: '0.2rem' }}>FAVORITE · {isHome ? 'AWAY' : 'HOME'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#777' }}>{dog.opponent}</div>
              {getTeamLogoUrl(dog.opponent, dog.sport) && <img src={getTeamLogoUrl(dog.opponent, dog.sport)} style={{ ...LOGO_STYLE, width: '26px', height: '26px' }} alt="" />}
            </div>
            {dog.opponentOdds && <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: '#00ff88' }}>{formatOdds(dog.opponentOdds)}</div>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', background: '#00000033', borderRadius: '8px', padding: '0.65rem 0.9rem' }}>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#555', marginBottom: '0.15rem' }}>1 coin →</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: PURPLE }}>+{calcProfit(dog.mlOdds, 1)} profit</div>
          </div>
          <div>
            <div style={{ fontSize: '0.68rem', color: '#555', marginBottom: '0.15rem' }}>5 coins →</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: PURPLE }}>+{calcProfit(dog.mlOdds, 5)} profit</div>
          </div>
          {dog.spread !== null && (
            <div>
              <div style={{ fontSize: '0.68rem', color: '#555', marginBottom: '0.15rem' }}>Spread</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#8888ff' }}>{dog.spread > 0 ? '+' : ''}{dog.spread} ({formatOdds(dog.spreadOdds)})</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>

      {/* ── History popout ── */}
      {historyOpen && (() => {
        const pastPicks = Object.entries(picks)
          .filter(([date]) => date !== todayKey && picks[date]?.result !== undefined)
          .sort(([a], [b]) => b.localeCompare(a))
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
            onClick={() => setHistoryOpen(false)}>
            <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '14px 14px 0 0', padding: '1.5rem 1.25rem', width: '100%', maxWidth: '480px', maxHeight: '80vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 'bold', color: PURPLE }}>⚡ Super Dog History</div>
                  <div style={{ fontSize: '0.72rem', color: '#444', marginTop: '0.15rem' }}>{wins}W – {losses}L · {wins + losses > 0 ? Math.round(wins / (wins + losses) * 100) : 0}% win rate</div>
                </div>
                <button onClick={() => setHistoryOpen(false)} style={{ background: 'transparent', border: '1px solid #2a2a2a', borderRadius: '6px', color: '#555', cursor: 'pointer', padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}>✕ Close</button>
              </div>
              {pastPicks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#333', fontSize: '0.85rem' }}>No past picks yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {pastPicks.map(([date, pick]) => {
                    const [, mm, dd] = date.split('-')
                    const lineLabel = pick.market === 'spread' && pick.point != null
                      ? `Spread ${pick.point > 0 ? '+' : ''}${pick.point}`
                      : 'ML'
                    return (
                      <div key={date} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: pick.result === 'W' ? '#0a2a1a' : pick.result === 'L' ? '#2a0a0a' : '#1a1a1a',
                        border: `1px solid ${pick.result === 'W' ? '#00ff8833' : pick.result === 'L' ? '#ff444433' : '#2a2a2a'}`,
                        borderRadius: '9px', padding: '0.7rem 0.9rem',
                      }}>
                        <div>
                          <div style={{ fontSize: '0.6rem', color: '#444', marginBottom: '0.15rem' }}>
                            {mm}/{dd} · {pick.sport} · {lineLabel}
                          </div>
                          <div style={{ fontWeight: 'bold', fontSize: '0.88rem', color: pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#aaa' }}>
                            {pick.team}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#444', marginTop: '0.1rem' }}>
                            {(pick.away || '').split(' ').pop()} @ {(pick.home || '').split(' ').pop()}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                          <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: PURPLE }}>{formatOdds(pick.odds)}</div>
                          <div style={{ fontSize: '1.1rem' }}>
                            {pick.result === 'W' ? '✅' : pick.result === 'L' ? '❌' : '⏳'}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Pick confirm modal ── */}
      {sdModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#141414', border: `1px solid ${PURPLE_BORDER}`, borderRadius: '14px', padding: '2rem', width: '100%', maxWidth: '420px' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem', color: PURPLE }}>⚡ Confirm Super Dog</h2>
            <p style={{ color: '#555', fontSize: '0.8rem', marginBottom: '1.5rem' }}>One super dog per day — +{SUPERDOG_MIN_ODDS} or better</p>

            <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '0.4rem' }}>{sdModal.sport}</div>
              <div style={{ fontWeight: 'bold', fontSize: '1.05rem', marginBottom: '0.25rem' }}>{sdModal.team}</div>
              <div style={{ color: '#555', fontSize: '0.82rem' }}>{sdModal.home} vs {sdModal.away}</div>
            </div>

            {/* ML / Spread toggle */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#555', marginBottom: '0.5rem', fontWeight: 'bold', letterSpacing: '0.06em' }}>PICK LINE</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setModalMarket('ml')}
                  style={{
                    flex: 1, padding: '0.7rem',
                    background: modalMarket === 'ml' ? PURPLE_BG : 'transparent',
                    border: `1px solid ${modalMarket === 'ml' ? PURPLE : '#2a2a2a'}`,
                    borderRadius: '8px', cursor: 'pointer',
                    color: modalMarket === 'ml' ? PURPLE : '#555',
                    fontWeight: 'bold', fontSize: '0.85rem',
                  }}
                >
                  Moneyline<br />
                  <span style={{ fontSize: '1.1rem', color: modalMarket === 'ml' ? PURPLE : '#555' }}>{formatOdds(sdModal.mlOdds)}</span>
                </button>
                {sdModal.spread !== null && (
                  <button
                    onClick={() => setModalMarket('spread')}
                    style={{
                      flex: 1, padding: '0.7rem',
                      background: modalMarket === 'spread' ? '#0a0a2a' : 'transparent',
                      border: `1px solid ${modalMarket === 'spread' ? '#8888ff' : '#2a2a2a'}`,
                      borderRadius: '8px', cursor: 'pointer',
                      color: modalMarket === 'spread' ? '#8888ff' : '#555',
                      fontWeight: 'bold', fontSize: '0.85rem',
                    }}
                  >
                    {sdModal.sport === 'MLB' ? 'Run Line' : 'Spread'}<br />
                    <span style={{ fontSize: '0.95rem' }}>{sdModal.spread > 0 ? '+' : ''}{sdModal.spread}</span>
                    <span style={{ fontSize: '0.8rem', marginLeft: '0.3rem' }}>({formatOdds(sdModal.spreadOdds)})</span>
                  </button>
                )}
              </div>
            </div>

            <div style={{ background: '#1a0a2a', border: `1px solid ${PURPLE_BORDER}`, borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: '0.82rem', color: '#888' }}>
              No coins at stake — purely for tracking your super dog record and streak.
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setSdModal(null)} style={{ flex: 1, padding: '0.85rem', background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: '#888', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button onClick={confirmPick} style={{ flex: 2, padding: '0.85rem', background: PURPLE, border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>Back the Super Dog ⚡</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: PURPLE }}>⚡ SUPER DOG OF THE DAY</h2>
          {(wins + losses) > 0 && (
            <button onClick={() => setHistoryOpen(true)} style={{
              background: 'transparent', border: '1px solid #2a2a2a', borderRadius: '7px',
              color: '#555', cursor: 'pointer', padding: '0.3rem 0.75rem',
              fontSize: '0.68rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.35rem',
            }}>
              📋 History <span style={{ color: wins > losses ? '#00ff88' : '#ff4444' }}>{wins}W–{losses}L</span>
            </button>
          )}
        </div>
        <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>
          +{SUPERDOG_MIN_ODDS} or better only — the big swings. One pick per day.
        </p>
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        {[
          { label: 'SUPER DOG RECORD', value: `${wins}W - ${losses}L`, color: '#aaa' },
          {
            label: 'SUPER DOG STREAK',
            value: sdStreak ? `${sdStreak.type === 'W' ? '🔥' : '❄'} ${sdStreak.count} ${sdStreak.type}` : 'None yet',
            sub: sdStreak?.since ? `since ${fmtDate(sdStreak.since)}` : null,
            color: sdStreak ? (sdStreak.type === 'W' ? '#00ff88' : '#ff4444') : '#555',
          },
        ].map(stat => (
          <div key={stat.label} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '0.85rem 1.25rem', textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '0.72rem', color: '#555', marginBottom: '0.3rem' }}>{stat.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: stat.color }}>{stat.value}</div>
            {stat.sub && <div style={{ fontSize: '0.68rem', color: '#555', marginTop: '0.2rem' }}>{stat.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Today's pick banner ── */}
      {todayPick && (
        <div style={{
          background: '#1a0a2a', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.5rem',
          border: `1px solid ${todayPick.result === 'W' ? '#00ff88' : todayPick.result === 'L' ? '#ff4444' : PURPLE_BORDER}`,
        }}>
          <div style={{ fontSize: '0.7rem', color: PURPLE, fontWeight: 'bold', marginBottom: '0.35rem' }}>⚡ TODAY'S SUPER DOG PICK</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {getTeamLogoUrl(todayPick.team, todayPick.sport) && <img src={getTeamLogoUrl(todayPick.team, todayPick.sport)} style={{ ...LOGO_STYLE, width: '30px', height: '30px' }} alt="" />}
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{todayPick.team}</div>
                <div style={{ color: '#555', fontSize: '0.78rem' }}>
                  {todayPick.home} vs {todayPick.away} · {todayPick.sport}
                  {todayPick.market === 'spread' && todayPick.point != null &&
                    <span style={{ color: '#8888ff', marginLeft: '0.4rem' }}>· {todayPick.sport === 'MLB' ? 'Run Line' : 'Spread'} {todayPick.point > 0 ? '+' : ''}{todayPick.point}</span>
                  }
                </div>
              </div>
            </div>
            <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: PURPLE }}>{formatOdds(todayPick.odds)}</div>
          </div>
          {todayPick.result === null && <div style={{ marginTop: '0.6rem', color: '#555', fontSize: '0.78rem' }}>⏳ Pending result...</div>}
          {todayPick.result === 'W' && <div style={{ marginTop: '0.5rem', color: '#00ff88', fontWeight: 'bold' }}>✅ WIN</div>}
          {todayPick.result === 'L' && <div style={{ marginTop: '0.5rem', color: '#ff4444', fontWeight: 'bold' }}>❌ LOSS</div>}
        </div>
      )}

      {loading && <p style={{ color: '#888' }}>Hunting for super dogs...</p>}

      <SportFilter games={allGames} value={sportTab} onChange={setSportTab} label="super dog" />

      {/* ── No super dogs empty state ── */}
      {!loading && superdogs.length === 0 && (
        <div style={{
          background: PURPLE_BG, border: `1px solid ${PURPLE_BORDER}`,
          borderRadius: '12px', padding: '2.5rem 2rem', textAlign: 'center', marginTop: '1rem',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚡</div>
          <div style={{ fontSize: '1rem', fontWeight: 'bold', color: PURPLE, marginBottom: '0.5rem' }}>No Super Dogs Today</div>
          <div style={{ fontSize: '0.82rem', color: '#555' }}>
            No teams with +{SUPERDOG_MIN_ODDS} or better odds right now.<br />Check back when more lines are posted.
          </div>
        </div>
      )}

      {/* ── Dog cards ── */}
      {superdogs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {todayDogs.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <SectionHeader emoji="📅" label="TODAY" color="#00ff88" count={todayDogs.length} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {todayDogs.map(renderCard)}
              </div>
            </div>
          )}
          {tomorrowDogs.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <SectionHeader emoji="🌅" label="TOMORROW" color="#4c9be8" count={tomorrowDogs.length} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {tomorrowDogs.map(renderCard)}
              </div>
            </div>
          )}
          {laterDogs.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <SectionHeader emoji="📆" label="LATER" color="#444" count={laterDogs.length} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {laterDogs.map(renderCard)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
