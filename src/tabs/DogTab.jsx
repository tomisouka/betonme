import React, { useState, useEffect } from 'react'
import { getTodayKey, ensureAmerican, formatOdds, calcProfit } from '../utils/odds.js'
import { loadDogState, saveDogStateServer } from '../hooks/useSaveData.js'
import TodoBox from '../components/TodoBox.jsx'

export default function DogTab({ allGames, loading, onDogChange, todayLock }) {
  const [dogState, setDogState] = useState({})
  const [dogModal, setDogModal] = useState(null)

  async function saveDogState(s) {
    setDogState({ ...s })
    await saveDogStateServer(s)
  }

  const todayKey = getTodayKey()
  const todayPick = dogState.picks?.[todayKey]

  // If lock exists and is +150 or better, it IS the dog — auto-set if not already set
  const lockIsTheDog = todayLock && todayLock.odds >= 150
  const lockOdds = todayLock?.odds ?? null

  useEffect(() => {
    async function init() {
      const s = await loadDogState().then(s => s || {})
      setDogState(s)

      // if lock is +150 or better and no dog picked yet, auto-set dog = lock
      if (todayLock && todayLock.odds >= 150 && !s.picks?.[getTodayKey()]) {
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

      const ESPN_ENDPOINTS = { MLB: 'baseball/mlb', NFL: 'football/nfl', NBA: 'basketball/nba' }

      for (const [date, pick] of pending) {
        const endpoint = ESPN_ENDPOINTS[pick.sport]
        if (!endpoint) continue
        try {
          const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${endpoint}/scoreboard?dates=${date.replace(/-/g,'')}`)
          const data = await res.json()
          const event = (data.events || []).find(e =>
            (e.competitions?.[0]?.competitors || []).some(c =>
              pick.home.toLowerCase().includes(c.team.displayName.toLowerCase()) ||
              c.team.displayName.toLowerCase().includes(pick.home.toLowerCase())
            )
          )
          if (!event) continue
          const comp = event.competitions?.[0]
          if (!comp?.status?.type?.completed) continue
          const winner = comp.competitors?.find(c => c.winner)
          if (!winner) continue
          const won = winner.team.displayName.toLowerCase().includes(pick.team.toLowerCase()) ||
            pick.team.toLowerCase().includes(winner.team.displayName.toLowerCase())
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
  allGames.forEach(game => {
    const bm = game.bookmakers?.[0]
    const ml = bm?.markets?.find(m => m.key === 'h2h')
    const sp = bm?.markets?.find(m => m.key === 'spreads')
    if (!ml) return
    ml.outcomes.forEach(outcome => {
      const odds = ensureAmerican(outcome.price)
      if (odds > 0) {
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
        })
      }
    })
  })
  underdogs.sort((a, b) => b.mlOdds - a.mlOdds)

  const getTier = (odds) => {
    if (odds >= 300) return { label: 'MASSIVE DOG', color: '#ff4444', bg: '#2a0a0a', border: '#ff444466' }
    if (odds >= 150) return { label: 'BIG DOG', color: '#ff9944', bg: '#2a1a0a', border: '#ff994466' }
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
        <h2 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: '#aaa' }}>🐕 DOG OF THE DAY</h2>
        <TodoBox items={[
          "Show underdog's last 7-day straight-up win record — needs historical results API",
        ]} />
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
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{todayPick.team}</div>
              <div style={{ color: '#555', fontSize: '0.78rem' }}>{todayPick.home} vs {todayPick.away} · {todayPick.sport}</div>
            </div>
            <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#ff9944' }}>{formatOdds(todayPick.odds)}</div>
          </div>
          {todayPick.result === null && <div style={{ marginTop: '0.6rem', color: '#555', fontSize: '0.78rem' }}>⏳ Pending result...</div>}
          {todayPick.result === 'W' && <div style={{ marginTop: '0.5rem', color: '#00ff88', fontWeight: 'bold' }}>✅ WIN</div>}
          {todayPick.result === 'L' && <div style={{ marginTop: '0.5rem', color: '#ff4444', fontWeight: 'bold' }}>❌ LOSS</div>}
        </div>
      )}

      {loading && <p style={{ color: '#888' }}>Sniffing out underdogs...</p>}
      {!loading && underdogs.length === 0 && todayLock && !lockIsTheDog && <p style={{ color: '#555' }}>No underdogs found — no games loaded yet.</p>}

      {todayLock && !lockIsTheDog && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {underdogs.map((dog, i) => {
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

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.72rem', color: '#555' }}>
                  {dog.sport} · {new Date(dog.gameTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{
                  background: '#00000044', border: `1px solid ${tier.border}`,
                  borderRadius: '5px', padding: '0.15rem 0.5rem',
                  fontSize: '0.68rem', color: tier.color, fontWeight: 'bold', letterSpacing: '0.05em'
                }}>#{i + 1} {tier.label}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.68rem', color: tier.color, fontWeight: 'bold', marginBottom: '0.2rem' }}>UNDERDOG · {isHome ? 'HOME' : 'AWAY'}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{dog.team}</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: tier.color }}>{formatOdds(dog.mlOdds)}</div>
                </div>
                <div style={{ color: '#333', fontWeight: 'bold', fontSize: '0.85rem' }}>VS</div>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontSize: '0.68rem', color: '#555', fontWeight: 'bold', marginBottom: '0.2rem' }}>FAVORITE · {isHome ? 'AWAY' : 'HOME'}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#777' }}>{dog.opponent}</div>
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
        })}
      </div>
      )}
    </div>
  )
}