import React, { useState, useEffect } from 'react'
import { getTodayKey, ensureAmerican, formatOdds } from '../utils/odds.js'
import { STORAGE_KEYS, loadPropPick, savePropPick } from '../hooks/useSaveData.js'
import PropSection, { ODDS_API_PROP_MARKETS, PROP_MARKET_LABELS, MARKET_ORDER, MARKET_SECTION_LABELS } from '../components/PropSection.jsx'
import PropsInsightPanel from '../components/PropsInsightPanel.jsx'

const API_KEY = '9556a1b199876f898bdc45023a854ed2'

export default function PropsTab({ todayLock, allGames }) {
  const todayKey = getTodayKey()

  const [propPick, setPropPick] = useState({})
  const [propModal, setPropModal] = useState(null)
  const [selectedSide, setSelectedSide] = useState(null)
  const [propLines, setPropLines] = useState([])
  const [propsLoading, setPropsLoading] = useState(false)
  const [propsFetched, setPropsFetched] = useState(false)
  const [quotaRemaining, setQuotaRemaining] = useState(null)
  const [lastFetchTime, setLastFetchTime] = useState(null)
  const [propsError, setPropsError] = useState(null)
  const [renderError, setRenderError] = useState(null)
  const [tooLate, setTooLate] = useState(false)
  const [debugLog, setDebugLog] = useState([])
  const [showDebug, setShowDebug] = useState(false)

  const todayTeamPicks = propPick[todayKey] || {}

  useEffect(() => {
    loadPropPick().then(raw => {
      if (!raw) { setPropPick({}); return }
      // Migrate old format: picks keyed by team name → new format: keyed by marketKey
      const migrated = {}
      let dirty = false
      Object.entries(raw).forEach(([dateKey, dayPicks]) => {
        migrated[dateKey] = {}
        Object.entries(dayPicks || {}).forEach(([k, pick]) => {
          if (!pick) return
          // Key format: "teamName||marketKey" allows multiple picks per market (one per team)
          const isNewFormat = k.includes('||')
          const isOldMarketKey = k.includes('_') && !k.includes(' ') && !k.includes('||')
          const isOldTeamKey = k.includes(' ')
          if (isNewFormat) {
            migrated[dateKey][k] = pick
          } else if (isOldTeamKey || isOldMarketKey) {
            // Migrate to new team||marketKey format
            const team = pick.team || k
            const mKey = pick.marketKey
            if (team && mKey) {
              const newKey = `${team}||${mKey}`
              migrated[dateKey][newKey] = { ...pick }
              dirty = true
            }
          }
        })
      })
      setPropPick(migrated)
      if (dirty) savePropPick(migrated)
    })
  }, [])

  // pickedTeams: "team||marketKey" -> "player|marketKey" — one pick per team per market
  const pickedTeams = {}
  Object.entries(todayTeamPicks).forEach(([teamMKey, pick]) => {
    if (pick?.player) pickedTeams[teamMKey] = `${pick.player}|${pick.marketKey}`
  })

  const SPORT_KEY_MAP = { NBA: 'basketball_nba', MLB: 'baseball_mlb', NFL: 'americanfootball_nfl' }
  const sportLabel = todayLock?.sport || null
  const sportKey = sportLabel ? SPORT_KEY_MAP[sportLabel] : null
  // todayLock.gameId is now an ESPN ID — resolve to odds-api event ID for props
  const espnGameId = todayLock?.gameId || null
  const lockHome = todayLock?.home || null
  const lockAway = todayLock?.away || null
  const propsCacheKey = `${todayKey}_${espnGameId}`

  // Resolve ESPN game ID to the-odds-api event ID by matching team names
  async function resolveOddsApiEventId() {
    if (!sportKey || !lockHome || !lockAway) return null
    // Check localStorage cache first
    const cacheKey = `oddsApiEventId_${espnGameId}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) return cached
    try {
      const res = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sportKey}/events?apiKey=${API_KEY}&oddsFormat=american`
      )
      const events = await res.json()
      if (!Array.isArray(events)) return null
      const match = events.find(e => {
        const ht = e.home_team?.toLowerCase()
        const at = e.away_team?.toLowerCase()
        const lockH = lockHome.toLowerCase()
        const lockA = lockAway.toLowerCase()
        return (ht && lockH.includes(ht) || ht?.includes(lockH)) &&
               (at && lockA.includes(at) || at?.includes(lockA))
      })
      if (match?.id) {
        localStorage.setItem(cacheKey, match.id)
        return match.id
      }
    } catch (e) {
      console.error('[Props] resolveOddsApiEventId failed', e)
    }
    return null
  }

  // Try to load props from local DK scraper first (free)
  async function fetchDkProps() {
    if (!espnGameId || !sportLabel) return []
    try {
      const r = await fetch('http://127.0.0.1:3001/dk-props?sport=' + sportLabel)
      if (!r.ok) return []
      const data = await r.json()
      const sportData = data[sportLabel]
      if (!sportData?.props?.length) return []

      // Find props for the locked game by matching team name
      const lockGame = allGames.find(g => g.id === espnGameId)
      const homeTeamName = lockGame?.home_team || lockHome || ''
      const awayTeamName = lockGame?.away_team || lockAway || ''

      const matchingProps = sportData.props.filter(p => {
        const h = homeTeamName.toLowerCase()
        const a = awayTeamName.toLowerCase()
        return p.home?.toLowerCase().includes(h.split(' ').pop()) ||
               h.includes(p.home?.toLowerCase().split(' ').pop() || '') ||
               p.away?.toLowerCase().includes(a.split(' ').pop()) ||
               a.includes(p.away?.toLowerCase().split(' ').pop() || '')
      })

      if (!matchingProps.length) return []

      // Normalize DK props to our propLines format
      // Group by player + marketType, find the main line for each
      const playerMarkets = {}
      matchingProps.forEach(p => {
        const key = `${p.player}||${p.subcategoryId}`
        if (!playerMarkets[key]) playerMarkets[key] = []
        playerMarkets[key].push(p)
      })

      const lines = []
      Object.entries(playerMarkets).forEach(([key, props]) => {
        const main = props.find(p => p.isMainLine) || props[Math.floor(props.length / 2)]
        if (!main) return
        const marketKey = main.subcategoryId === '17323' ? 'pitcher_strikeouts' : main.subcategoryId
        lines.push({
          playerName: main.player,
          marketKey,
          marketLabel: main.marketName.replace(` ${main.player} `, ' '),
          line: main.line,
          overOdds: main.odds,
          underOdds: null,  // milestone format has no under
          isMainLine: true,
          source: 'DraftKings (local)',
          lastSeasonStat: main.lastSeasonStat,
          lastSeasonLabel: main.lastSeasonLabel,
          allLines: props.map(p => ({ label: p.label, odds: p.odds, line: p.line })),
        })
      })
      return lines
    } catch (e) {
      console.log('[Props] DK local props unavailable:', e.message)
      return []
    }
  }

  async function fetchProps(force = false) {
    if (!espnGameId || !sportKey || !sportLabel) return

    setPropsLoading(true)

    // Try DK local scraper first — free, no credits
    const dkLines = await fetchDkProps()
    if (dkLines.length > 0) {
      console.log(`[Props] Using DK local data — ${dkLines.length} prop lines`)
      setPropLines(dkLines)
      setPropsFetched(true)
      setPropsLoading(false)
      setPropsError(null)
      return
    }

    // Fall back to the-odds-api if DK scraper has no data
    console.log('[Props] DK local empty, falling back to the-odds-api')

    // Resolve ESPN game ID to the-odds-api event ID
    const eventId = await resolveOddsApiEventId()
    if (!eventId) {
      setPropsError('Could not find this game in the odds API.')
      setPropsFetched(true)
      setPropsLoading(false)
      return
    }

    // Only block props if the lock game has a result (i.e. it's actually over)
    const lockGame = allGames.find(g => g.id === espnGameId)
    // We only set tooLate if we have positive evidence the game is over

    if (!force) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.PROPS_DAY_CACHE)
        if (raw) {
          const cache = JSON.parse(raw)
          if (cache[propsCacheKey]) {
            // If we previously cached an error, check if it was a 429
            // 429s should always be retried on fresh load (quota may have freed up)
            if (cache[propsCacheKey].error) {
              if (cache[propsCacheKey].error.includes('429')) {
                // Clear the cached 429 and fall through to live fetch
                delete cache[propsCacheKey]
                localStorage.setItem(STORAGE_KEYS.PROPS_DAY_CACHE, JSON.stringify(cache))
              } else {
                setPropsError(cache[propsCacheKey].error)
                setPropsFetched(true)
                return
              }
            }
            // Expire cache after 2 hours so new markets (like HR lines) get picked up
            // 8h TTL — 3 fetches/day
            const age = Date.now() - (cache[propsCacheKey].fetchedAt || 0)
            const cacheExpired = age > 8 * 60 * 60 * 1000
            if (cacheExpired) {
              console.log('[Props] Cache expired (12h), re-fetching')
              // fall through to live fetch
            } else {
              const cached = cache[propsCacheKey].lines || []
              setLastFetchTime(cache[propsCacheKey].fetchedAt || null)
              setPropLines(cached)
              setPropsFetched(true)
              return
            }
          }
        }
      } catch {}
    }
    setPropsLoading(true)
    setPropsError(null)
    setDebugLog([])
    // On force refresh, clear any cached error so we actually retry
    if (force) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.PROPS_DAY_CACHE)
        if (raw) {
          const cache = JSON.parse(raw)
          if (cache[propsCacheKey]?.error) {
            delete cache[propsCacheKey]
            localStorage.setItem(STORAGE_KEYS.PROPS_DAY_CACHE, JSON.stringify(cache))
          }
        }
      } catch {}
    }
    try {
      const allMarkets = ODDS_API_PROP_MARKETS[sportLabel] || []
      const lockGame = allGames.find(g => g.id === espnGameId)
      const homeTeam = lockGame?.home_team || todayLock?.home || ''
      const awayTeam = lockGame?.away_team || todayLock?.away || ''

      // Split into chunks of 4 to stay under URL length limits
      // Fixed chunks: pitcher props separate from batter props
      // Keeps URLs short enough that DraftKings doesn't silently drop markets
      const PITCHER_MARKETS = allMarkets.filter(m => m.startsWith('pitcher_'))
      const BATTER_MARKETS  = allMarkets.filter(m => m.startsWith('batter_'))
      const chunks = []
      if (PITCHER_MARKETS.length) chunks.push(PITCHER_MARKETS)
      // Split batters into 2 chunks of ~5 each
      const mid = Math.ceil(BATTER_MARKETS.length / 2)
      if (BATTER_MARKETS.length) {
        chunks.push(BATTER_MARKETS.slice(0, mid))
        if (BATTER_MARKETS.slice(mid).length) chunks.push(BATTER_MARKETS.slice(mid))
      }
      const baseUrl = `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${eventId}/odds?apiKey=${API_KEY}&regions=us&oddsFormat=american&bookmakers=draftkings,fanduel`

      const dbg = [`🔍 Fetching ${allMarkets.length} markets in ${chunks.length} chunks`, `📋 Markets requested: ${allMarkets.join(', ')}`]

      // Fetch chunks sequentially with small delay to avoid hammering quota
      // 429 = quota exceeded — show a specific message instead of generic error
      const results = []
      let hit429 = false
      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci]
        if (ci > 0) await new Promise(r => setTimeout(r, 200)) // 200ms between requests
        try {
          const r = await fetch(`${baseUrl}&markets=${chunk.join(',')}`)
          dbg.push(`Chunk ${ci+1} [${chunk.join(', ')}]: HTTP ${r.status}`)
          const remaining = r.headers.get('x-requests-remaining')
          const used = r.headers.get('x-requests-used')
          if (remaining !== null) {
            dbg.push(`📊 Quota: ${remaining} remaining / ${used} used this month`)
            setQuotaRemaining(parseInt(remaining))
          }
          if (r.status === 429) {
            hit429 = true
            results.push(null)
            dbg.push(`⚠ 429 — API quota hit, stopping`)
            break
          }
          results.push(r.ok ? await r.json() : null)
        } catch (e) {
          dbg.push(`Chunk ${ci+1} error: ${e.message}`)
          results.push(null)
        }
      }

      // Log what each bookmaker returned per chunk
      results.forEach((data, ci) => {
        if (!data) { dbg.push(`Chunk ${ci+1}: null response`); return }
        const bms = data.bookmakers || []
        if (!bms.length) { dbg.push(`Chunk ${ci+1}: no bookmakers in response`); return }
        bms.forEach(bm => {
          const keys = (bm.markets || []).map(m => `${m.key}(${(m.outcomes||[]).length/2|0})`).join(', ')
          dbg.push(`Chunk ${ci+1} · ${bm.title}: ${keys || 'NO MARKETS'}`)
        })
      })

      setDebugLog(dbg)

      if (hit429) {
        const errMsg = '⚠ API quota exceeded (429) — free tier allows 500 requests/month. Resets monthly. Check https://the-odds-api.com/account/'
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.PROPS_DAY_CACHE)
          const cache = raw ? JSON.parse(raw) : {}
          // Don't cache 429 errors — quota resets, so we should retry tomorrow
          localStorage.setItem(STORAGE_KEYS.PROPS_DAY_CACHE, JSON.stringify(cache))
        } catch {}
        setPropsError(errMsg)
        setPropsLoading(false)
        setPropsFetched(true)
        return
      }

      if (results.every(r => r === null)) {
        const errMsg = 'No props available for this game.'
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.PROPS_DAY_CACHE)
          const cache = raw ? JSON.parse(raw) : {}
          cache[propsCacheKey] = { error: errMsg, fetchedAt: Date.now() }
          localStorage.setItem(STORAGE_KEYS.PROPS_DAY_CACHE, JSON.stringify(cache))
        } catch {}
        setPropsError(errMsg)
        setPropsLoading(false)
        setPropsFetched(true)
        return
      }

      const lines = []
      const seenPlayerMarket = new Set()  // dedupe across bookmakers

      for (const data of results) {
        if (!data) continue
        // Loop all bookmakers returned (fanduel + draftkings) — take first seen per player+market
        for (const bm of (data.bookmakers || [])) {
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
              const dedupeKey = `${player}||${market.key}`
              if (seenPlayerMarket.has(dedupeKey)) return  // already got this from a better book
              seenPlayerMarket.add(dedupeKey)
              lines.push({
                player, marketKey: market.key, label, line,
                overOdds: sides.over?.price ?? -110,
                underOdds: sides.under?.price ?? -110,
                team: '',
              })
            })
          })
        }
      }

      // No team-split heuristic — the API doesn't return player teams
      // Use marketKey as the pick grouping key instead
      const taggedLines = lines

      try {
        const raw = localStorage.getItem(STORAGE_KEYS.PROPS_DAY_CACHE)
        const cache = raw ? JSON.parse(raw) : {}
        const now = Date.now()
        cache[propsCacheKey] = { lines: taggedLines, fetchedAt: now }
        setLastFetchTime(now)
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
    if (todayLock && allGames.length > 0 && !propsFetched && !propsLoading) fetchProps(false)
  }, [todayLock, allGames])

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
        [`${propModal.team || 'unknown'}||${propModal.marketKey}`]: {
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

  const lockGame = allGames.find(g => g.id === espnGameId)
  const lockHomeTeam = lockGame?.home_team || todayLock?.home || ''
  const lockAwayTeam = lockGame?.away_team || todayLock?.away || ''

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
              One pick per market · <span style={{ color: '#8888ff' }}>{propModal.label}</span>
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

      <PropsInsightPanel propPick={propPick} />

      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: '#aaa' }}>🎲 PROPS</h2>
        <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>One pick per market per day — from your lock game.</p>
      </div>

      {!todayLock && (
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔒</div>
          <div style={{ color: '#555', fontSize: '0.88rem' }}>Make your Lock of the Day first — props are pulled from that game.</div>
        </div>
      )}

      {/* Sneak peek always visible — shows upcoming lines even without a lock */}
      {!todayLock && (
        <PropsSneakPeek propLines={[]} allGames={allGames} />
      )}

      {todayLock && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#555' }}>
              {sportLabel} · {todayLock.home} vs {todayLock.away}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>

              <span style={{ fontSize: '0.68rem', color: '#555' }}>
                {lastFetchTime
                  ? `updated ${new Date(lastFetchTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} · refreshes every 8h`
                  : 'loading...'}
              </span>
              {debugLog.length > 0 && (
                <button onClick={() => setShowDebug(d => !d)} style={{ padding: '0.35rem 0.85rem', background: showDebug ? '#1a1a2a' : '#1a1a1a', color: showDebug ? '#8888ff' : '#555', border: `1px solid ${showDebug ? '#8888ff44' : '#2a2a2a'}`, borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' }}>
                  🔍 Debug
                </button>
              )}
            </div>
          </div>

          {showDebug && debugLog.length > 0 && (
            <div style={{ background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', fontFamily: 'monospace' }}>
              <div style={{ fontSize: '0.65rem', color: '#8888ff', fontWeight: 'bold', marginBottom: '0.5rem', letterSpacing: '0.06em' }}>API DEBUG LOG</div>
              {debugLog.map((line, i) => (
                <div key={i} style={{ fontSize: '0.68rem', color: line.startsWith('✓') ? '#00ff88' : line.includes('error') || line.includes('null') || line.includes('NO MARKETS') ? '#ff4444' : '#666', marginBottom: '0.2rem', wordBreak: 'break-all' }}>
                  {line}
                </div>
              ))}
            </div>
          )}

          {Object.keys(todayTeamPicks).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {Object.entries(todayTeamPicks).map(([teamMKey, pick]) => {
                if (!pick) return null
                const team = pick.team || ''
                return (
                  <div key={teamMKey} style={{
                    background: '#111',
                    border: `1px solid ${pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#8888ff44'}`,
                    borderRadius: '10px', padding: '0.85rem 1.1rem',
                  }}>
                    <div style={{ fontSize: '0.65rem', color: '#8888ff', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                      🎲 {pick.label?.toUpperCase() || pick.marketKey.toUpperCase()}
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

          {tooLate ? (
            <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '2rem 1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🌙</div>
              <div style={{ fontWeight: 'bold', color: '#aaa', fontSize: '1rem', marginBottom: '0.4rem' }}>Aww, you're too late</div>
              <div style={{ color: '#444', fontSize: '0.82rem', lineHeight: '1.55' }}>
                Today's games are already underway or finished — props are no longer available.<br />
                Come back tomorrow and get your pick in early.
              </div>
            </div>
          ) : null}

          {propsFetched && !propsLoading && !propsError && propLines.length === 0 && (
            <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.25rem' }}>
              <div style={{ fontWeight: 'bold', color: '#888', marginBottom: '0.25rem' }}>No prop lines available yet.</div>
              <div style={{ color: '#444', fontSize: '0.78rem' }}>Props typically drop a few hours before game time. Check back soon.</div>
            </div>
          )}

          {propLines.length > 0 && (() => {
            const sections = MARKET_SECTION_LABELS[sportLabel]
            let pitcherHeaderShown = false
            let batterHeaderShown = false
            return (
              <div>
                {groupedProps.map((group, i) => {
                  const isPitcherMarket = sections?.pitcher?.keys?.includes(group.marketKey)
                  const isBatterMarket = sections?.batter?.keys?.includes(group.marketKey)
                  const showPitcherHeader = isPitcherMarket && !pitcherHeaderShown && (pitcherHeaderShown = true)
                  const showBatterHeader = isBatterMarket && !batterHeaderShown && (batterHeaderShown = true)
                  return (
                    <React.Fragment key={group.marketKey}>
                      {showPitcherHeader && (
                        <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.5rem 0.25rem 0.4rem', marginTop: i > 0 ? '0.5rem' : 0 }}>
                          ⚾ Pitcher Props
                        </div>
                      )}
                      {showBatterHeader && (
                        <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.5rem 0.25rem 0.4rem', marginTop: '0.5rem' }}>
                          🥎 Batter Props
                        </div>
                      )}
                      <PropSection
                        marketKey={group.marketKey}
                        label={group.label}
                        props={group.props}
                        pickedTeams={pickedTeams}
                        onPick={openPropModal}
                        defaultOpen={i === 0}
                        homeTeam={lockHomeTeam}
                        awayTeam={lockAwayTeam}
                        teamColorMap={teamColorMap}
                      />
                    </React.Fragment>
                  )
                })}
              </div>
            )
          })()}

          {/* Error banner — only show if props failed AND nothing loaded */}
          {propsError && !propsLoading && !tooLate && propLines.length === 0 && (
            <div style={{ background: '#1a0a0a', border: '1px solid #ff444422', borderRadius: '10px', padding: '0.85rem 1.1rem', marginTop: '1rem' }}>
              <div style={{ color: '#ff6644', fontSize: '0.78rem', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                ⚠ Props unavailable
              </div>
              <div style={{ color: '#555', fontSize: '0.75rem', lineHeight: 1.5 }}>{propsError}</div>
            </div>
          )}

          {/* ── Sneak Peek — raw prop lines debug ── */}
          {propLines.length > 0 && (
            <PropsSneakPeek propLines={propLines} allGames={allGames} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── SNEAK PEEK COMPONENT ────────────────────────────────────────────────────
// Shows pitcher strikeout props for all upcoming games from DK scraper
function PropsSneakPeek({ propLines, allGames }) {
  const [open, setOpen] = React.useState(true)
  const [dkProps, setDkProps] = React.useState([])
  const [visiblePerGame, setVisiblePerGame] = React.useState({})

  React.useEffect(() => {
    // Fetch props for all sports on mount
    fetch('http://127.0.0.1:3001/dk-props')
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        const allProps = Object.values(data).flatMap(sd => sd.props || [])
        setDkProps(allProps.filter(p => p.isMainLine))
      })
      .catch(() => {})
  }, [])

  // Group props by eventId → player → market
  const MARKET_LABELS = {
    '15221': 'Ks',
    '17413': 'Outs',
  }

  const byGame = {}
  dkProps.forEach(p => {
    if (!byGame[p.eventId]) byGame[p.eventId] = { home: p.home, away: p.away, players: {} }
    const key = p.player
    if (!byGame[p.eventId].players[key]) byGame[p.eventId].players[key] = {}
    byGame[p.eventId].players[key][p.subcategoryId] = p
  })

  // Group locked game's player props by market
  const markets = {}
  propLines.forEach(p => {
    if (!markets[p.marketKey]) markets[p.marketKey] = []
    markets[p.marketKey].push(p)
  })
  const marketKeys = Object.keys(markets)

  return (
    <div style={{ marginTop: '1.5rem', border: '1px solid #1a1a1a', borderRadius: '10px', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', padding: '0.75rem 1rem', background: '#111',
        border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: '0.68rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.07em' }}>
          🔬 PITCHER PROPS · {dkProps.length > 0 ? `${Object.keys(byGame).length} games · ${dkProps.length} props` : 'run dk_scraper.py to load'}
        </span>
        <span style={{ color: '#444', fontSize: '0.7rem' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ background: '#0d0d0d', padding: '0.75rem' }}>

          {/* Player props for locked game */}
          {marketKeys.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.6rem', color: '#00ff88', fontWeight: 'bold', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>
                🔒 LOCKED GAME · {marketKeys.length} prop markets
              </div>
              {marketKeys.map(mKey => {
                const lines = markets[mKey]
                const shown = lines.slice(0, visibleCount)
                return (
                  <div key={mKey} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.6rem', color: '#333', fontWeight: 'bold', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
                      {mKey.replace(/_/g, ' ').toUpperCase()}
                    </div>
                    {shown.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#555', padding: '0.2rem 0', borderBottom: '1px solid #111' }}>
                        <span style={{ color: '#777' }}>{p.playerName}</span>
                        <span style={{ fontFamily: 'monospace' }}>
                          {p.line}&nbsp;
                          <span style={{ color: p.overOdds > 0 ? '#ff9944' : '#aaa' }}>o{p.overOdds > 0 ? '+' : ''}{p.overOdds}</span>
                          {' / '}
                          <span style={{ color: p.underOdds > 0 ? '#ff9944' : '#aaa' }}>u{p.underOdds > 0 ? '+' : ''}{p.underOdds}</span>
                        </span>
                      </div>
                    ))}
                    {lines.length > visibleCount && (
                      <button onClick={() => setVisibleCount(v => v + 6)} style={{
                        background: 'none', border: 'none', color: '#444', cursor: 'pointer',
                        fontSize: '0.65rem', marginTop: '0.3rem', padding: 0,
                      }}>
                        + {lines.length - visibleCount} more
                      </button>
                    )}
                    {visibleCount > 3 && (
                      <button onClick={() => setVisibleCount(3)} style={{
                        background: 'none', border: 'none', color: '#333', cursor: 'pointer',
                        fontSize: '0.65rem', marginTop: '0.3rem', marginLeft: '0.5rem', padding: 0,
                      }}>
                        show less
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* DK Pitcher Props by game */}
          {Object.keys(byGame).length > 0 && (
            <div>
              <div style={{ fontSize: '0.6rem', color: '#4c9be8', fontWeight: 'bold', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>
                ⚾ PITCHER STRIKEOUTS (DraftKings · free)
              </div>
              {Object.entries(byGame).map(([eventId, game]) => {
                const shown = visiblePerGame[eventId] || 2
                const players = Object.keys(game.players)
                return (
                  <div key={eventId} style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid #111' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#666', marginBottom: '0.3rem' }}>
                      {game.away?.split(' ').pop()} @ {game.home?.split(' ').pop()}
                    </div>
                    {Object.entries(game.players).slice(0, shown).map(([playerName, markets]) => (
                      <div key={playerName} style={{ padding: '0.25rem 0', borderBottom: '1px solid #0d0d0d' }}>
                        <div style={{ color: '#888', fontSize: '0.72rem', marginBottom: '0.15rem' }}>{playerName}</div>
                        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                          {['15221', '17413'].map(subId => {
                            const label = MARKET_LABELS[subId]
                            const prop = markets[subId]
                            if (!prop) return (
                              <span key={subId} style={{ fontSize: '0.68rem', color: '#333' }}>
                                {label}: <span style={{ color: '#2a2a2a' }}>TBA</span>
                              </span>
                            )
                            return (
                              <span key={subId} style={{ fontSize: '0.68rem' }}>
                                <span style={{ color: '#555' }}>{label} {prop.line}</span>
                                {' '}
                                <span style={{ color: '#4c9be8' }}>o{prop.overOdds > 0 ? '+' : ''}{prop.overOdds}</span>
                                {' / '}
                                <span style={{ color: '#8888ff' }}>u{prop.underOdds > 0 ? '+' : ''}{prop.underOdds}</span>
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    {Object.keys(game.players).length > shown && (
                      <button onClick={() => setVisiblePerGame(v => ({ ...v, [eventId]: shown + 3 }))}
                        style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: '0.62rem', padding: '0.15rem 0' }}>
                        + {Object.keys(game.players).length - shown} more
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {Object.keys(byGame).length === 0 && dkProps.length === 0 && (
            <div style={{ color: '#333', fontSize: '0.72rem', textAlign: 'center', padding: '1rem' }}>
              Run dk_scraper.py to load props
            </div>
          )}
        </div>
      )}
    </div>
  )
}