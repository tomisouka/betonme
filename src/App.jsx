import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { getSportsInSeason, getTodayKey, isSaturday, ensureAmerican, formatOdds, calcProfit, calcPayout, combineParlayOdds } from './utils/odds.js'
import { SERVER, STORAGE_KEYS, loadAllData, saveAllData, loadState, saveState, loadPredictions, savePredictions, loadLayHistory, saveLayHistory, loadDogState, saveDogStateServer, loadPropPick, savePropPick, loadOuPick, saveOuPick, getCachedOdds, setCachedOdds, getCacheAge, getCachedData, setCachedData, migrateLocalStorageToServer } from './hooks/useSaveData.js'
import TodoBox from './components/TodoBox.jsx'
import ParlaySection from './components/ParlaySection.jsx'
import PropSection, { ODDS_API_PROP_MARKETS, PROP_MARKET_LABELS, MARKET_ORDER, MARKET_EMOJIS } from './components/PropSection.jsx'

const API_KEY = '9556a1b199876f898bdc45023a854ed2'

// ─── EXTERNAL API KEYS ────────────────────────────────────────────────────────
const TANK01_KEY = '96524dc98fmsh11a666178d0c514p12157ajsnd21a47160d69'
// balldontlie is fully free with no key required on v1 endpoints

// ─── TANK01 PROPS FETCHER ─────────────────────────────────────────────────────
// Fetches player props for all in-season sports and stores silently.
// Nothing is displayed yet — data sits in localStorage ready for Props tab.
// Tank01 free tier: 100 req/day on RapidAPI. We fetch once per sport per 3hrs.

const TANK01_SPORT_ENDPOINTS = {
  NBA: 'https://tank01-fantasy-stats.p.rapidapi.com/getNBABettingOdds',
  NFL: 'https://tank01-fantasy-stats.p.rapidapi.com/getNFLBettingOdds',
  MLB: 'https://tank01-fantasy-stats.p.rapidapi.com/getMLBBettingOdds',
}

async function fetchAndCacheProps() {
  const sports = getSportsInSeason()  // only in-season sports
  const sportLabels = sports.map(s => s.label)  // ['NBA', 'MLB', etc.]
  const cached = getCachedData(STORAGE_KEYS.PROPS_CACHE) || {}

  for (const label of sportLabels) {
    const endpoint = TANK01_SPORT_ENDPOINTS[label]
    if (!endpoint) continue

    // Don't re-fetch if we have fresh data for this sport
    if (cached[label]?.timestamp && Date.now() - cached[label].timestamp < 3 * 60 * 60 * 1000) {
      console.log(`[Props] ${label} cache fresh, skipping`)
      continue
    }

    try {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
      const res = await fetch(`${endpoint}?gameDate=${today}`, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': TANK01_KEY,
          'x-rapidapi-host': endpoint.split('/')[2],
        }
      })
      const data = await res.json()
      cached[label] = { timestamp: Date.now(), data }
      console.log(`[Props] ${label} fetched and cached`, data)
    } catch (e) {
      console.error(`[Props] ${label} fetch failed`, e)
    }
  }

  setCachedData(STORAGE_KEYS.PROPS_CACHE, cached)
}

// ─── BALLDONTLIE STATS FETCHER ────────────────────────────────────────────────
// Fetches recent player stats for context. Free, no key needed.
// Stores silently — will power player context cards and Media tab later.

async function fetchAndCachePlayerStats() {
  // balldontlie now requires a paid API key — stubbed out until key is available
  // TODO: sign up at balldontlie.io, get API key, replace placeholder below
  const BALLDONTLIE_KEY = null // 'your-key-here'
  if (!BALLDONTLIE_KEY) {
    console.log('[Stats] balldontlie skipped — no API key configured')
    return
  }
  const cached = getCachedData(STORAGE_KEYS.STATS_CACHE)
  if (cached) { console.log('[Stats] Cache fresh, skipping'); return }
  try {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch(`https://api.balldontlie.io/v1/games?dates[]=${today}&per_page=20`, {
      headers: { 'Authorization': BALLDONTLIE_KEY }
    })
    const data = await res.json()
    setCachedData(STORAGE_KEYS.STATS_CACHE, data)
    console.log('[Stats] balldontlie games cached', data)
  } catch (e) {
    console.error('[Stats] balldontlie fetch failed', e)
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// ─── PROP MARKET KEYS PER SPORT ──────────────────────────────────────────────
// the-odds-api player prop market keys, fetched via /events/{id}/odds
function PropsTab({ todayLock, allGames }) {
  const todayKey = getTodayKey()

  // propPick[todayKey] = { [team]: { player, label, line, side, odds, sport, result } }
  // One pick per team (home + away) per day
  const [propPick, setPropPick] = useState({})
  const [propModal, setPropModal] = useState(null)
  const [selectedSide, setSelectedSide] = useState(null)

  const [propLines, setPropLines] = useState([])
  const [propsLoading, setPropsLoading] = useState(false)
  const [propsFetched, setPropsFetched] = useState(false)
  const [propsError, setPropsError] = useState(null)
  const [renderError, setRenderError] = useState(null)

  // todayPropPick is now { [team]: pickObj } or {}
  const todayTeamPicks = propPick[todayKey] || {}

  // Load propPick from server on mount
  useEffect(() => { loadPropPick().then(p => setPropPick(p || {})) }, [])

  // pickedTeams: { [team]: "player|marketKey" } — used to dim same-team props after picking
  const pickedTeams = {}
  Object.entries(todayTeamPicks).forEach(([team, pick]) => {
    if (pick?.player) pickedTeams[team] = `${pick.player}|${pick.marketKey}`
  })

  // Determine sport key and event ID from the lock game
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
            // Reject cache if team tags are missing (stale from old format)
            const lockGame = allGames.find(g => g.id === eventId)
            const homeTeam = lockGame?.home_team || todayLock?.home || ''
            const awayTeam = lockGame?.away_team || todayLock?.away || ''
            const hasTeams = cached.length === 0 || (cached[0].team && cached[0].team !== '')
            if (hasTeams) {
              setPropLines(cached)
              setPropsFetched(true)
              return
            }
            // Stale — re-tag and re-save
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
      // Build a team lookup from the lock game data
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
            // Assign player to home or away team heuristically (best we can do without roster data)
            // We'll tag as homeTeam/awayTeam for pick limiting — split alphabetically as fallback
            lines.push({
              player,
              marketKey: market.key,
              label,
              line,
              overOdds: sides.over?.price ?? -110,
              underOdds: sides.under?.price ?? -110,
              team: '', // filled below
            })
          })
        })
      }

      // Sort all lines by line value desc within each market, then tag team
      // Since we don't have roster data, we split players into two halves per market (home/away)
      // Group by market and sort by line desc
      const byMarket = {}
      lines.forEach(l => {
        if (!byMarket[l.marketKey]) byMarket[l.marketKey] = []
        byMarket[l.marketKey].push(l)
      })
      const taggedLines = []
      Object.entries(byMarket).forEach(([, mLines]) => {
        mLines.sort((a, b) => b.line - a.line)
        const half = Math.ceil(mLines.length / 2)
        mLines.forEach((l, i) => {
          l.team = i < half ? homeTeam : awayTeam
          taggedLines.push(l)
        })
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

  // Group propLines by market in defined order
  const marketOrder = MARKET_ORDER[sportLabel] || []
  const groupedProps = marketOrder.map(mKey => ({
    marketKey: mKey,
    label: PROP_MARKET_LABELS[mKey],
    props: propLines
      .filter(p => p.marketKey === mKey)
      .sort((a, b) => b.line - a.line),
  })).filter(g => g.props.length > 0)

  const lockGame = allGames.find(g => g.id === eventId)
  const homeTeam = lockGame?.home_team || todayLock?.home || ''
  const awayTeam = lockGame?.away_team || todayLock?.away || ''

  // Build team color map the same way the Games tab does: negative ML odds = green (fav), positive = orange (dog)
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
          {/* Game context + refresh */}
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

          {/* Today's picks banner — one per team */}
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

          {propsLoading && (
            <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#555' }}>⏳ Fetching props...</div>
          )}

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

// ─── LIVE PICKS ──────────────────────────────────────────────────────────────
// Fetched only on demand. Lock and Dog games are pinned + highlighted.

// BetOnline sport page URLs — direct to the right sport section
const BETONLINE_SPORT_URLS = {
  NBA: 'https://www.betonline.ag/sportsbook/basketball/nba',
  MLB: 'https://www.betonline.ag/sportsbook/baseball/mlb',
  NFL: 'https://www.betonline.ag/sportsbook/football/nfl',
}

function LivePicksTab({ todayLock, todayDog }) {
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

  // Sort games: lock first, dog second, rest alphabetical
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
                  {/* Badge row */}
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
                        <a
                          href={betOnlineUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: '0.72rem', color: '#8888ff', fontWeight: 'bold',
                            textDecoration: 'none', padding: '0.2rem 0.6rem',
                            border: '1px solid #8888ff44', borderRadius: '5px',
                            background: '#8888ff11',
                          }}
                        >
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

                  {/* Show your pick on the lock/dog game for quick reference */}
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


// Combine American odds legs into a single American parlay odds number
function ParlaysTab({ allGames, loading, todayLock, todayDog, onLockChange }) {
  const todayKey = getTodayKey()

  // ── Today's dog pick (auto-included in predictions like the lock) ──

  // ── Persistent predictions history ──
  const [predictionsHistory, setPredictionsHistory] = useState({})
  const [layHistoryState, setLayHistoryState] = useState({})

  const todayPredictions = predictionsHistory[todayKey] || null
  const todayLay = layHistoryState[todayKey] || null

  // Restore today's locked state from storage on mount
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

  // ── Double Lock O/U ──
  const [ouPick, setOuPick] = useState({})
  const [ouModal, setOuModal] = useState(null)

  // Load ouPick from server on mount
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

  // ── Predictions slip ──
  const lockGameId = todayLock?.gameId || null
  const dogGameId = todayDog?.gameId || null  // dog's game ID for auto-include

  const predictionsSlip = (() => {
    if (predictionsLocked && todayPredictions) {
      const mapped = todayPredictions.legs.map(leg => {
        const live = allGames.find(g => g.id === leg.gameId)
        return live || { id: leg.gameId, home_team: leg.home, away_team: leg.away, sportLabel: leg.sport, bookmakers: [], _leg: leg }
      })
      // Always enforce lock→dog→rest order even on already-locked slips
      return [...mapped].sort((a, b) => {
        const legA = todayPredictions.legs.find(l => l.gameId === a.id)
        const legB = todayPredictions.legs.find(l => l.gameId === b.id)
        const rank = l => l?.isLock ? 0 : l?.isDog ? 1 : 2
        return rank(legA) - rank(legB)
      })
    }
    // Build ordered ID list: lock first, then dog (if different game), then user-selected
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
  React.useEffect(() => { if (predictionsLocked) setOpenLay(true) }, [predictionsLocked])

  // ── Save predictions when locked ──
  async function lockPredictions() {
    const legs = predictionsSlip.map(game => {
      const isLock = game.id === lockGameId
      const isDog = game.id === dogGameId && !isLock
      const team = isLock ? todayLock?.team : isDog ? todayDog?.team : selectedTeams[game.id]
      return {
        gameId: game.id,
        home: game.home_team,
        away: game.away_team,
        sport: game.sportLabel,
        team: team || null,
        isLock,
        isDog,
        result: null,
      }
    }).sort((a, b) => {
      const rank = l => l.isLock ? 0 : l.isDog ? 1 : 2
      return rank(a) - rank(b)
    })
    const updated = {
      ...predictionsHistory,
      [todayKey]: { legs, lockedAt: Date.now() }
    }
    await savePredictions(updated)
    setPredictionsHistory(updated)
    setPredictionsLocked(true)
    setLayRemovedGames([])
    setLayLocked(false)
  }

  // ── Save lay when locked ──
  async function lockLay() {
    const legs = laySlip.map(game => {
      const isLock = game.id === lockGameId
      const isDog = game.id === dogGameId && !isLock
      const team = isLock ? todayLock?.team : isDog ? todayDog?.team : selectedTeams[game.id]
      return {
        gameId: game.id,
        home: game.home_team,
        away: game.away_team,
        sport: game.sportLabel,
        team: team || null,
        isLock,
        isDog,
        result: null,
      }
    }).sort((a, b) => {
      const rank = l => l.isLock ? 0 : l.isDog ? 1 : 2
      return rank(a) - rank(b)
    })
    const hist = await loadLayHistory()
    const updated = { ...hist, [todayKey]: { legs, lockedAt: Date.now() } }
    await saveLayHistory(updated)
    setLayHistoryState(updated)
    setLayLocked(true)
  }

  // ── Auto-resolve predictions legs via ESPN ──
  React.useEffect(() => {
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
          if (leg.result !== null) continue
          if (!leg.team) continue
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
            const won = winnerName.toLowerCase().includes(leg.team.toLowerCase()) ||
              leg.team.toLowerCase().includes(winnerName.toLowerCase())
            hist[date].legs[i].result = won ? 'W' : 'L'
            changed = true
          } catch(e) { console.error('[Predictions resolve]', e) }
        }

        // After resolving all legs for a date, check if ≥70% hit and record overall W/L
        const resolvedLegs = hist[date].legs.filter(l => l.result !== null)
        if (resolvedLegs.length === hist[date].legs.length && resolvedLegs.length > 0) {
          const hits = resolvedLegs.filter(l => l.result === 'W').length
          hist[date].overallResult = hits / resolvedLegs.length >= 0.7 ? 'W' : 'L'
          hist[date].hitCount = hits
          hist[date].totalCount = resolvedLegs.length
          changed = true
        }
      }
      if (changed) {
        await savePredictions(hist)
        setPredictionsHistory({ ...hist })
      }
    }
    resolvePredictions()
  }, [])

  // ── Auto-resolve lay legs via ESPN ──
  React.useEffect(() => {
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
          if (leg.result !== null) continue
          if (!leg.team) continue
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
            const won = winnerName.toLowerCase().includes(leg.team.toLowerCase()) ||
              leg.team.toLowerCase().includes(winnerName.toLowerCase())
            hist[date].legs[i].result = won ? 'W' : 'L'
            changed = true
          } catch(e) { console.error('[Lay resolve]', e) }
        }

        // Once all legs resolved, calc hit count and overall color threshold
        const resolvedLegs = hist[date].legs.filter(l => l.result !== null)
        if (resolvedLegs.length === hist[date].legs.length && resolvedLegs.length > 0 && !hist[date].overallResult) {
          const hits = resolvedLegs.filter(l => l.result === 'W').length
          hist[date].overallResult = hits / resolvedLegs.length >= 0.7 ? 'W' : 'L'
          hist[date].hitCount = hits
          hist[date].totalCount = resolvedLegs.length
          changed = true
        }
      }
      if (changed) {
        await saveLayHistory(hist)
        setLayHistoryState({ ...hist })
      }
    }
    resolveLay()
  }, [])

  // ── Yesterday's results (Predictions + Lay) ──
  const yesterdayKey = (() => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })()
  const yesterdayPred = predictionsHistory[yesterdayKey]
  const yesterdayLay = layHistoryState[yesterdayKey]
  const showYesterdayCard = !!(yesterdayPred?.overallResult || yesterdayLay?.overallResult)

  const fmtDate = (d) => { if (!d) return null; const [,mm,dd] = d.split('-'); return `${mm}/${dd}` }

  return (
    <div>
      {/* O/U pick modal */}
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

        {/* Yesterday's Results — Predictions + Lay, shown inside Predictions section */}
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
                  <div style={{
                    fontSize: '0.78rem', fontWeight: 'bold', padding: '0.25rem 0.65rem', borderRadius: '5px',
                    background: yesterdayPred.overallResult === 'W' ? '#00ff8818' : '#ff444418',
                    color: yesterdayPred.overallResult === 'W' ? '#00ff88' : '#ff4444',
                  }}>
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
                  <div style={{
                    fontSize: '0.78rem', fontWeight: 'bold', padding: '0.25rem 0.65rem', borderRadius: '5px',
                    background: yesterdayLay.overallResult === 'W' ? '#00ff8818' : '#ff444418',
                    color: yesterdayLay.overallResult === 'W' ? '#00ff88' : '#ff4444',
                  }}>
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
              {/* When locked, show saved legs */}
              {predictionsLocked && todayPredictions ? (
                todayPredictions.legs.map((leg, i) => (
                  <div key={leg.gameId} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#1a1a1a',
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
                    <div style={{ fontSize: '1.2rem' }}>
                      {leg.result === 'W' ? '✅' : leg.result === 'L' ? '❌' : '⏳'}
                    </div>
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
                  const chosenTeam = isLockGame ? todayLock?.team
                    : isDogGame ? todayDog?.team
                    : selectedTeams[game.id]

                  return (
                    <div key={game.id} style={{
                      borderRadius: '8px', overflow: 'hidden',
                      border: `1px solid ${isLockGame ? '#00ff8844' : isDogGame ? '#ff994444' : isSelected ? '#2a2a2a' : '#1a1a1a'}`,
                      transition: 'all 0.15s'
                    }}>
                      <div
                        onClick={() => {
                          if (predictionsLocked || isAutoIncluded) return
                          if (isSelected) {
                            setSelectedGames(s => s.filter(id => id !== game.id))
                            setSelectedTeams(t => { const n = {...t}; delete n[game.id]; return n })
                          } else {
                            setSelectedGames(s => [...s, game.id])
                          }
                        }}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          background: isSelected ? '#1a1a1a' : '#111',
                          padding: '0.75rem 1rem',
                          cursor: predictionsLocked || isAutoIncluded ? 'default' : 'pointer',
                        }}
                      >
                        <div>
                          <div style={{
                            fontSize: '0.65rem',
                            color: isLockGame ? '#00ff88' : isDogGame ? '#ff9944' : '#555',
                            marginBottom: '0.15rem',
                            fontWeight: isAutoIncluded ? 'bold' : 'normal'
                          }}>
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
                        <div style={{ fontSize: '1.1rem' }}>
                          {isLockGame ? '🔒' : isDogGame ? '🐕' : isSelected ? '✕' : '➕'}
                        </div>
                      </div>

                      {isSelected && !predictionsLocked && !isAutoIncluded && ml && (
                        <div style={{ display: 'flex', borderTop: '1px solid #222' }}>
                          {ml.outcomes.map(o => {
                            const odds = ensureAmerican(o.price)
                            const isChosen = chosenTeam === o.name
                            return (
                              <button
                                key={o.name}
                                onClick={(e) => { e.stopPropagation(); setSelectedTeams(t => ({ ...t, [game.id]: o.name })) }}
                                style={{
                                  flex: 1, padding: '0.6rem 0.5rem', border: 'none',
                                  background: isChosen ? (odds < 0 ? '#0a2a1a' : '#2a1a0a') : '#141414',
                                  color: isChosen ? (odds < 0 ? '#00ff88' : '#ff9944') : '#444',
                                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: isChosen ? 'bold' : 'normal',
                                  borderRight: '1px solid #1a1a1a', transition: 'all 0.15s',
                                }}
                              >
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
              <span style={{ fontSize: '0.78rem', color: '#555' }}>
                {predictionsSlip.length} game{predictionsSlip.length !== 1 ? 's' : ''} in slip
              </span>
              {!predictionsLocked ? (
                <button
                  disabled={predictionsSlip.length < 2}
                  onClick={lockPredictions}
                  style={{
                    padding: '0.6rem 1.25rem', borderRadius: '7px', fontWeight: 'bold', fontSize: '0.85rem',
                    background: predictionsSlip.length >= 2 ? '#00ff88' : '#222',
                    color: predictionsSlip.length >= 2 ? '#000' : '#555',
                    border: 'none', cursor: predictionsSlip.length >= 2 ? 'pointer' : 'not-allowed',
                  }}
                >Lock In Predictions 🔒</button>
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
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#1a1a1a',
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
                    <div style={{ fontSize: '1.2rem' }}>
                      {leg.result === 'W' ? '✅' : leg.result === 'L' ? '❌' : '⏳'}
                    </div>
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
                  const pickedOutcome = ml?.outcomes?.find(o => o.name === chosenTeam)
                    || ml?.outcomes?.reduce((a, b) => ensureAmerican(a.price) < ensureAmerican(b.price) ? a : b)
                  const canRemove = !isLockGame && !isDogGame && laySlip.length > 2
                  const canAdd = isRemoved && laySlip.length < 4
                  const legNum = laySlip.filter(g => !layRemovedGames.includes(g.id)).indexOf(game) + 1

                  return (
                    <div
                      key={game.id}
                      onClick={() => {
                        if (layLocked || isLockGame || isDogGame) return
                        if (isRemoved && canAdd) setLayRemovedGames(r => r.filter(id => id !== game.id))
                        else if (!isRemoved && canRemove) setLayRemovedGames(r => [...r, game.id])
                      }}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: isRemoved ? '#111' : '#1a1a1a',
                        border: `1px solid ${isRemoved ? '#1a1a1a' : isLockGame ? '#00ff8844' : isDogGame ? '#ff994444' : '#2a2a2a'}`,
                        borderRadius: '8px', padding: '0.75rem 1rem',
                        opacity: isRemoved ? 0.3 : 1,
                        cursor: (isLockGame || isDogGame || (!canRemove && !isRemoved) || (!canAdd && isRemoved)) ? 'default' : 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
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
                <button
                  disabled={laySlip.length < 2 || laySlip.length > 4}
                  onClick={lockLay}
                  style={{
                    padding: '0.6rem 1.25rem', borderRadius: '7px', fontWeight: 'bold', fontSize: '0.85rem',
                    background: laySlip.length >= 2 && laySlip.length <= 4 ? '#8888ff' : '#1a1a1a',
                    color: laySlip.length >= 2 && laySlip.length <= 4 ? '#000' : '#333',
                    border: `1px solid ${laySlip.length >= 2 && laySlip.length <= 4 ? '#8888ff' : '#2a2a2a'}`,
                    cursor: laySlip.length >= 2 && laySlip.length <= 4 ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                  }}
                >Lock Lay 🎯</button>
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

// ─── DOG OF THE DAY ───────────────────────────────────────────────────────────
// Underdog = positive moneyline odds. One pick/day, no coins, auto-resolves via ESPN.
// Streak resets every time win/loss flips.

function DogOfTheDay({ allGames, loading, onDogChange }) {
  const [dogState, setDogState] = useState({})
  const [dogModal, setDogModal] = useState(null)

  async function saveDogState(s) {
    setDogState({ ...s })
    await saveDogStateServer(s)
  }

  const todayKey = getTodayKey()
  const todayPick = dogState.picks?.[todayKey]

  // Load from server on mount
  useEffect(() => {
    loadDogState().then(s => setDogState(s || {}))
  }, [])

  // Auto-resolve pending dog picks via ESPN
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

          // Streak: reset if different from last, else increment
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

  // Format since date MM/DD
  const fmtDate = (d) => { if (!d) return null; const [,mm,dd] = d.split('-'); return `${mm}/${dd}` }

  return (
    <div>
      {/* Dog Confirm Modal */}
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

      {/* Dog stats row */}
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

      {/* Today's pick banner */}
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
      {!loading && underdogs.length === 0 && <p style={{ color: '#555' }}>No underdogs found — no games loaded yet.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {underdogs.map((dog, i) => {
          const tier = getTier(dog.mlOdds)
          const isHome = dog.home === dog.team
          const isPicked = todayPick?.team === dog.team && todayPick?.home === dog.home
          const isSelected = !!todayPick && isPicked

          // Highlight border if selected, dim if something else was picked
          const borderColor = isSelected
            ? '#ff9944'
            : (todayPick && !isPicked) ? '#1a1a1a' : tier.border
          const bgColor = isSelected
            ? '#2a1a00'
            : (todayPick && !isPicked) ? '#111' : tier.bg
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
    </div>
  )
}

// ─── ODDS DASHBOARD ───────────────────────────────────────────────────────────
function OddsDashboard({ allGames, loading, onRefresh, cacheAge }) {
  const [selectedGame, setSelectedGame] = useState(null)
  const [market, setMarket] = useState('h2h')

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '2rem' }}>
        {allGames.map(game => {
          const bm = game.bookmakers?.[0]
          const ml = bm?.markets?.find(m => m.key === 'h2h')
          const sp = bm?.markets?.find(m => m.key === 'spreads')
          return (
            <div key={game.id} onClick={() => setSelectedGame(game)} style={{
              padding: '1rem', borderRadius: '8px', cursor: 'pointer',
              background: selectedGame?.id === game.id ? '#1a3a2a' : '#1a1a1a',
              border: `1px solid ${selectedGame?.id === game.id ? '#00ff88' : '#2a2a2a'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#555', fontSize: '0.75rem', marginRight: '0.5rem' }}>{game.sportLabel}</span>
                  <strong>{game.home_team}</strong>
                  <span style={{ color: '#555', margin: '0 0.5rem' }}>vs</span>
                  <strong>{game.away_team}</strong>
                </div>
                <span style={{ color: '#555', fontSize: '0.8rem' }}>
                  {new Date(game.commence_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {ml && (
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
                  <span style={{ color: '#666' }}>ML:</span>
                  {ml.outcomes.map(o => (
                    <span key={o.name} style={{ color: o.price < 0 ? '#00ff88' : '#ff9944' }}>
                      {o.name} <strong>{formatOdds(o.price)}</strong>
                    </span>
                  ))}
                  {sp && <>
                    <span style={{ color: '#666', marginLeft: '1rem' }}>SP:</span>
                    {sp.outcomes.map(o => (
                      <span key={o.name} style={{ color: '#aaa' }}>
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

// ─── STATS BAR ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, hidden }) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px',
        padding: '1rem 1.5rem', textAlign: 'center', flex: 1, minWidth: '120px',
        cursor: hidden ? 'pointer' : 'default',
        transition: 'border-color 0.2s',
        borderColor: hovered ? '#444' : '#2a2a2a',
      }}
    >
      <div style={{ fontSize: '0.75rem', color: '#555', marginBottom: '0.4rem' }}>{label}</div>
      {hidden && !hovered ? (
        <div style={{ fontSize: '1.2rem', color: '#2a2a2a', letterSpacing: '0.2em' }}>••••</div>
      ) : (
        <>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: color || '#fff' }}>{value}</div>
          {sub && <div style={{ fontSize: '0.7rem', color: '#555', marginTop: '0.25rem' }}>{sub}</div>}
        </>
      )}
    </div>
  )
}

function calcRecord(picks, days) {
  const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : null
  let w = 0, l = 0
  Object.entries(picks).forEach(([date, pick]) => {
    if (cutoff && new Date(date).getTime() < cutoff) return
    if (pick.result === 'W') w++
    else if (pick.result === 'L') l++
  })
  return `${w}W - ${l}L`
}

function calcTeamStats(picks) {
  // Build a map of team -> { w, l } across all resolved picks
  const teams = {}
  Object.values(picks).forEach(pick => {
    if (!pick.result || pick.result === null) return
    const t = pick.team
    if (!teams[t]) teams[t] = { w: 0, l: 0 }
    if (pick.result === 'W') teams[t].w++
    else teams[t].l++
  })

  // Need at least 1 resolved pick per team
  const entries = Object.entries(teams).filter(([, r]) => r.w + r.l > 0)
  if (!entries.length) return { biased: null, cursed: null }

  // Biased = best win rate (most W relative to total, min 1 game)
  const biased = entries.reduce((best, [team, r]) => {
    const rate = r.w / (r.w + r.l)
    return rate > best.rate ? { team, rate, w: r.w, l: r.l } : best
  }, { team: null, rate: -1, w: 0, l: 0 })

  // Cursed = worst win rate
  const cursed = entries.reduce((worst, [team, r]) => {
    const rate = r.w / (r.w + r.l)
    return rate < worst.rate ? { team, rate, w: r.w, l: r.l } : worst
  }, { team: null, rate: 2, w: 0, l: 0 })

  return {
    biased: biased.team ? { name: biased.team, record: `${biased.w}W-${biased.l}L` } : null,
    cursed: cursed.team ? { name: cursed.team, record: `${cursed.w}W-${cursed.l}L` } : null,
  }
}

function StatsBar({ coins, streakInfo, streak, streakDates, bestStreaks, picks }) {
  const { biased, cursed } = calcTeamStats(picks)

  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
      <StatCard label="COINS" value={`🪙 ${coins}`} />
      <StatCard
        label="STREAK"
        value={streakInfo ? `${streakInfo.type === 'W' ? '🔥' : '❄'} ${streakInfo.count} ${streakInfo.type}` : 'None yet'}
        sub={streakInfo?.since ? `since ${streakInfo.since}` : null}
        color={streakInfo ? (streakInfo.type === 'W' ? '#00ff88' : '#ff4444') : '#555'}
      />
      <StatCard label="7 DAY" value={calcRecord(picks, 7)} color="#aaa" />
      <StatCard label="30 DAY" value={calcRecord(picks, 30)} color="#aaa" />
      <StatCard label="ALL TIME" value={calcRecord(picks, null)} color="#666" hidden />
      <StatCard
        label="BEST W STREAK"
        value={bestStreaks.W.count ? `🔥 ${bestStreaks.W.count} W` : '—'}
        sub={bestStreaks.W.since ? `started ${bestStreaks.W.since}` : null}
        color="#00ff88"
      />
      <StatCard
        label="WORST L STREAK"
        value={bestStreaks.L.count ? `❄ ${bestStreaks.L.count} L` : '—'}
        sub={bestStreaks.L.since ? `started ${bestStreaks.L.since}` : null}
        color="#ff4444"
      />
      <StatCard
        label="😇 BIASED TEAM"
        value={biased ? biased.name : '—'}
        sub={biased ? biased.record : null}
        color="#00ff88"
        hidden
      />
      <StatCard
        label="😈 CURSED TEAM"
        value={cursed ? cursed.name : '—'}
        sub={cursed ? cursed.record : null}
        color="#ff4444"
        hidden
      />
    </div>
  )
}

// ─── MONTH BUCKET ────────────────────────────────────────────────────────────

function MonthBucket({ label, record, entries, PickRow }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#141414', border: '1px solid #1a1a1a', borderRadius: '8px',
          padding: '0.7rem 1rem', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ color: '#555', fontSize: '0.85rem', fontWeight: 'bold' }}>{label}</span>
          <span style={{ color: '#444', fontSize: '0.75rem' }}>{record} · {entries.length} pick{entries.length !== 1 ? 's' : ''}</span>
        </div>
        <span style={{ color: '#333', fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ paddingTop: '0.4rem' }}>
          {entries.map(([date, pick]) => <PickRow key={date} date={date} pick={pick} />)}
        </div>
      )}
    </div>
  )
}

// ─── LOCK OF THE DAY ──────────────────────────────────────────────────────────
function LockOfTheDay({ allGames, loading, onRefresh, cacheAge, onLockChange }) {
  const [appState, setAppState] = useState({})
  const [modal, setModal] = useState(null)
  const [betAmount, setBetAmount] = useState(1)
  const [resolving, setResolving] = useState(false)
  const todayKey = getTodayKey()

  useEffect(() => {
    async function init() {
      const s = await loadState()
      if (s.lastCoinDate !== todayKey) {
        const earned = isSaturday() ? 2 : 1
        s.coins = (s.coins || 0) + earned
        s.lastCoinDate = todayKey
        await saveState(s)
      }
      setAppState({ ...s })
      resolvePendingPicks()
    }
    init()
  }, [])

  async function resolvePendingPicks() {
    const s = await loadState()
    if (!s.picks) return
    const pending = Object.entries(s.picks).filter(([, pick]) => pick.result === null)
    if (!pending.length) return
    setResolving(true)

    const ESPN_ENDPOINTS = { MLB: 'baseball/mlb', NFL: 'football/nfl', NBA: 'basketball/nba' }

    for (const [date, pick] of pending) {
      const endpoint = ESPN_ENDPOINTS[pick.sport]
      if (!endpoint) continue
      const dateStr = date.replace(/-/g, '')
      try {
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${endpoint}/scoreboard?dates=${dateStr}`)
        const data = await res.json()
        const events = data.events || []
        const event = events.find(e => {
          const competitors = e.competitions?.[0]?.competitors || []
          return competitors.some(c =>
            pick.home.toLowerCase().includes(c.team.displayName.toLowerCase()) ||
            c.team.displayName.toLowerCase().includes(pick.home.toLowerCase()) ||
            pick.away.toLowerCase().includes(c.team.displayName.toLowerCase()) ||
            c.team.displayName.toLowerCase().includes(pick.away.toLowerCase())
          )
        })
        if (!event) continue
        const competition = event.competitions?.[0]
        if (!competition?.status?.type?.completed) continue
        const competitors = competition.competitors || []
        const winner = competitors.find(c => c.winner === true)
        if (!winner) continue
        const winnerName = winner.team.displayName
        let result
        if (pick.market === 'spreads') {
          const pickedTeam = competitors.find(c =>
            pick.team.toLowerCase().includes(c.team.displayName.toLowerCase()) ||
            c.team.displayName.toLowerCase().includes(pick.team.toLowerCase())
          )
          const otherTeam = competitors.find(c => c !== pickedTeam)
          if (!pickedTeam || !otherTeam) continue
          const adjustedScore = parseFloat(pickedTeam.score) + pick.point
          result = adjustedScore > parseFloat(otherTeam.score) ? 'W' : 'L'
        } else {
          const userPickedWinner =
            winnerName.toLowerCase().includes(pick.team.toLowerCase()) ||
            pick.team.toLowerCase().includes(winnerName.toLowerCase())
          result = userPickedWinner ? 'W' : 'L'
        }
        s.picks[date].result = result
        s.streak = [...(s.streak || []), result]
        s.streakDates = [...(s.streakDates || []), date]
        if (result === 'W') s.coins = (s.coins || 0) + calcPayout(pick.odds, pick.stake)
      } catch (e) { console.error('ESPN resolve error:', e) }
    }

    await saveState(s)
    setAppState({ ...s })
    setResolving(false)
  }

  const todayPick = appState.picks?.[todayKey]
  const streak = appState.streak || []
  const streakDates = appState.streakDates || []
  const coins = appState.coins || 0

  const streakInfo = (() => {
    if (!streak.length) return null
    const last = streak[streak.length - 1]
    let count = 0
    let startIdx = streak.length - 1
    for (let i = streak.length - 1; i >= 0; i--) {
      if (streak[i] === last) { count++; startIdx = i }
      else break
    }
    const startDate = streakDates[startIdx]
    let since = null
    if (startDate) {
      const [, mm, dd] = startDate.split('-')
      since = `${mm}/${dd}`
    }
    return { type: last, count, since }
  })()

  // Calculate longest W streak and longest L streak, each with start date
  const bestStreaks = (() => {
    const calc = (type) => {
      let best = 0, bestStart = null, cur = 0, curStart = null
      for (let i = 0; i < streak.length; i++) {
        if (streak[i] === type) {
          if (cur === 0) curStart = i
          cur++
          if (cur > best) { best = cur; bestStart = curStart }
        } else {
          cur = 0; curStart = null
        }
      }
      let since = null
      if (bestStart !== null && streakDates[bestStart]) {
        const [, mm, dd] = streakDates[bestStart].split('-')
        since = `${mm}/${dd}`
      }
      return { count: best, since }
    }
    return { W: calc('W'), L: calc('L') }
  })()

  function openModal(game, team, odds, market, point) {
    if (todayPick || coins < 1) return
    setBetAmount(1)
    setModal({ game, team, odds, market, point })
  }

  async function confirmPick() {
    if (!modal) return
    const { game, team, odds, market, point } = modal
    const stake = Math.min(Math.max(1, betAmount), coins)
    const profit = calcProfit(odds, stake)
    const s = await loadState()
    s.picks = s.picks || {}
    s.picks[todayKey] = {
      gameId: game.id, team, odds, market, point,
      home: game.home_team, away: game.away_team,
      sport: game.sportLabel, commenceTime: game.commence_time,
      stake, profit, result: null,
    }
    s.coins = (s.coins || 0) - stake
    await saveState(s)
    setAppState({ ...s })
    setModal(null)
    onLockChange && onLockChange()
  }

  const safeBet = Math.min(Math.max(1, betAmount || 1), coins)
  const previewProfit = modal ? calcProfit(modal.odds, safeBet) : 0
  const previewTotal = modal ? calcPayout(modal.odds, safeBet) : 0

  return (
    <div>
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: '14px', padding: '2rem', width: '100%', maxWidth: '420px' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem' }}>🔒 Confirm Your Lock</h2>
            <p style={{ color: '#555', fontSize: '0.8rem', marginBottom: '1.5rem' }}>One pick per day — make it count · odds locked at pick time</p>
            <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '0.4rem' }}>{modal.game.sportLabel}</div>
              <div style={{ marginBottom: '0.4rem' }}>
                <strong style={{ fontSize: '1.05rem' }}>{modal.team}</strong>
                <span style={{ color: '#555', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                  {modal.market === 'h2h' ? 'Moneyline' : `Spread ${modal.point > 0 ? '+' : ''}${modal.point}`} ({formatOdds(modal.odds)})
                </span>
              </div>
              <div style={{ color: '#555', fontSize: '0.82rem' }}>{modal.game.away_team} vs {modal.game.home_team}</div>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#888', marginBottom: '0.5rem' }}>
                HOW MANY COINS? <span style={{ color: '#555' }}>(max: {coins})</span>
              </label>
              <input type="number" min={1} max={coins} value={betAmount}
                onChange={e => setBetAmount(Math.min(Math.max(1, Number(e.target.value)), coins))}
                style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '1.2rem', background: '#0f0f0f', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', background: '#0a2a1a', border: '1px solid #00ff8833', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#555', marginBottom: '0.2rem' }}>RISKING</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#ff9944' }}>🪙 {safeBet}</div>
              </div>
              <div style={{ color: '#333', fontSize: '1.5rem', alignSelf: 'center' }}>→</div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#555', marginBottom: '0.2rem' }}>YOU GET BACK</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#00ff88' }}>🪙 {previewTotal}</div>
                <div style={{ fontSize: '0.7rem', color: '#555' }}>+{previewProfit} profit · {safeBet} stake back</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: '0.85rem', background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: '#888', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
              <button onClick={confirmPick} style={{ flex: 2, padding: '0.85rem', background: '#00ff88', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>Bet That 🔒</button>
            </div>
          </div>
        </div>
      )}

      <StatsBar
        coins={coins}
        streakInfo={streakInfo}
        streak={streak}
        streakDates={streakDates}
        bestStreaks={bestStreaks}
        picks={appState.picks || {}}
      />

      {resolving && <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem' }}>⏳ Checking results...</div>}

      {todayPick && (
        <div style={{ background: '#111', border: `1px solid ${todayPick.result === 'W' ? '#00ff88' : todayPick.result === 'L' ? '#ff4444' : '#444'}`, borderRadius: '10px', padding: '1.25rem', marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#00ff88', marginBottom: '0.5rem' }}>🔒 TODAY'S LOCK</div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '1.1rem' }}>{todayPick.team}</strong>
            <span style={{ color: '#888', marginLeft: '0.75rem' }}>
              {todayPick.market === 'h2h' ? 'Moneyline' : `Spread ${todayPick.point > 0 ? '+' : ''}${todayPick.point}`} ({formatOdds(todayPick.odds)})
            </span>
          </div>
          <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{todayPick.home} vs {todayPick.away} · {todayPick.sport}</div>
          <div style={{ fontSize: '0.85rem', color: '#888' }}>
            Staked: <span style={{ color: '#ff9944' }}>🪙 {todayPick.stake}</span>
            <span style={{ margin: '0 0.5rem', color: '#333' }}>·</span>
            If win: <span style={{ color: '#00ff88' }}>🪙 {calcPayout(todayPick.odds, todayPick.stake)} back</span>
            <span style={{ color: '#555', fontSize: '0.8rem' }}> (+{calcProfit(todayPick.odds, todayPick.stake)} profit)</span>
          </div>
          {todayPick.result === null && <div style={{ marginTop: '0.75rem', color: '#555', fontSize: '0.82rem' }}>⏳ Waiting for final score — auto-resolves when game ends</div>}
          {todayPick.result === 'W' && <div style={{ marginTop: '0.5rem', color: '#00ff88', fontWeight: 'bold' }}>✅ WIN — 🪙 {calcPayout(todayPick.odds, todayPick.stake)} returned</div>}
          {todayPick.result === 'L' && <div style={{ marginTop: '0.5rem', color: '#ff4444', fontWeight: 'bold' }}>❌ LOSS — 🪙 {todayPick.stake} lost</div>}
        </div>
      )}

      {!todayPick && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1rem', color: '#aaa' }}>🎯 PICK YOUR LOCK</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {cacheAge && <span style={{ color: '#555', fontSize: '0.8rem' }}>{cacheAge}</span>}
              <button onClick={onRefresh} style={{ padding: '0.4rem 1rem', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>🔄 Refresh</button>
            </div>
          </div>
          {coins < 1 && <p style={{ color: '#ff4444' }}>No coins — come back tomorrow!</p>}
          {loading && <p style={{ color: '#888' }}>Fetching games...</p>}
          {allGames.map(game => {
            const bm = game.bookmakers?.[0]
            if (!bm) return null
            const ml = bm.markets?.find(m => m.key === 'h2h')
            const sp = bm.markets?.find(m => m.key === 'spreads')
            return (
              <div key={game.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div>
                    <span style={{ color: '#555', fontSize: '0.75rem', marginRight: '0.5rem' }}>{game.sportLabel}</span>
                    <strong>{game.home_team}</strong>
                    <span style={{ color: '#444', margin: '0 0.5rem' }}>vs</span>
                    <strong>{game.away_team}</strong>
                  </div>
                  <span style={{ color: '#444', fontSize: '0.8rem' }}>
                    {new Date(game.commence_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {ml?.outcomes.map(o => (
                    <button key={`ml-${o.name}`} onClick={() => openModal(game, o.name, o.price, 'h2h', null)} disabled={coins < 1} style={{
                      padding: '0.5rem 1rem', borderRadius: '6px', cursor: coins < 1 ? 'not-allowed' : 'pointer',
                      background: o.price < 0 ? '#0a2a1a' : '#2a1a0a',
                      border: `1px solid ${o.price < 0 ? '#00ff88' : '#ff9944'}`,
                      color: o.price < 0 ? '#00ff88' : '#ff9944', fontSize: '0.85rem', fontWeight: 'bold',
                    }}>
                      {o.name} ML {formatOdds(o.price)}
                      <span style={{ display: 'block', fontSize: '0.7rem', color: '#666' }}>+{calcProfit(o.price, 1)} profit per coin</span>
                    </button>
                  ))}
                  {sp?.outcomes.map(o => (
                    <button key={`sp-${o.name}`} onClick={() => openModal(game, o.name, o.price, 'spreads', o.point)} disabled={coins < 1} style={{
                      padding: '0.5rem 1rem', borderRadius: '6px', cursor: coins < 1 ? 'not-allowed' : 'pointer',
                      background: '#1a1a2a', border: '1px solid #4444aa', color: '#8888ff', fontSize: '0.85rem', fontWeight: 'bold',
                    }}>
                      {o.name} {o.point > 0 ? '+' : ''}{o.point} ({formatOdds(o.price)})
                      <span style={{ display: 'block', fontSize: '0.7rem', color: '#666' }}>+{calcProfit(o.price, 1)} profit per coin</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {!loading && allGames.length === 0 && <p style={{ color: '#555' }}>No games today.</p>}
        </>
      )}

      {appState.picks && Object.keys(appState.picks).length > 0 && (() => {
        const allEntries = Object.entries(appState.picks).sort((a, b) => b[0].localeCompare(a[0]))
        const recent = allEntries.slice(0, 10)
        const older = allEntries.slice(10)

        // Group older entries by YYYY-MM month
        const byMonth = {}
        older.forEach(([date, pick]) => {
          const monthKey = date.slice(0, 7) // "2026-02"
          if (!byMonth[monthKey]) byMonth[monthKey] = []
          byMonth[monthKey].push([date, pick])
        })

        const PickRow = ({ date, pick }) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', border: '1px solid #1a1a1a', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
            <span style={{ color: '#555' }}>{date}</span>
            <span><strong>{pick.team}</strong></span>
            <span style={{ color: '#555' }}>{pick.market === 'h2h' ? 'ML' : `SP ${pick.point > 0 ? '+' : ''}${pick.point}`} {formatOdds(pick.odds)}</span>
            <span style={{ color: '#555' }}>{pick.sport}</span>
            <span style={{ color: '#ff9944' }}>🪙 {pick.stake}</span>
            <span style={{ fontWeight: 'bold', color: pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#444' }}>{pick.result || '⏳'}</span>
          </div>
        )

        return (
          <div style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1rem', color: '#aaa', marginBottom: '1rem' }}>📋 HISTORY</h2>
            {recent.map(([date, pick]) => <PickRow key={date} date={date} pick={pick} />)}

            {Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0])).map(([monthKey, entries]) => {
              const [year, month] = monthKey.split('-')
              const label = new Date(Number(year), Number(month) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
              const mW = entries.filter(([,p]) => p.result === 'W').length
              const mL = entries.filter(([,p]) => p.result === 'L').length
              return (
                <MonthBucket key={monthKey} label={label} record={`${mW}W-${mL}L`} entries={entries} PickRow={PickRow} />
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
function MediaTab() {
  return (
    <div>
      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: '#aaa' }}>📺 MEDIA</h2>
        <TodoBox items={[
          "Discord integration: post to a #picks channel and app fetches and displays as a live feed (Discord bot + webhook, free)",
          "Twitter/X: dedicated account posts a pick tweet daily, paste URL into dev panel to render via Twitter embed script (free, manual)",
        ]} />
        <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>
          More coming soon.
        </p>
      </div>
      <div style={{ textAlign: 'center', padding: '4rem 0' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚧</div>
        <div style={{ color: '#333', fontSize: '0.9rem' }}>This section is under construction.</div>
      </div>
    </div>
  )
}
export default function App() {
  const [tab, setTab] = useState('lock')
  const [allGames, setAllGames] = useState([])
  const [loading, setLoading] = useState(false)
  const [cacheAge, setCacheAge] = useState(getCacheAge)
  const [devOpen, setDevOpen] = useState(false)
  const [devPassword, setDevPassword] = useState('')
  const [devUnlocked, setDevUnlocked] = useState(false)
  const [devMsg, setDevMsg] = useState('')
  const [devPending, setDevPending] = useState(null) // { action, value, label }
  const [todayLock, setTodayLock] = useState(null)
  const [todayDog, setTodayDog] = useState(null)

  async function refreshTodayLock() {
    const s = await loadState()
    setTodayLock(s.picks?.[getTodayKey()] || null)
  }

  async function refreshTodayDog() {
    try {
      const s = await loadDogState()
      setTodayDog(s.picks?.[getTodayKey()] || null)
    } catch { setTodayDog(null) }
  }

  const fetchOdds = async (force = false) => {
    if (!force) {
      const cached = getCachedOdds()
      if (cached) { setAllGames(cached); setCacheAge(getCacheAge()); return }
    }
    setLoading(true)
    const sports = getSportsInSeason()
    const results = []
    for (const sport of sports) {
      try {
        const res = await fetch(`https://api.the-odds-api.com/v4/sports/${sport.key}/odds/?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&bookmakers=betonlineag&oddsFormat=american`)
        const data = await res.json()
        if (Array.isArray(data)) data.forEach(g => results.push({ ...g, sportLabel: sport.label }))
      } catch (e) { }
    }
    setCachedOdds(results)
    setAllGames(results)
    setCacheAge(getCacheAge())
    setLoading(false)
  }

  useEffect(() => {
    // One-time migration: move any existing localStorage pick data to the server
    migrateLocalStorageToServer()
    fetchOdds()
    refreshTodayLock()
    refreshTodayDog()
    // Fire silently in background — data stored for future Props/Media tabs
    fetchAndCacheProps()
    fetchAndCachePlayerStats()
  }, [])

  async function devAction(action, value) {
    const s = await loadState()
    const todayKey = getTodayKey()
    switch (action) {
      case 'resetLock':
        if (s.picks?.[todayKey]) {
          s.coins = (s.coins || 0) + (s.picks[todayKey].stake || 0)
          delete s.picks[todayKey]
          setDevMsg("✅ Today's lock reset.")
        } else { setDevMsg('⚠ No lock today.') }
        break
      case 'resetDog': {
        const dog = await loadDogState()
        if (dog.picks?.[todayKey]) {
          delete dog.picks[todayKey]
          await saveDogStateServer(dog)
          setDevMsg("✅ Today's dog reset.")
        } else { setDevMsg('⚠ No dog pick today.') }
        return
      }
      case 'setResult':
        if (s.picks?.[todayKey]) {
          s.picks[todayKey].result = value
          s.streak = [...(s.streak || []), value]
          s.streakDates = [...(s.streakDates || []), todayKey]
          if (value === 'W') s.coins = (s.coins || 0) + calcPayout(s.picks[todayKey].odds, s.picks[todayKey].stake)
          setDevMsg(`✅ Set to ${value}.`)
        } else { setDevMsg('⚠ No pick today.') }
        break
      case 'resetProp': {
        const propPick = await loadPropPick()
        if (propPick[todayKey]) {
          delete propPick[todayKey]
          await savePropPick(propPick)
          setDevMsg("✅ Today's prop picks reset.")
        } else { setDevMsg('⚠ No prop picks today.') }
        return
      }
      case 'resetPredictions': {
        const pred = await loadPredictions()
        const lay = await loadLayHistory()
        delete pred[todayKey]
        delete lay[todayKey]
        await savePredictions(pred)
        await saveLayHistory(lay)
        setDevMsg("✅ Today's predictions + lay reset.")
        return
      }
      case 'resetAll':
        await saveAllData({})
        localStorage.removeItem(STORAGE_KEYS.ODDS_CACHE)
        setDevMsg('✅ Wiped. Refreshing...')
        setTimeout(() => window.location.reload(), 1000)
        return
      case 'restoreBackup': {
        try {
          const res = await fetch(`${SERVER}/restore-backup`, { method: 'POST' })
          if (res.ok) { setDevMsg('✅ Backup restored. Refreshing...'); setTimeout(() => window.location.reload(), 1000) }
          else { const e = await res.json(); setDevMsg(`⚠ ${e.error || 'No backup found'}`) }
        } catch { setDevMsg('⚠ Could not reach server') }
        return
      }
      case 'clearHistory':
        s.picks = {}
        s.streak = []
        s.streakDates = []
        setDevMsg('✅ History cleared.')
        break
    }
    await saveState(s)
  }

  const TABS = [
    ['odds',   '🎮 Games'],
    ['lock',   '🔒 Lock'],
    ['dogs',   '🐕 Dogs'],
    ['parlays','🎰 Parlays'],
    ['props',  '🎲 Props'],
    ['media',  '📺 Media'],
    ['live',   '⚡ Live'],
  ]

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', background: '#0f0f0f', minHeight: '100vh', color: 'white', maxWidth: '960px', margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 0.25rem' }}>🎰 BetOnMe</h1>
      <p style={{ color: '#444', marginBottom: '1.5rem', fontSize: '0.85rem' }}>Daily lock tracker</p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid #1a1a1a', paddingBottom: '1rem' }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '0.5rem 1.25rem',
            background: tab === key ? '#fff' : 'transparent',
            color: tab === key ? '#000' : '#555',
            border: tab === key ? 'none' : '1px solid #2a2a2a',
            borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'odds'    && <OddsDashboard allGames={allGames} loading={loading} onRefresh={() => fetchOdds(true)} cacheAge={cacheAge} />}
      {tab === 'lock'    && <LockOfTheDay allGames={allGames} loading={loading} onRefresh={() => fetchOdds(true)} cacheAge={cacheAge} onLockChange={refreshTodayLock} />}
      {tab === 'dogs'    && <DogOfTheDay allGames={allGames} loading={loading} onDogChange={refreshTodayDog} />}
      {tab === 'parlays' && <ParlaysTab allGames={allGames} loading={loading} todayLock={todayLock} todayDog={todayDog} onLockChange={refreshTodayLock} />}
      {tab === 'props'   && <PropsTab todayLock={todayLock} allGames={allGames} />}
      {tab === 'media'   && <MediaTab />}
      {tab === 'live'    && <LivePicksTab todayLock={todayLock} todayDog={todayDog} />}

      <div style={{ marginTop: '4rem', paddingBottom: '2rem', textAlign: 'center' }}>
        <button onClick={() => { setDevOpen(true); setDevUnlocked(false); setDevPassword(''); setDevMsg(''); setDevPending(null) }} style={{
          background: '#1a1a1a', border: '1px solid #444', color: '#888',
          padding: '0.6rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold',
        }}>⚙ Dev Panel</button>
      </div>

      {devOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#141414', border: '1px solid #333', borderRadius: '14px', padding: '2rem', width: '100%', maxWidth: '380px' }}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '1rem', color: '#888' }}>⚙ Dev Panel</h2>
            {!devUnlocked ? (
              <>
                <input type="password" placeholder="Password" value={devPassword}
                  onChange={e => setDevPassword(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (devPassword === 'Jesiah') setDevUnlocked(true)
                      else setDevMsg('❌ Wrong password')
                    }
                  }}
                  style={{ width: '100%', padding: '0.75rem', background: '#0f0f0f', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: '0.75rem' }}
                  autoFocus
                />
                {devMsg && <p style={{ color: '#ff4444', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{devMsg}</p>}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={() => setDevOpen(false)} style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: '#888', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={() => { if (devPassword === 'Jesiah') setDevUnlocked(true); else setDevMsg('❌ Wrong password') }}
                    style={{ flex: 1, padding: '0.75rem', background: '#222', border: '1px solid #444', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>Enter</button>
                </div>
              </>
            ) : devPending ? (
              <>
                <div style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.25rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠</div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '0.35rem' }}>{devPending.label}</div>
                  <div style={{ color: '#555', fontSize: '0.78rem' }}>Cannot be undone.</div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => { setDevPending(null); setDevMsg('') }}
                    style={{ flex: 1, padding: '0.85rem', background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: '#888', cursor: 'pointer', fontWeight: 'bold' }}
                  >Discard</button>
                  <button
                    onClick={async () => { await devAction(devPending.action, devPending.value); setDevPending(null) }}
                    style={{ flex: 1, padding: '0.85rem', background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '8px', color: '#ff4444', cursor: 'pointer', fontWeight: 'bold' }}
                  >Confirm</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                  <button onClick={() => setDevPending({ action: 'resetLock', label: "Reset Today's Lock" })} style={{ padding: '0.75rem', background: '#1a1a2a', border: '1px solid #4444aa', borderRadius: '8px', color: '#8888ff', cursor: 'pointer', fontWeight: 'bold' }}>🔄 Reset Today's Lock</button>
                  <button onClick={() => setDevPending({ action: 'resetDog', label: "Reset Today's Dog" })} style={{ padding: '0.75rem', background: '#1a1a2a', border: '1px solid #4444aa', borderRadius: '8px', color: '#8888ff', cursor: 'pointer', fontWeight: 'bold' }}>🔄 Reset Today's Dog</button>
                  <button onClick={() => setDevPending({ action: 'resetPredictions', label: "Reset Today's Predictions + Lay" })} style={{ padding: '0.75rem', background: '#1a1a2a', border: '1px solid #4444aa', borderRadius: '8px', color: '#8888ff', cursor: 'pointer', fontWeight: 'bold' }}>🔄 Reset Today's Predictions + Lay</button>
                  <button onClick={() => setDevPending({ action: 'resetProp', label: "Reset Today's Props" })} style={{ padding: '0.75rem', background: '#1a1a2a', border: '1px solid #4444aa', borderRadius: '8px', color: '#8888ff', cursor: 'pointer', fontWeight: 'bold' }}>🔄 Reset Today's Props</button>
                  <button onClick={() => window.open(`${SERVER}/export`, '_blank')} style={{ padding: '0.75rem', background: '#1a2a1a', border: '1px solid #44aa44', borderRadius: '8px', color: '#88ff88', cursor: 'pointer', fontWeight: 'bold' }}>💾 Export savedata.json</button>
                  <button onClick={() => setDevPending({ action: 'restoreBackup', label: 'Restore Last Backup' })} style={{ padding: '0.75rem', background: '#2a1a00', border: '1px solid #aa7700', borderRadius: '8px', color: '#ffaa44', cursor: 'pointer', fontWeight: 'bold' }}>↩ Restore Last Backup</button>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={() => setDevPending({ action: 'setResult', value: 'W', label: "Force WIN on today's lock" })} style={{ flex: 1, padding: '0.75rem', background: '#0a2a1a', border: '1px solid #00ff88', borderRadius: '8px', color: '#00ff88', cursor: 'pointer', fontWeight: 'bold' }}>✅ Force WIN</button>
                    <button onClick={() => setDevPending({ action: 'setResult', value: 'L', label: "Force LOSS on today's lock" })} style={{ flex: 1, padding: '0.75rem', background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '8px', color: '#ff4444', cursor: 'pointer', fontWeight: 'bold' }}>❌ Force LOSS</button>
                  </div>
                  <button onClick={() => setDevPending({ action: 'clearHistory', label: 'Clear all history & streak' })} style={{ padding: '0.75rem', background: '#1a1a1a', border: '1px solid #555', borderRadius: '8px', color: '#aaa', cursor: 'pointer', fontWeight: 'bold' }}>🗑 Clear History & Streak</button>
                  <button onClick={() => setDevPending({ action: 'resetAll', label: 'Reset EVERYTHING — wipe all data' })} style={{ padding: '0.75rem', background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '8px', color: '#ff4444', cursor: 'pointer', fontWeight: 'bold' }}>⚠ Reset Everything</button>
                </div>
                {devMsg && <p style={{ color: '#00ff88', fontSize: '0.85rem', marginBottom: '1rem' }}>{devMsg}</p>}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={() => { setDevOpen(false); setDevPending(null) }} style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid #333', borderRadius: '8px', color: '#888', cursor: 'pointer', fontWeight: 'bold' }}>Exit</button>
                  <button onClick={() => { setDevOpen(false); setDevPending(null); window.location.reload() }} style={{ flex: 1, padding: '0.75rem', background: '#111', border: '1px solid #444', borderRadius: '8px', color: '#aaa', cursor: 'pointer', fontWeight: 'bold' }}>Exit & Reload</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}