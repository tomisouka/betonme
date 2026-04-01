import React, { useState, useEffect } from 'react'
import { getTodayKey, ensureAmerican, formatOdds, calcProfit, getGameDateLabel, fetchEspnDate } from '../utils/odds.js'
import { loadDogState, saveDogStateServer, loadPredictions } from '../hooks/useSaveData.js'
import SportFilter, { filterBySport } from '../components/SportFilter.jsx'
import { getTeamLogoUrl, LOGO_STYLE } from '../utils/teamLogos.js'

export default function DogTab({ allGames, loading, onDogChange, todayLock }) {
  const [dogState, setDogState] = useState({})
  const [dogModal, setDogModal] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sportTab, setSportTab] = useState('ALL')

  async function saveDogState(s) {
    setDogState({ ...s })
    await saveDogStateServer(s)
  }

  const todayKey = getTodayKey()
  const todayPick = dogState.picks?.[todayKey]

  // If lock exists and is +150 or better, it IS the dog — auto-set if not already set
  const lockIsTheDog = todayLock && todayLock.odds >= 120
  const lockOdds = todayLock?.odds ?? null

  useEffect(() => {
    async function init() {
      const s = await loadDogState().then(s => s || {})
      setDogState(s)

      // if lock is +150 or better and no dog picked yet, auto-set dog = lock
      if (todayLock && todayLock.odds >= 120 && !s.picks?.[getTodayKey()]) {
        const updated = { ...s, picks: { ...(s.picks || {}) } }
        updated.picks[getTodayKey()] = {
          team: todayLock.team, odds: todayLock.odds,
          home: todayLock.home, away: todayLock.away,
          sport: todayLock.sport, gameId: todayLock.gameId,
          result: null, autoSetFromLock: true,
        }
        setDogState(updated)
        await saveDogStateServer(updated)
        onDogChange && onDogChange()
      }
    }
    init()
  }, [todayLock])

  useEffect(() => {
    async function resolve() {
      const s = await loadDogState()
      if (!s.picks) return
      const pending = Object.entries(s.picks).filter(([, p]) => p.result === null)
      if (!pending.length) return

      // First pass: try to sync result from already-graded parlay legs (fast, no network)
      try {
        const predictions = await loadPredictions()
        for (const [date, pick] of pending) {
          if (s.picks[date].result !== null) continue
          // Find a parlay entry for this date that has a graded dog leg matching this pick
          const parlayEntry = predictions[date]
          if (!parlayEntry?.legs) continue
          const dogLeg = parlayEntry.legs.find(l =>
            l.isDog && l.result !== null &&
            l.home === pick.home && l.away === pick.away &&
            l.team === pick.team
          )
          if (!dogLeg) continue
          s.picks[date].result = dogLeg.result
          const prev = s.dogStreak || { type: null, count: 0, since: null }
          if (prev.type === dogLeg.result) {
            s.dogStreak = { type: dogLeg.result, count: prev.count + 1, since: prev.since }
          } else {
            s.dogStreak = { type: dogLeg.result, count: 1, since: date }
          }
        }
      } catch(e) { console.error('Dog parlay sync error', e) }

      // Second pass: resolve any still-pending picks via ESPN
      const stillPending = Object.entries(s.picks).filter(([, p]) => p.result === null)
      for (const [date, pick] of stillPending) {
        if (!pick.sport) continue
        try {
          const events = await fetchEspnDate(pick.sport, date.replace(/-/g,''))
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
          const wnL = winner.team.displayName.toLowerCase()
          const pickL = pick.team.toLowerCase()
          const pickLast = pickL.split(' ').pop()
          const won = wnL.includes(pickL) || pickL.includes(wnL) ||
            (pickLast.length > 3 && wnL.includes(pickLast))
          const result = won ? 'W' : 'L'
          s.picks[date].result = result

          const prev = s.dogStreak || { type: null, count: 0, since: null }
          if (prev.type === result) {
            s.dogStreak = { type: result, count: prev.count + 1, since: prev.since }
          } else {
            s.dogStreak = { type: result, count: 1, since: date }
          }
        } catch(e) { console.error('Dog resolve error', e) }
      }
      await saveDogStateServer(s)
      setDogState({ ...s })
    }
    resolve()
  }, [])

  function openDogModal(dog) {
    if (todayPick) return
    setDogModal(dog)
  }

  async function confirmDogPick() {
    if (!dogModal) return
    const dog = dogModal
    const s = await loadDogState()
    s.picks = s.picks || {}
    s.picks[todayKey] = {
      team: dog.team, odds: dog.mlOdds,
      home: dog.home, away: dog.away,
      sport: dog.sport, gameId: dog.gameId, result: null,
    }
    saveDogState(s)
    setDogModal(null)
    onDogChange && onDogChange()
  }

  const underdogs = []
  const noOddsGames = []

  filterBySport(allGames, sportTab).forEach(game => {
    const bm = game.bookmakers?.[0]
    const ml = bm?.markets?.find(m => m.key === 'h2h')
    const sp = bm?.markets?.find(m => m.key === 'spreads')

    if (!ml) {
      // No odds yet — track for display
      if (game.sportLabel === 'MLB') {
        noOddsGames.push(game)
      }
      return
    }

    ml.outcomes.forEach(outcome => {
      const odds = ensureAmerican(outcome.price)
      if (odds >= 120) {
        const opponent = ml.outcomes.find(o => o.name !== outcome.name)
        const spread = sp?.outcomes.find(o => o.name === outcome.name)
        underdogs.push({
          team: outcome.name,
          opponent: opponent?.name || '???',
          opponentOdds: opponent ? ensureAmerican(opponent.price) : null,
          mlOdds: odds,
          spread: spread ? spread.point : null,
          spreadOdds: spread ? ensureAmerican(spread.price) : null,
          sport: game.sportLabel,
          gameTime: game.commence_time,
          home: game.home_team,
          away: game.away_team,
          gameId: game.id,
          // Use pitchers already embedded from ESPN normalizeEspnEvent
          awayPitcher: game.pitchers?.away || null,
          homePitcher: game.pitchers?.home || null,
        })
      }
    })
  })

  underdogs.sort((a, b) => {
    const toDateStr = (iso) => {
      const d = new Date(iso)
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    }
    const dayA = toDateStr(a.gameTime)
    const dayB = toDateStr(b.gameTime)
    if (dayA !== dayB) return dayA < dayB ? -1 : 1
    return b.mlOdds - a.mlOdds
  })

  const getTier = (odds) => {
    if (odds >= 300) return { label: 'MASSIVE DOG', color: '#ff4444', bg: '#2a0a0a', border: '#ff444466' }
    if (odds >= 120) return { label: 'BIG DOG', color: '#ff9944', bg: '#2a1a0a', border: '#ff994466' }
    return { label: 'SLIGHT DOG', color: '#ffdd44', bg: '#1f1f0a', border: '#ffdd4466' }
  }

  const dogStreak = dogState.dogStreak || null
  const picks = dogState.picks || {}
  const allResults = Object.values(picks).filter(p => p.result).map(p => p.result)
  const wins = allResults.filter(r => r === 'W').length
  const losses = allResults.filter(r => r === 'L').length

  const fmtDate = (d) => { if (!d) return null; const [,mm,dd] = d.split('-'); return `${mm}/${dd}` }

  return (
    <div>
      {/* History popout */}
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
                  <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#aaa' }}>🐕 Dog History</div>
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
                    const tier = getTier(pick.odds)
                    return (
                      <div key={date} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: pick.result === 'W' ? '#0a2a1a' : pick.result === 'L' ? '#2a0a0a' : '#1a1a1a',
                        border: `1px solid ${pick.result === 'W' ? '#00ff8833' : pick.result === 'L' ? '#ff444433' : '#2a2a2a'}`,
                        borderRadius: '9px', padding: '0.7rem 0.9rem',
                      }}>
                        <div>
                          <div style={{ fontSize: '0.6rem', color: '#444', marginBottom: '0.15rem' }}>
                            {mm}/{dd} · {pick.sport}
                          </div>
                          <div style={{ fontWeight: 'bold', fontSize: '0.88rem', color: pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#aaa' }}>
                            {pick.team}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#444', marginTop: '0.1rem' }}>
                            {(pick.away || '').split(' ').pop()} @ {(pick.home || '').split(' ').pop()}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                          <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: tier.color }}>{formatOdds(pick.odds)}</div>
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

      {dogModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: '14px', padding: '2rem', width: '100%', maxWidth: '420px' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem' }}>🐕 Confirm Your Dog</h2>
            <p style={{ color: '#555', fontSize: '0.8rem', marginBottom: '1.5rem' }}>One dog per day — back the underdog</p>

            <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '0.4rem' }}>{dogModal.sport}</div>
              <div style={{ marginBottom: '0.4rem' }}>
                <strong style={{ fontSize: '1.05rem' }}>{dogModal.team}</strong>
                <span style={{ color: '#555', fontSize: '0.85rem', marginLeft: '0.5rem' }}>Moneyline</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <div style={{ color: '#555', fontSize: '0.82rem' }}>{dogModal.home} vs {dogModal.away}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#ff9944' }}>{formatOdds(dogModal.mlOdds)}</div>
              </div>
            </div>

            <div style={{ background: '#1a1a0a', border: '1px solid #ff994433', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: '0.82rem', color: '#888' }}>
              No coins at stake — this is purely for tracking your dog record and streak.
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setDogModal(null)} style={{ flex: 1, padding: '0.85rem', background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: '#888', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button onClick={confirmDogPick} style={{ flex: 2, padding: '0.85rem', background: '#ff9944', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>Back the Dog 🐕</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: '#aaa' }}>🐕 DOG OF THE DAY</h2>
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
          Positive odds = underdog. Pick one per day — no coins, just bragging rights.
        </p>
      </div>

      {/* Gate: no lock yet */}
      {!todayLock && (
        <div style={{ background: '#1a1a0a', border: '1px solid #33330a', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔒</div>
          <div style={{ color: '#888844', fontWeight: 'bold', marginBottom: '0.25rem' }}>Lock first</div>
          <div style={{ color: '#555533', fontSize: '0.82rem' }}>You need to set your Lock of the Day before picking a dog.</div>
        </div>
      )}

      {/* Auto-dog banner: lock IS the dog */}
      {lockIsTheDog && (
        <div style={{ background: '#1a0a2a', border: '1px solid #ff994466', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#ff9944', fontWeight: 'bold', marginBottom: '0.35rem' }}>🐕 YOUR LOCK IS YOUR DOG</div>
          <div style={{ color: '#aaa', fontSize: '0.88rem' }}>
            Your lock ({todayLock.team} at {formatOdds(lockOdds)}) qualifies as today's dog — it's been automatically set.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        {[
          { label: 'DOG RECORD', value: `${wins}W - ${losses}L`, color: '#aaa' },
          {
            label: 'DOG STREAK',
            value: dogStreak ? `${dogStreak.type === 'W' ? '🔥' : '❄'} ${dogStreak.count} ${dogStreak.type}` : 'None yet',
            sub: dogStreak?.since ? `since ${fmtDate(dogStreak.since)}` : null,
            color: dogStreak ? (dogStreak.type === 'W' ? '#00ff88' : '#ff4444') : '#555',
          },
        ].map(stat => (
          <div key={stat.label} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '0.85rem 1.25rem', textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '0.72rem', color: '#555', marginBottom: '0.3rem' }}>{stat.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: stat.color }}>{stat.value}</div>
            {stat.sub && <div style={{ fontSize: '0.68rem', color: '#555', marginTop: '0.2rem' }}>{stat.sub}</div>}
          </div>
        ))}
      </div>

      {todayPick && (
        <div style={{
          background: '#111', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.5rem',
          border: `1px solid ${todayPick.result === 'W' ? '#00ff88' : todayPick.result === 'L' ? '#ff4444' : '#ff994466'}`,
        }}>
          <div style={{ fontSize: '0.7rem', color: '#ff9944', fontWeight: 'bold', marginBottom: '0.35rem' }}>🐕 TODAY'S DOG PICK</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {getTeamLogoUrl(todayPick.team, todayPick.sport) && <img src={getTeamLogoUrl(todayPick.team, todayPick.sport)} style={{ ...LOGO_STYLE, width: '30px', height: '30px' }} alt="" />}
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{todayPick.team}</div>
                <div style={{ color: '#555', fontSize: '0.78rem' }}>{todayPick.home} vs {todayPick.away} · {todayPick.sport}</div>
              </div>
            </div>
            <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#ff9944' }}>{formatOdds(todayPick.odds)}</div>
          </div>
          {todayPick.sport === 'MLB' && (() => {
            const game = allGames.find(g =>
              g.id === todayPick.gameId ||
              (g.home_team === todayPick.home && g.away_team === todayPick.away)
            )
            const awayP = game?.pitchers?.away || null
            const homeP = game?.pitchers?.home || null
            return (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem', background: '#0d1a2a', border: '1px solid #1a3a5a', borderRadius: '5px', padding: '0.18rem 0.5rem' }}>
                <span style={{ fontSize: '0.58rem', color: '#4c9be8' }}>⚾</span>
                <span style={{ fontSize: '0.6rem', color: '#4c9be855' }}>{(todayPick.away || '').split(' ').pop()}:</span>
                <span style={{ fontSize: '0.6rem', color: awayP ? '#7ab8e8' : '#3a6a8a', fontWeight: awayP ? 'bold' : 'normal' }}>{awayP || 'TBA'}</span>
                <span style={{ fontSize: '0.55rem', color: '#1a3a5a' }}>·</span>
                <span style={{ fontSize: '0.6rem', color: '#4c9be855' }}>{(todayPick.home || '').split(' ').pop()}:</span>
                <span style={{ fontSize: '0.6rem', color: homeP ? '#7ab8e8' : '#3a6a8a', fontWeight: homeP ? 'bold' : 'normal' }}>{homeP || 'TBA'}</span>
              </div>
            )
          })()}
          {todayPick.result === null && <div style={{ marginTop: '0.6rem', color: '#555', fontSize: '0.78rem' }}>⏳ Pending result...</div>}
          {todayPick.result === 'W' && <div style={{ marginTop: '0.5rem', color: '#00ff88', fontWeight: 'bold' }}>✅ WIN</div>}
          {todayPick.result === 'L' && <div style={{ marginTop: '0.5rem', color: '#ff4444', fontWeight: 'bold' }}>❌ LOSS</div>}
        </div>
      )}

      {loading && <p style={{ color: '#888' }}>Sniffing out underdogs...</p>}
      {!loading && underdogs.length === 0 && todayLock && !lockIsTheDog && <p style={{ color: '#555' }}>No underdogs found — no games loaded yet.</p>}

      <SportFilter games={allGames} value={sportTab} onChange={setSportTab} label="underdog" />

      {todayLock && !lockIsTheDog && (() => {
        const localDateStr = (iso) => {
          const d = new Date(iso)
          return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        }
        const now = new Date()
        const todayStr    = localDateStr(now.toISOString())
        const tomorrowStr = localDateStr(new Date(now.getTime() + 86400000).toISOString())

        const todayDogs    = underdogs.filter(d => localDateStr(d.gameTime) === todayStr)
        const tomorrowDogs = underdogs.filter(d => localDateStr(d.gameTime) === tomorrowStr)
        const laterDogs    = underdogs.filter(d => localDateStr(d.gameTime) > tomorrowStr)

        // Running global index for #N label
        let globalIdx = 0

        const renderDogCard = (dog) => {
          const i = globalIdx++
          const tier = getTier(dog.mlOdds)
          const isHome = dog.home === dog.team
          const isPicked = todayPick?.team === dog.team && todayPick?.home === dog.home
          const isSelected = !!todayPick && isPicked
          const borderColor = isSelected ? '#ff9944' : (todayPick && !isPicked) ? '#1a1a1a' : tier.border
          const bgColor = isSelected ? '#2a1a00' : (todayPick && !isPicked) ? '#111' : tier.bg
          const opacity = todayPick && !isPicked ? 0.45 : 1

          return (
            <div
              key={`${dog.gameId}-${dog.team}`}
              onClick={() => !todayPick && openDogModal(dog)}
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
                  background: '#ff9944', color: '#000', fontSize: '0.65rem',
                  fontWeight: 'bold', borderRadius: '4px', padding: '0.15rem 0.5rem',
                }}>✓ YOUR PICK</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: dog.sport === 'MLB' ? '0.3rem' : '0.75rem' }}>
                <div style={{ fontSize: '0.72rem', color: '#555' }}>
                  {dog.sport} · {getGameDateLabel(dog.gameTime)}
                </div>
                <div style={{
                  background: '#00000044', border: `1px solid ${tier.border}`,
                  borderRadius: '5px', padding: '0.15rem 0.5rem',
                  fontSize: '0.68rem', color: tier.color, fontWeight: 'bold', letterSpacing: '0.05em'
                }}>#{i + 1} {tier.label}</div>
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
                  <div style={{ fontSize: '0.68rem', color: tier.color, fontWeight: 'bold', marginBottom: '0.2rem' }}>UNDERDOG · {isHome ? 'HOME' : 'AWAY'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {getTeamLogoUrl(dog.team, dog.sport) && <img src={getTeamLogoUrl(dog.team, dog.sport)} style={{ ...LOGO_STYLE, width: '26px', height: '26px' }} alt="" />}
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{dog.team}</div>
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: tier.color }}>{formatOdds(dog.mlOdds)}</div>
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
                  <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: tier.color }}>+{calcProfit(dog.mlOdds, 1)} profit</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#555', marginBottom: '0.15rem' }}>5 coins →</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: tier.color }}>+{calcProfit(dog.mlOdds, 5)} profit</div>
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

        const SectionHeader = ({ emoji, label, color, count }) => (
          <div style={{ fontSize: '0.65rem', color, fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {emoji} {label} <span style={{ color: '#444', fontWeight: 'normal' }}>· {count} dog{count !== 1 ? 's' : ''}</span>
          </div>
        )

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {todayDogs.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <SectionHeader emoji="📅" label="TODAY" color="#00ff88" count={todayDogs.length} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {todayDogs.map(renderDogCard)}
                </div>
              </div>
            )}
            {tomorrowDogs.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <SectionHeader emoji="🌅" label="TOMORROW" color="#4c9be8" count={tomorrowDogs.length} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {tomorrowDogs.map(renderDogCard)}
                </div>
              </div>
            )}
            {laterDogs.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <SectionHeader emoji="📆" label="LATER" color="#444" count={laterDogs.length} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {laterDogs.map(renderDogCard)}
                </div>
              </div>
            )}
          </div>
        )
      })()}


      {/* No-odds games — show these even without odds so they're visible */}
      {noOddsGames.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ fontSize: '0.62rem', color: '#333', fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            ⏳ ODDS NOT YET AVAILABLE · {noOddsGames.length} game{noOddsGames.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {noOddsGames
              .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))
              .map(game => (
                <div key={game.id} style={{
                  background: '#0e0e0e', border: '1px solid #1a1a1a',
                  borderRadius: '10px', padding: '0.85rem 1rem',
                  opacity: 0.6,
                }}>
                  <div style={{ fontSize: '0.65rem', color: '#333', marginBottom: '0.35rem' }}>
                    {game.sportLabel} · {getGameDateLabel(game.commence_time)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', marginBottom: game.sportLabel === 'MLB' ? '0.3rem' : 0 }}>
                    <span style={{ color: '#555' }}>{game.away_team}</span>
                    <span style={{ color: '#2a2a2a', fontSize: '0.7rem' }}>@</span>
                    <span style={{ color: '#555' }}>{game.home_team}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: '#2a2a2a', fontStyle: 'italic' }}>no odds yet</span>
                  </div>
                  {game.sportLabel === 'MLB' && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem', background: '#0d1a2a', border: '1px solid #1a3a5a', borderRadius: '5px', padding: '0.18rem 0.5rem' }}>
                      <span style={{ fontSize: '0.58rem', color: '#4c9be8' }}>⚾</span>
                      <span style={{ fontSize: '0.6rem', color: '#4c9be855' }}>{game.away_team.split(' ').pop()}:</span>
                      <span style={{ fontSize: '0.6rem', color: game.pitchers?.away ? '#7ab8e8' : '#3a6a8a', fontWeight: game.pitchers?.away ? 'bold' : 'normal' }}>{game.pitchers?.away || 'TBA'}</span>
                      <span style={{ fontSize: '0.55rem', color: '#1a3a5a' }}>·</span>
                      <span style={{ fontSize: '0.6rem', color: '#4c9be855' }}>{game.home_team.split(' ').pop()}:</span>
                      <span style={{ fontSize: '0.6rem', color: game.pitchers?.home ? '#7ab8e8' : '#3a6a8a', fontWeight: game.pitchers?.home ? 'bold' : 'normal' }}>{game.pitchers?.home || 'TBA'}</span>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}