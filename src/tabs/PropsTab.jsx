import React, { useState, useEffect } from 'react'
import { getTodayKey, ensureAmerican, formatOdds } from '../utils/odds.js'
import { STORAGE_KEYS, loadPropPick, savePropPick } from '../hooks/useSaveData.js'
import PropSection, { ODDS_API_PROP_MARKETS, PROP_MARKET_LABELS, MARKET_ORDER, MARKET_SECTION_LABELS } from '../components/PropSection.jsx'
import PropsInsightPanel from '../components/PropsInsightPanel.jsx'


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
  const [tooLate, setTooLate] = useState(false)

  const todayTeamPicks = propPick[todayKey] || {}

  // Yesterday's picks — shown read-only for grading after the game
  const yesterdayKey = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0')
  })()
  const yesterdayTeamPicks = propPick[yesterdayKey] || {}

  const SUBCAT_TO_KEY = {
    '15221': 'pitcher_strikeouts',
    '17413': 'pitcher_outs_recorded',
    '17319': 'batter_home_runs',
    '17320': 'batter_hits',
  }

  useEffect(() => {
    loadPropPick().then(raw => {
      if (!raw) { setPropPick({}); return }
      const migrated = {}
      let dirty = false
      Object.entries(raw).forEach(([dateKey, dayPicks]) => {
        migrated[dateKey] = {}
        Object.entries(dayPicks || {}).forEach(([k, pick]) => {
          if (!pick) return
          const isNewFormat = k.includes('||')
          const isOldMarketKey = k.includes('_') && !k.includes(' ') && !k.includes('||')
          const isOldTeamKey = k.includes(' ')

          if (isNewFormat) {
            // Could still have raw subcategoryId after the || — remap if needed
            const [player, mKey] = k.split('||')
            const slugKey = SUBCAT_TO_KEY[mKey] || mKey
            const newKey = `${player}||${slugKey}`
            const slugLabel = mKey === '15221' ? 'Strikeouts O/U' : mKey === '17413' ? 'Outs Recorded O/U' : pick.label
            if (newKey !== k || slugKey !== mKey) {
              migrated[dateKey][newKey] = { ...pick, marketKey: slugKey, label: slugLabel }
              dirty = true
            } else {
              migrated[dateKey][k] = pick
            }
          } else if (isOldTeamKey || isOldMarketKey) {
            const team = pick.player || pick.team || k
            const mKey = SUBCAT_TO_KEY[pick.marketKey] || pick.marketKey
            if (team && mKey) {
              migrated[dateKey][`${team}||${mKey}`] = { ...pick, marketKey: mKey }
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

  // Load props from local DK scraper — free, no API quota
  async function fetchDkProps() {
    if (!espnGameId || !sportLabel) return []
    try {
      const r = await fetch('http://127.0.0.1:3001/dk-props?sport=' + sportLabel)
      if (!r.ok) return []
      const data = await r.json()
      const sportData = data[sportLabel]
      if (!sportData?.props?.length) return []

      // Match props to the locked game by last word of team name (e.g. "Astros", "Angels")
      const lockGame = allGames.find(g => g.id === espnGameId)
      const homeTeamName = (lockGame?.home_team || lockHome || '').toLowerCase()
      const awayTeamName = (lockGame?.away_team || lockAway || '').toLowerCase()
      const lastWord = s => s.trim().split(' ').pop()

      const matchingProps = sportData.props.filter(p => {
        const ph = (p.home || '').toLowerCase()
        const pa = (p.away || '').toLowerCase()
        return lastWord(ph) === lastWord(homeTeamName) ||
               lastWord(pa) === lastWord(awayTeamName) ||
               homeTeamName.includes(lastWord(ph)) ||
               awayTeamName.includes(lastWord(pa))
      }).filter(p => p.isMainLine)  // only main lines, not alternates

      if (!matchingProps.length) return []

      // DK props are O/U format — each prop has overOdds + underOdds directly
      // Dedupe to one entry per player+market
      const seen = new Set()
      const lines = []
      matchingProps.forEach(p => {
        const key = `${p.player}||${p.subcategoryId}`
        if (seen.has(key)) return
        seen.add(key)
        const slugKey = SUBCAT_TO_KEY[String(p.subcategoryId)] || p.subcategoryId
        const label = p.marketType || p.marketName?.replace(p.player, '').trim() || slugKey
        lines.push({
          playerName: p.player,
          marketKey: slugKey,
          label,
          line: p.line,
          overOdds: p.overOdds,
          underOdds: p.underOdds,
          team: p.team || p.away,
          home: p.home,
          away: p.away,
          source: 'DraftKings (local)',
          lastSeasonStat: p.lastSeasonStat,
          lastSeasonLabel: p.lastSeasonLabel,
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

    // No data from scraper — prompt user to run it
    setPropsError('No props data from scraper — hit \'Scrape Now\' in the app header to pull fresh DK props.')
    setPropsLoading(false)
    setPropsFetched(true)
  }

  useEffect(() => {
    if (todayLock && allGames.length > 0 && !propsFetched && !propsLoading) fetchProps(false)
  }, [todayLock, allGames])

  function openPropModal(prop, preselectedSide = null) {
    setSelectedSide(preselectedSide)
    setPropModal(prop)
  }

  async function confirmPropPick() {
    if (!propModal || !selectedSide) return
    const updated = {
      ...propPick,
      [todayKey]: {
        ...todayTeamPicks,
        [`${propModal.player}||${propModal.marketKey}`]: {
          player: propModal.player,
          marketKey: propModal.marketKey,
          label: propModal.label,
          line: propModal.line,
          side: selectedSide,
          odds: selectedSide === 'over' ? propModal.overOdds : propModal.underOdds,
          sport: sportLabel,
          team: propModal.team,
          home: lockGame?.home_team || lockHome || propModal.home || null,
          away: lockGame?.away_team || lockAway || propModal.away || null,
          gameId: espnGameId || null,
          result: null,
        }
      }
    }
    await savePropPick(updated)
    setPropPick(updated)
    setPropModal(null)
    setSelectedSide(null)
  }

  async function gradeProp(teamMKey, result) {
    const updated = {
      ...propPick,
      [todayKey]: {
        ...todayTeamPicks,
        [teamMKey]: { ...todayTeamPicks[teamMKey], result },
      }
    }
    await savePropPick(updated)
    setPropPick(updated)
  }

  async function gradeYesterdayProp(teamMKey, result) {
    const updated = {
      ...propPick,
      [yesterdayKey]: {
        ...yesterdayTeamPicks,
        [teamMKey]: { ...yesterdayTeamPicks[teamMKey], result },
      }
    }
    await savePropPick(updated)
    setPropPick(updated)
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
        <PropsSneakPeek propLines={[]} allGames={allGames} onPick={openPropModal} todayPicks={todayTeamPicks} />
      )}

      {todayLock && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#555' }}>
              {sportLabel} · {todayLock.home} vs {todayLock.away}
            </div>
            <span style={{ fontSize: '0.68rem', color: '#555' }}>via DraftKings scraper</span>
          </div>


          {/* ── Yesterday's prop picks ── */}
          {Object.keys(yesterdayTeamPicks).length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.62rem', color: '#444', fontWeight: 'bold', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>
                YESTERDAY
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {Object.entries(yesterdayTeamPicks).map(([teamMKey, pick]) => {
                  if (!pick) return null
                  const sportIcon = pick.sport === 'NBA' ? '🏀' : pick.sport === 'NFL' ? '🏈' : '⚾'
                  const isPitcher = ['pitcher_strikeouts','pitcher_outs_recorded','pitcher_hits_allowed','pitcher_walks','pitcher_earned_runs'].includes(pick.marketKey)
                  const categoryLabel = pick.sport === 'MLB' ? (isPitcher ? 'PITCHER' : 'BATTER') : pick.sport || 'PROP'
                  return (
                    <div key={teamMKey} style={{
                      background: '#0d0d0d',
                      border: `1px solid ${pick.result === 'W' ? '#00ff8844' : pick.result === 'L' ? '#ff444444' : '#ffffff11'}`,
                      borderRadius: '10px', padding: '0.85rem 1.1rem', opacity: 0.85,
                    }}>
                      <div style={{ fontSize: '0.62rem', color: '#444', fontWeight: 'bold', letterSpacing: '0.07em', marginBottom: '0.35rem' }}>
                        {sportIcon} {categoryLabel}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#888' }}>{pick.player}</div>
                          <div style={{ color: '#444', fontSize: '0.75rem' }}>
                            {pick.label} · {pick.side === 'over' ? '⬆ Over' : '⬇ Under'} {pick.line}
                          </div>
                        </div>
                        <div style={{ fontWeight: 'bold', fontSize: '1rem', color: pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#444' }}>{formatOdds(pick.odds)}</div>
                      </div>
                      {pick.result === null && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: '#333', fontSize: '0.7rem' }}>⏳ Pending</span>
                          <div style={{ display: 'flex', gap: '0.4rem', marginLeft: 'auto' }}>
                            <button onClick={() => gradeYesterdayProp(teamMKey, 'W')} style={{ fontSize: '0.68rem', padding: '0.2rem 0.6rem', background: '#0a2a1a', border: '1px solid #00ff88', borderRadius: '5px', color: '#00ff88', cursor: 'pointer', fontWeight: 'bold' }}>✅ W</button>
                            <button onClick={() => gradeYesterdayProp(teamMKey, 'L')} style={{ fontSize: '0.68rem', padding: '0.2rem 0.6rem', background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '5px', color: '#ff4444', cursor: 'pointer', fontWeight: 'bold' }}>❌ L</button>
                          </div>
                        </div>
                      )}
                      {pick.result === 'W' && <div style={{ marginTop: '0.35rem', color: '#00ff88', fontWeight: 'bold', fontSize: '0.85rem' }}>✅ WIN</div>}
                      {pick.result === 'L' && <div style={{ marginTop: '0.35rem', color: '#ff4444', fontWeight: 'bold', fontSize: '0.85rem' }}>❌ LOSS</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Today's prop picks ── */}
          {Object.keys(todayTeamPicks).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {Object.entries(todayTeamPicks).map(([teamMKey, pick]) => {
                if (!pick) return null
                const sportIcon = pick.sport === 'NBA' ? '🏀' : pick.sport === 'NFL' ? '🏈' : '⚾'
                const isPitcher = ['pitcher_strikeouts','pitcher_outs_recorded','pitcher_hits_allowed','pitcher_walks','pitcher_earned_runs'].includes(pick.marketKey)
                const categoryLabel = pick.sport === 'MLB' ? (isPitcher ? 'PITCHER' : 'BATTER') : pick.sport || 'PROP'
                return (
                  <div key={teamMKey} style={{
                    background: '#111',
                    border: `1px solid ${pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#8888ff44'}`,
                    borderRadius: '10px', padding: '0.85rem 1.1rem',
                  }}>
                    <div style={{ fontSize: '0.62rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.07em', marginBottom: '0.35rem' }}>
                      {sportIcon} {categoryLabel}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{pick.player}</div>
                        <div style={{ color: '#555', fontSize: '0.75rem' }}>
                          {pick.label} · {pick.side === 'over' ? '⬆ Over' : '⬇ Under'} {pick.line}
                        </div>
                      </div>
                      <div style={{ fontWeight: 'bold', fontSize: '1rem', color: pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#8888ff' }}>{formatOdds(pick.odds)}</div>
                    </div>
                    {pick.result === null && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#444', fontSize: '0.7rem' }}>⏳ Pending</span>
                        <div style={{ display: 'flex', gap: '0.4rem', marginLeft: 'auto' }}>
                          <button onClick={() => gradeProp(teamMKey, 'W')} style={{ fontSize: '0.68rem', padding: '0.2rem 0.6rem', background: '#0a2a1a', border: '1px solid #00ff88', borderRadius: '5px', color: '#00ff88', cursor: 'pointer', fontWeight: 'bold' }}>✅ W</button>
                          <button onClick={() => gradeProp(teamMKey, 'L')} style={{ fontSize: '0.68rem', padding: '0.2rem 0.6rem', background: '#2a0a0a', border: '1px solid #ff4444', borderRadius: '5px', color: '#ff4444', cursor: 'pointer', fontWeight: 'bold' }}>❌ L</button>
                        </div>
                      </div>
                    )}
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

          {/* Error banner — only show if props failed, nothing loaded, AND no picks made yet today */}
          {propsError && !propsLoading && !tooLate && propLines.length === 0 && Object.keys(todayTeamPicks).length === 0 && Object.keys(yesterdayTeamPicks).length === 0 && (
            <div style={{ background: '#1a0a0a', border: '1px solid #ff444422', borderRadius: '10px', padding: '0.85rem 1.1rem', marginTop: '1rem' }}>
              <div style={{ color: '#ff6644', fontSize: '0.78rem', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                ⚠ Props unavailable
              </div>
              <div style={{ color: '#555', fontSize: '0.75rem', lineHeight: 1.5 }}>{propsError}</div>
            </div>
          )}

          {/* ── Sneak Peek — always visible when lock is set, fetches own data ── */}
          <PropsSneakPeek propLines={propLines} allGames={allGames} onPick={openPropModal} todayPicks={todayTeamPicks} />
        </div>
      )}
    </div>
  )
}

// ─── SNEAK PEEK COMPONENT ────────────────────────────────────────────────────
// Shows pitcher strikeout props for all upcoming games from DK scraper
function PropsSneakPeek({ propLines, allGames, onPick, todayPicks = {} }) {
  const handlePick = (prop, side) => onPick && onPick(prop, side)
  const [open, setOpen] = React.useState(true)
  const [dkProps, setDkProps] = React.useState([])
  const [visiblePerGame, setVisiblePerGame] = React.useState({})
  const [visibleCount, setVisibleCount] = React.useState(3)

  React.useEffect(() => {
    // Fetch props for all sports on mount, then every 5 minutes
    const loadProps = () => {
      fetch('http://127.0.0.1:3001/dk-props')
        .then(r => r.ok ? r.json() : {})
        .then(data => {
          const allProps = Object.entries(data).flatMap(([sport, sd]) =>
            (sd.props || []).map(p => ({ ...p, _sport: sport }))
          )
          setDkProps(allProps.filter(p => p.isMainLine))
        })
        .catch(() => {})
    }
    loadProps()
    const interval = setInterval(loadProps, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Group props by eventId → player → market, tag with sport
  const MARKET_LABELS = {
    '15221': 'Ks',
    '17413': 'Outs',
  }

  const PITCHER_SUBCATS = new Set(['15221', '17413'])
  const SPORT_ORDER = { 'MLB': 0, 'NBA': 1 }

  const byGame = {}
  dkProps.forEach(p => {
    const eid = p.eventId
    if (!byGame[eid]) byGame[eid] = { home: p.home, away: p.away, sport: p._sport, pitchers: {}, batters: {} }
    const isPitcher = PITCHER_SUBCATS.has(String(p.subcategoryId))
    const bucket = isPitcher ? 'pitchers' : 'batters'
    if (!byGame[eid][bucket][p.player]) byGame[eid][bucket][p.player] = {}
    byGame[eid][bucket][p.player][p.subcategoryId] = p
  })

  // Sort: MLB before NBA, then alphabetically by away team within sport
  const sortedGames = Object.entries(byGame).sort(([, a], [, b]) => {
    const sa = SPORT_ORDER[a.sport] ?? 99
    const sb = SPORT_ORDER[b.sport] ?? 99
    if (sa !== sb) return sa - sb
    return (a.away || '').localeCompare(b.away || '')
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
          🔬 PROPS SNEAK PEEK · {sortedGames.length > 0 ? `${sortedGames.length} games · ${dkProps.length} props` : 'run dk_scraper.py to load'}
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
                    {shown.map((p, i) => {
                      const pickKey = `${p.playerName}||${p.marketKey}`
                      const alreadyPicked = todayPicks && todayPicks[pickKey]
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#555', padding: '0.25rem 0', borderBottom: '1px solid #111', gap: '0.5rem' }}>
                          <span style={{ color: '#777', flex: 1 }}>{p.playerName} <span style={{ color: '#444', fontFamily: 'monospace' }}>{p.line}</span></span>
                          {alreadyPicked ? (
                            <span style={{ fontSize: '0.65rem', color: alreadyPicked.side === 'over' ? '#00ff88' : '#ff4488', background: '#1a1a1a', border: `1px solid ${alreadyPicked.side === 'over' ? '#00ff8844' : '#ff448844'}`, borderRadius: '4px', padding: '0.1rem 0.5rem', whiteSpace: 'nowrap' }}>
                              {alreadyPicked.side === 'over' ? '⬆ Over' : '⬇ Under'} ✓
                            </span>
                          ) : onPick ? (
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button
                                onClick={() => onPick({ player: p.playerName, marketKey: p.marketKey, label: p.label || mKey, line: p.line, overOdds: p.overOdds, underOdds: p.underOdds, sport: 'MLB' }, 'over')}
                                style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', background: '#0a1a0a', border: '1px solid #00ff8844', borderRadius: '4px', color: '#00ff88', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                ⬆ o{p.overOdds > 0 ? '+' : ''}{p.overOdds}
                              </button>
                              <button
                                onClick={() => onPick({ player: p.playerName, marketKey: p.marketKey, label: p.label || mKey, line: p.line, overOdds: p.overOdds, underOdds: p.underOdds, sport: 'MLB' }, 'under')}
                                style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', background: '#1a0a1a', border: '1px solid #ff448844', borderRadius: '4px', color: '#ff4488', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                ⬇ u{p.underOdds > 0 ? '+' : ''}{p.underOdds}
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontFamily: 'monospace', fontSize: '0.68rem' }}>
                              <span style={{ color: p.overOdds > 0 ? '#ff9944' : '#aaa' }}>o{p.overOdds > 0 ? '+' : ''}{p.overOdds}</span>
                              {' / '}
                              <span style={{ color: p.underOdds > 0 ? '#ff9944' : '#aaa' }}>u{p.underOdds > 0 ? '+' : ''}{p.underOdds}</span>
                            </span>
                          )}
                        </div>
                      )
                    })}
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

          {/* Props by game — sorted MLB first (pitchers then batters), then NBA */}
          {sortedGames.length > 0 && (
            <div>
              {sortedGames.map(([eventId, game]) => {
                const pitcherList = Object.entries(game.pitchers || {})
                const batterList  = Object.entries(game.batters  || {})
                const shownP = visiblePerGame[eventId + '_p'] ?? 2
                const shownB = visiblePerGame[eventId + '_b'] ?? 2
                const sportIcon = game.sport === 'NBA' ? '🏀' : '⚾'
                return (
                  <div key={eventId} style={{ marginBottom: '0.85rem', paddingBottom: '0.85rem', borderBottom: '1px solid #111' }}>
                    {/* Game header */}
                    <div style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#666', marginBottom: '0.4rem' }}>
                      {sportIcon} {game.away} @ {game.home}
                    </div>

                    {/* ── Pitcher props ── */}
                    {pitcherList.length > 0 && (
                      <>
                        <div style={{ fontSize: '0.58rem', color: '#4c9be8', fontWeight: 'bold', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>PITCHERS</div>
                        {pitcherList.slice(0, shownP).map(([playerName, markets]) => (
                          <div key={playerName} style={{ padding: '0.25rem 0', borderBottom: '1px solid #0d0d0d' }}>
                            <div style={{ color: '#888', fontSize: '0.72rem', marginBottom: '0.25rem' }}>{playerName}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              {['15221', '17413'].map(subId => {
                                const label = MARKET_LABELS[subId]
                                const prop = markets[subId]
                                if (!prop) return null
                                const slugKey = subId === '15221' ? 'pitcher_strikeouts' : 'pitcher_outs_recorded'
                                const pickKey = `${playerName}||${slugKey}`
                                const alreadyPicked = todayPicks[pickKey]
                                return (
                                  <div key={subId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.68rem', color: '#555' }}>{label} <span style={{ color: '#888' }}>{prop.line}</span></span>
                                    {alreadyPicked ? (
                                      <span style={{ fontSize: '0.65rem', color: alreadyPicked.side === 'over' ? '#00ff88' : '#ff4488', background: '#1a1a1a', border: `1px solid ${alreadyPicked.side === 'over' ? '#00ff8844' : '#ff448844'}`, borderRadius: '4px', padding: '0.1rem 0.5rem' }}>
                                        {alreadyPicked.side === 'over' ? '⬆ Over' : '⬇ Under'} ✓
                                      </span>
                                    ) : onPick ? (
                                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                                        <button onClick={() => handlePick({ player: playerName, marketKey: slugKey, label, line: prop.line, overOdds: prop.overOdds, underOdds: prop.underOdds, team: prop.away, sport: game.sport, home: game.home, away: game.away }, 'over')}
                                          style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', background: '#0a1a0a', border: '1px solid #00ff8844', borderRadius: '4px', color: '#00ff88', cursor: 'pointer' }}>
                                          ⬆ o{prop.overOdds > 0 ? '+' : ''}{prop.overOdds}
                                        </button>
                                        <button onClick={() => handlePick({ player: playerName, marketKey: slugKey, label, line: prop.line, overOdds: prop.overOdds, underOdds: prop.underOdds, team: prop.away, sport: game.sport, home: game.home, away: game.away }, 'under')}
                                          style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', background: '#1a0a1a', border: '1px solid #ff448844', borderRadius: '4px', color: '#ff4488', cursor: 'pointer' }}>
                                          ⬇ u{prop.underOdds > 0 ? '+' : ''}{prop.underOdds}
                                        </button>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '0.68rem', color: '#4c9be8' }}>
                                        o{prop.overOdds > 0 ? '+' : ''}{prop.overOdds} / <span style={{ color: '#8888ff' }}>u{prop.underOdds > 0 ? '+' : ''}{prop.underOdds}</span>
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                        {pitcherList.length > shownP && (
                          <button onClick={() => setVisiblePerGame(v => ({ ...v, [eventId + '_p']: shownP + 3 }))}
                            style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: '0.62rem', padding: '0.15rem 0' }}>
                            + {pitcherList.length - shownP} more pitchers
                          </button>
                        )}
                      </>
                    )}

                    {/* ── Batter props ── */}
                    {batterList.length > 0 && (
                      <>
                        <div style={{ fontSize: '0.58rem', color: '#ff9944', fontWeight: 'bold', letterSpacing: '0.06em', marginTop: pitcherList.length > 0 ? '0.5rem' : 0, marginBottom: '0.25rem' }}>BATTERS</div>
                        {batterList.slice(0, shownB).map(([playerName, markets]) => (
                          <div key={playerName} style={{ padding: '0.25rem 0', borderBottom: '1px solid #0d0d0d' }}>
                            <div style={{ color: '#888', fontSize: '0.72rem', marginBottom: '0.25rem' }}>{playerName}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              {Object.entries(markets).map(([subId, prop]) => {
                                const slugKey = subId === '17319' ? 'batter_home_runs' : subId === '17320' ? 'batter_hits' : subId
                                const label = subId === '17319' ? 'HRs' : subId === '17320' ? 'Hits' : subId
                                const pickKey = `${playerName}||${slugKey}`
                                const alreadyPicked = todayPicks[pickKey]
                                return (
                                  <div key={subId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.68rem', color: '#555' }}>{label} <span style={{ color: '#888' }}>{prop.line}+</span></span>
                                    {alreadyPicked ? (
                                      <span style={{ fontSize: '0.65rem', color: '#8888ff', background: '#1a1a1a', border: '1px solid #8888ff44', borderRadius: '4px', padding: '0.1rem 0.5rem' }}>
                                        ✓ picked
                                      </span>
                                    ) : onPick ? (
                                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                                        <button onClick={() => handlePick({ player: playerName, marketKey: slugKey, label, line: prop.line, overOdds: prop.overOdds, underOdds: prop.underOdds, team: prop.away, sport: game.sport, home: game.home, away: game.away }, 'over')}
                                          style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', background: '#0a1a0a', border: '1px solid #00ff8844', borderRadius: '4px', color: '#00ff88', cursor: 'pointer' }}>
                                          ⬆ o{prop.overOdds > 0 ? '+' : ''}{prop.overOdds}
                                        </button>
                                        <button onClick={() => handlePick({ player: playerName, marketKey: slugKey, label, line: prop.line, overOdds: prop.overOdds, underOdds: prop.underOdds, team: prop.away, sport: game.sport, home: game.home, away: game.away }, 'under')}
                                          style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', background: '#1a0a1a', border: '1px solid #ff448844', borderRadius: '4px', color: '#ff4488', cursor: 'pointer' }}>
                                          ⬇ u{prop.underOdds > 0 ? '+' : ''}{prop.underOdds}
                                        </button>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '0.68rem', color: '#ff9944' }}>
                                        o{prop.overOdds > 0 ? '+' : ''}{prop.overOdds} / <span style={{ color: '#aaa' }}>u{prop.underOdds > 0 ? '+' : ''}{prop.underOdds}</span>
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                        {batterList.length > shownB && (
                          <button onClick={() => setVisiblePerGame(v => ({ ...v, [eventId + '_b']: shownB + 5 }))}
                            style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: '0.62rem', padding: '0.15rem 0' }}>
                            + {batterList.length - shownB} more batters
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {sortedGames.length === 0 && dkProps.length === 0 && (
            <div style={{ color: '#333', fontSize: '0.72rem', textAlign: 'center', padding: '1rem' }}>
              Run dk_scraper.py to load props
            </div>
          )}
        </div>
      )}
    </div>
  )
}