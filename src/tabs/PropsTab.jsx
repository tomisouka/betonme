import React, { useState, useEffect } from 'react'
import { getTodayKey, ensureAmerican, formatOdds } from '../utils/odds.js'
import { STORAGE_KEYS, loadPropPick, savePropPick } from '../hooks/useSaveData.js'
import PropSection, { ODDS_API_PROP_MARKETS, PROP_MARKET_LABELS, MARKET_ORDER, MARKET_SECTION_LABELS } from '../components/PropSection.jsx'
import PropsInsightPanel from '../components/PropsInsightPanel.jsx'


export default function PropsTab({ todayLock, todayDog, allGames, onRefresh }) {
  const todayKey = getTodayKey()

  const [propPick, setPropPick] = useState({})
  const [propModal, setPropModal] = useState(null)
  const [selectedSide, setSelectedSide] = useState(null)
  const [propLines, setPropLines] = useState([])
  const [dogPropLines, setDogPropLines] = useState([])
  const [propsLoading, setPropsLoading] = useState(false)
  const [propsFetched, setPropsFetched] = useState(false)
  const [propsError, setPropsError] = useState(null)
  const [renderError, setRenderError] = useState(null)
  const [tooLate, setTooLate] = useState(false)
  const [liveStats, setLiveStats] = useState({}) // gameId -> { playerName -> currentK }

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

  const fetchedRef = React.useRef(false)
  const [propRefreshTick, setPropRefreshTick] = React.useState(0)
  const [propRefreshed, setPropRefreshed] = React.useState(false)

  // Takes explicit args so it never reads stale closure values
  async function fetchAllProps(lockGameId, lockSport, lockGames, lockHomeTeamName, lockAwayTeamName, dogPick) {
    if (!lockGameId || !lockSport) return
    setPropsLoading(true)
    setPropsError(null)

    try {
      const r = await fetch('http://127.0.0.1:3001/dk-props?sport=' + lockSport)
      const data = r.ok ? await r.json() : {}
      const sportData = data[lockSport]
      const allProps = sportData?.props || []

      const lastWord = s => (s || '').trim().split(' ').pop().toLowerCase()

      // ── Lock game pitchers ──
      const lockGame = lockGames.find(g => g.id === lockGameId)
      const lockHomeL = (lockGame?.home_team || lockHomeTeamName || '').toLowerCase()
      const lockAwayL = (lockGame?.away_team || lockAwayTeamName || '').toLowerCase()

      const lockProps = allProps.filter(p => {
        const ph = (p.home || '').toLowerCase()
        const pa = (p.away || '').toLowerCase()
        return (lastWord(ph) === lastWord(lockHomeL) || lastWord(pa) === lastWord(lockAwayL) ||
                lockHomeL.includes(lastWord(ph)) || lockAwayL.includes(lastWord(pa)))
          && p.isMainLine && String(p.subcategoryId) === '15221'
      })

      const seenLock = new Set()
      const lockLines = []
      lockProps.forEach(p => {
        const key = `${p.player}||${p.subcategoryId}`
        if (seenLock.has(key)) return
        seenLock.add(key)
        const slugKey = SUBCAT_TO_KEY[String(p.subcategoryId)] || p.subcategoryId
        lockLines.push({
          player: p.player, playerName: p.player,
          marketKey: slugKey, label: p.marketType || slugKey,
          line: p.line, overOdds: p.overOdds, underOdds: p.underOdds,
          team: p.team || null, home: p.home, away: p.away,
          source: 'DraftKings (local)',
        })
      })
      setPropLines(lockLines)

      // ── Dog game pitchers ──
      if (dogPick?.gameId && dogPick.gameId !== lockGameId) {
        const dogHomeL = (dogPick.home || '').toLowerCase()
        const dogAwayL = (dogPick.away || '').toLowerCase()

        const dogProps = allProps.filter(p => {
          const ph = (p.home || '').toLowerCase()
          const pa = (p.away || '').toLowerCase()
          return (lastWord(ph) === lastWord(dogHomeL) || lastWord(pa) === lastWord(dogAwayL) ||
                  dogHomeL.includes(lastWord(ph)) || dogAwayL.includes(lastWord(pa)))
            && p.isMainLine && String(p.subcategoryId) === '15221'
        })

        const seenDog = new Set()
        const dogLines = []
        dogProps.forEach(p => {
          const key = `${p.player}||${p.subcategoryId}`
          if (seenDog.has(key)) return
          seenDog.add(key)
          const slugKey = SUBCAT_TO_KEY[String(p.subcategoryId)] || p.subcategoryId
          dogLines.push({
            player: p.player, playerName: p.player,
            marketKey: slugKey, label: p.marketType || slugKey,
            line: p.line, overOdds: p.overOdds, underOdds: p.underOdds,
            team: p.team || null, home: p.home, away: p.away,
            source: 'DraftKings (local)', isDogGame: true,
          })
        })
        setDogPropLines(dogLines)
      } else {
        setDogPropLines([])
      }

      if (lockLines.length === 0) {
        setPropsError('No props data — run dk_scraper.py to pull fresh DK lines.')
      }
    } catch (e) {
      setPropsError('Could not reach scraper — make sure server is running.')
    }

    setPropsFetched(true)
    setPropsLoading(false)
    setPropRefreshed(true)
    setTimeout(() => setPropRefreshed(false), 2000)
  }

  // Wait until BOTH lock and dog are settled before firing — prevents stale dog fetch
  useEffect(() => {
    if (!espnGameId || !allGames.length) return
    if (!todayDog) return  // wait for dog to load before fetching
    if (fetchedRef.current) return
    fetchedRef.current = true
    fetchAllProps(espnGameId, sportLabel, allGames, lockHome, lockAway, todayDog)
  }, [espnGameId, allGames.length, todayDog?.gameId, propRefreshTick])

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
          home: propModal.home || lockHome || null,
          away: propModal.away || lockAway || null,
          // A prop is a dog pick if it was tagged isDogGame OR its home/away match the dog game
          ...((() => {
            const dogId = todayDog?.gameId || null
            const dogH  = (todayDog?.home || '').toLowerCase()
            const dogA  = (todayDog?.away || '').toLowerCase()
            const propH = (propModal.home || '').toLowerCase()
            const propA = (propModal.away || '').toLowerCase()
            const isDog = propModal.isDogGame ||
              (dogId && (propH === dogH || propA === dogA ||
                dogH.includes(propH.split(' ').pop()) || dogA.includes(propA.split(' ').pop())))
            return {
              gameId:    isDog ? dogId : (espnGameId || null),
              isDogGame: !!isDog,
            }
          })()),
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

  // ── ESPN auto-resolve ─────────────────────────────────────────────────────
  // Fires whenever propPick changes (i.e. after refresh or on mount).
  // Scans all dates for pending picks, fetches ESPN boxscore for each unique
  // gameId, resolves W/L from the actual pitching stat line, saves back.
  useEffect(() => {
    async function autoResolve() {
      // Collect all pending picks across all dates
      const pending = []
      Object.entries(propPick).forEach(([dateKey, dayPicks]) => {
        Object.entries(dayPicks || {}).forEach(([teamMKey, pick]) => {
          if (pick && pick.result === null && pick.gameId && pick.player && pick.line != null) {
            pending.push({ dateKey, teamMKey, pick })
          }
        })
      })
      if (!pending.length) return

      // Fetch ESPN boxscore for each unique gameId once
      const boxscoreCache = {}
      async function getBoxscore(espnGameId) {
        if (boxscoreCache[espnGameId] !== undefined) return boxscoreCache[espnGameId]
        try {
          const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${espnGameId}`)
          const data = res.ok ? await res.json() : null
          boxscoreCache[espnGameId] = data
          return data
        } catch { boxscoreCache[espnGameId] = null; return null }
      }

      // Extract pitching stat for a player name from ESPN boxscore
      // Returns { strikeouts, outsRecorded } or null if game not final / player not found
      function extractPitcherStat(data, playerName) {
        if (!data) return null
        // Only resolve if game is final
        const status = data.header?.competitions?.[0]?.status?.type?.name || ''
        if (status !== 'STATUS_FINAL') return null

        const playerGroups = data.boxscore?.players || []
        for (const teamGroup of playerGroups) {
          for (const statGroup of teamGroup.statistics || []) {
            const sgType = (statGroup.type || statGroup.name || '').toLowerCase()
            if (sgType !== 'pitching') continue
            const labels = statGroup.labels || []
            for (const a of statGroup.athletes || []) {
              if (a.athlete?.displayName !== playerName) continue
              const stats = {}
              labels.forEach((lbl, i) => { stats[lbl] = a.stats?.[i] })
              // K = strikeouts column label in ESPN (SO or K)
              const k = parseInt(stats.SO ?? stats.K ?? '0', 10) || 0
              // IP as outs: 6.0 IP = 18 outs, 6.1 IP = 19 outs, 6.2 = 20, etc.
              const ipStr = stats.IP || '0'
              const ipParts = String(ipStr).split('.')
              const fullInnings = parseInt(ipParts[0], 10) || 0
              const partialOuts = parseInt(ipParts[1] || '0', 10) || 0
              const outsRecorded = fullInnings * 3 + partialOuts
              return { strikeouts: k, outsRecorded }
            }
          }
        }
        return null // player not found (may not have pitched yet)
      }

      let dirty = false
      const updated = JSON.parse(JSON.stringify(propPick))

      for (const { dateKey, teamMKey, pick } of pending) {
        const data = await getBoxscore(pick.gameId)
        const stat = extractPitcherStat(data, pick.player)
        if (!stat) continue  // game not final or player not found — skip

        let actual = null
        if (pick.marketKey === 'pitcher_strikeouts') actual = stat.strikeouts
        else if (pick.marketKey === 'pitcher_outs_recorded') actual = stat.outsRecorded
        else continue  // unsupported market — skip

        const line = parseFloat(pick.line)
        let result = null
        if (pick.side === 'over')  result = actual > line  ? 'W' : actual === line ? 'P' : 'L'
        if (pick.side === 'under') result = actual < line  ? 'W' : actual === line ? 'P' : 'L'
        if (!result) continue

        updated[dateKey][teamMKey] = { ...pick, result }
        dirty = true
      }

      if (dirty) {
        await savePropPick(updated)
        setPropPick(updated)
      }
    }

    autoResolve()
  }, [JSON.stringify(Object.keys(propPick)), propRefreshTick])  // re-run on new picks or manual refresh

  // ── Live K counter — polls ESPN every 60s for in-progress games ───────────
  useEffect(() => {
    const todayPicks = propPick[todayKey] || {}
    const pendingPicks = Object.values(todayPicks).filter(p =>
      p && p.result === null && p.gameId && p.player &&
      ['pitcher_strikeouts', 'pitcher_outs_recorded'].includes(p.marketKey)
    )
    if (!pendingPicks.length) return

    async function fetchLive() {
      const updated = {}
      const seen = new Set()
      for (const pick of pendingPicks) {
        if (seen.has(pick.gameId)) continue
        seen.add(pick.gameId)
        try {
          const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${pick.gameId}`)
          const data = res.ok ? await res.json() : null
          if (!data) continue
          const statusName = data.header?.competitions?.[0]?.status?.type?.name || ''
          // Only show live counter during in-progress games
          if (statusName !== 'STATUS_IN_PROGRESS') continue
          const playerGroups = data.boxscore?.players || []
          const gameMap = {}
          for (const teamGroup of playerGroups) {
            for (const statGroup of teamGroup.statistics || []) {
              const sgType = (statGroup.type || statGroup.name || '').toLowerCase()
              if (sgType !== 'pitching') continue
              const labels = statGroup.labels || []
              for (const a of statGroup.athletes || []) {
                const name = a.athlete?.displayName
                if (!name) continue
                const stats = {}
                labels.forEach((lbl, i) => { stats[lbl] = a.stats?.[i] })
                const k = parseInt(stats.SO ?? stats.K ?? '0', 10) || 0
                const ipStr = stats.IP || '0'
                const ipParts = String(ipStr).split('.')
                const outsRecorded = parseInt(ipParts[0], 10) * 3 + parseInt(ipParts[1] || '0', 10)
                gameMap[name] = { k, outsRecorded }
              }
            }
          }
          if (Object.keys(gameMap).length) updated[pick.gameId] = gameMap
        } catch { /* silently skip */ }
      }
      if (Object.keys(updated).length) setLiveStats(updated)
    }

    fetchLive()
    const interval = setInterval(fetchLive, 60_000)
    return () => clearInterval(interval)
  }, [JSON.stringify(Object.keys(propPick[todayKey] || {})), todayKey])

  // Only show pitcher strikeouts for now
  // Exclude props where this player+market is already picked today
  const alreadyPickedKeys = new Set(Object.keys(todayTeamPicks))
  const groupedProps = [{
    marketKey: 'pitcher_strikeouts',
    label: PROP_MARKET_LABELS['pitcher_strikeouts'],
    props: propLines
      .filter(p => p.marketKey === 'pitcher_strikeouts')
      .filter(p => !alreadyPickedKeys.has(`${p.player}||pitcher_strikeouts`))
      .sort((a, b) => b.line - a.line),
  }].filter(g => g.props.length > 0)

  const dogGroupedProps = [{
    marketKey: 'pitcher_strikeouts',
    label: PROP_MARKET_LABELS['pitcher_strikeouts'],
    props: dogPropLines
      .filter(p => p.marketKey === 'pitcher_strikeouts')
      .filter(p => !alreadyPickedKeys.has(`${p.player}||pitcher_strikeouts`))
      .sort((a, b) => b.line - a.line),
  }].filter(g => g.props.length > 0)

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
        <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>Pitcher strikeouts — from your Lock of the Day game.</p>
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
          {/* Header row: game info + refresh button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#555' }}>
                {sportLabel} · {todayLock.home} vs {todayLock.away}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
                <span style={{ fontSize: '0.63rem', color: '#00ff8888', background: '#00ff8811', border: '1px solid #00ff8822', borderRadius: '4px', padding: '0.1rem 0.45rem' }}>
                  🔒 {(todayLock.team || '').split(' ').pop()}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
              <button
                onClick={() => {
                  fetchedRef.current = false
                  setPropsFetched(false)
                  setPropLines([])
                  setDogPropLines([])
                  setPropRefreshTick(t => t + 1)
                  if (onRefresh) onRefresh()
                }}
                disabled={propsLoading}
                style={{
                  fontSize: '0.68rem', padding: '0.3rem 0.75rem',
                  background: propRefreshed ? '#0a2a1a' : '#111',
                  border: `1px solid ${propRefreshed ? '#00ff8844' : '#2a2a2a'}`,
                  borderRadius: '6px',
                  color: propsLoading ? '#333' : propRefreshed ? '#00ff88' : '#555',
                  cursor: propsLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold',
                  transition: 'all 0.3s',
                }}
              >
                {propsLoading ? '⏳' : propRefreshed ? '✓ Updated' : '↺'} {!propsLoading && !propRefreshed && 'Refresh'}
              </button>
              <span style={{ fontSize: '0.6rem', color: '#333' }}>via DraftKings scraper</span>
            </div>
          </div>

          {/* ── Yesterday's prop picks — collapsed by default ── */}
          {Object.keys(yesterdayTeamPicks).length > 0 && (
            <YesterdayProps picks={yesterdayTeamPicks} />
          )}

          {/* ── Today's prop picks ── */}
          {Object.keys(todayTeamPicks).length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.62rem', color: '#8888ff', fontWeight: 'bold', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>
                TODAY
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.62rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.07em' }}>
                        {sportIcon} {categoryLabel}
                      </span>
                      {(() => {
                        const isDog = pick.isDogGame || (todayDog?.gameId && pick.gameId === todayDog.gameId)
                        return isDog
                          ? <span style={{ fontSize: '0.58rem', color: '#ff994488', background: '#ff994411', border: '1px solid #ff994422', borderRadius: '4px', padding: '0.1rem 0.4rem', fontWeight: 'bold' }}>🐕 DOG</span>
                          : <span style={{ fontSize: '0.58rem', color: '#00ff8888', background: '#00ff8811', border: '1px solid #00ff8822', borderRadius: '4px', padding: '0.1rem 0.4rem', fontWeight: 'bold' }}>🔒 LOCK</span>
                      })()}
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
                    {pick.result === null && (() => {
                      const gameStats = liveStats[pick.gameId]
                      const playerStat = gameStats?.[pick.player]
                      const isLive = !!playerStat
                      const currentVal = pick.marketKey === 'pitcher_strikeouts'
                        ? playerStat?.k
                        : pick.marketKey === 'pitcher_outs_recorded'
                          ? playerStat?.outsRecorded
                          : null
                      const line = parseFloat(pick.line)
                      const pct = currentVal != null && line > 0 ? Math.min(currentVal / line, 1) : 0
                      const needsMore = currentVal != null ? line - currentVal : null
                      const statLabel = pick.marketKey === 'pitcher_strikeouts' ? 'K' : 'Outs'
                      return (
                        <div style={{ marginTop: '0.5rem' }}>
                          {isLive && currentVal != null ? (
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                <span style={{ fontSize: '0.65rem', color: '#ff9944', fontWeight: 'bold' }}>
                                  🔴 LIVE · {statLabel}: <span style={{ fontSize: '0.82rem' }}>{currentVal}</span>
                                  <span style={{ color: '#555', fontWeight: 'normal' }}> / {line}</span>
                                </span>
                                <span style={{ fontSize: '0.6rem', color: needsMore > 0 ? '#555' : '#00ff88', fontWeight: needsMore <= 0 ? 'bold' : 'normal' }}>
                                  {needsMore > 0 ? `needs ${needsMore} more` : `✓ line cleared`}
                                </span>
                              </div>
                              <div style={{ height: '4px', background: '#1a1a1a', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{
                                  height: '100%', borderRadius: '2px', transition: 'width 0.4s ease',
                                  width: `${pct * 100}%`,
                                  background: pct >= 1
                                    ? (pick.side === 'over' ? '#00ff88' : '#ff4444')
                                    : (pick.side === 'under' ? '#00ff88' : '#ff9944'),
                                }} />
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#444', fontSize: '0.68rem' }}>⏳ Pending — auto-resolves after game</span>
                          )}
                        </div>
                      )
                    })()}
                    {pick.result === 'W' && <div style={{ marginTop: '0.35rem', color: '#00ff88', fontWeight: 'bold', fontSize: '0.85rem' }}>✅ WIN</div>}
                    {pick.result === 'L' && <div style={{ marginTop: '0.35rem', color: '#ff4444', fontWeight: 'bold', fontSize: '0.85rem' }}>❌ LOSS</div>}
                  </div>
                )
              })}
              </div>
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

          {propLines.length > 0 && (
            <div>
              {/* Lock game label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.62rem', color: '#00ff8888', background: '#00ff8811', border: '1px solid #00ff8822', borderRadius: '4px', padding: '0.15rem 0.5rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>
                  🔒 LOCK · {todayLock?.away?.split(' ').pop()} @ {todayLock?.home?.split(' ').pop()}
                </span>
              </div>
              {groupedProps.length > 0 ? groupedProps.map((group) => (
                <PropSection
                  key={group.marketKey}
                  marketKey={group.marketKey}
                  label={group.label}
                  props={group.props}
                  pickedTeams={pickedTeams}
                  onPick={openPropModal}
                  defaultOpen={true}
                  homeTeam={lockHomeTeam}
                  awayTeam={lockAwayTeam}
                  teamColorMap={teamColorMap}
                />
              )) : (
                <div style={{ fontSize: '0.72rem', color: '#444', padding: '0.5rem 0 0.75rem', fontStyle: 'italic' }}>
                  All lock game props picked ✓
                </div>
              )}
            </div>
          )}

          {/* Dog game props — only when dog is a different game */}
          {dogPropLines.length > 0 && todayDog && todayDog.gameId !== espnGameId && (
            <div style={{ marginTop: propLines.length > 0 ? '0.75rem' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.62rem', color: '#ff994488', background: '#ff994411', border: '1px solid #ff994422', borderRadius: '4px', padding: '0.15rem 0.5rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>
                  🐕 DOG · {todayDog?.away?.split(' ').pop()} @ {todayDog?.home?.split(' ').pop()}
                </span>
              </div>
              {dogGroupedProps.length > 0 ? dogGroupedProps.map((group) => (
                <PropSection
                  key={`dog_${group.marketKey}`}
                  marketKey={group.marketKey}
                  label={group.label}
                  props={group.props}
                  pickedTeams={pickedTeams}
                  onPick={openPropModal}
                  defaultOpen={true}
                  homeTeam={todayDog?.home || ''}
                  awayTeam={todayDog?.away || ''}
                  teamColorMap={{}}
                />
              )) : (
                <div style={{ fontSize: '0.72rem', color: '#444', padding: '0.5rem 0 0.75rem', fontStyle: 'italic' }}>
                  All dog game props picked ✓
                </div>
              )}
            </div>
          )}

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


// ─── YESTERDAY PROPS — collapsed by default ──────────────────────────────────
function YesterdayProps({ picks }) {
  const [open, setOpen] = React.useState(false)
  const entries = Object.entries(picks).filter(([, p]) => p)
  const wins = entries.filter(([, p]) => p.result === 'W').length
  const losses = entries.filter(([, p]) => p.result === 'L').length
  const pending = entries.filter(([, p]) => p.result === null).length

  return (
    <div style={{ marginBottom: '1.5rem', border: '1px solid #1e1e1e', borderRadius: '10px', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', padding: '0.65rem 1rem', background: '#0d0d0d',
        border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.62rem', color: '#444', fontWeight: 'bold', letterSpacing: '0.07em' }}>YESTERDAY</span>
          <span style={{ fontSize: '0.6rem', color: '#333' }}>· {entries.length} pick{entries.length !== 1 ? 's' : ''}</span>
          {wins > 0 && <span style={{ fontSize: '0.62rem', color: '#00ff8888' }}>✅ {wins}W</span>}
          {losses > 0 && <span style={{ fontSize: '0.62rem', color: '#ff444488' }}>❌ {losses}L</span>}
          {pending > 0 && <span style={{ fontSize: '0.62rem', color: '#555' }}>⏳ {pending}</span>}
        </div>
        <span style={{ color: '#333', fontSize: '0.65rem' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#0a0a0a' }}>
          {entries.map(([teamMKey, pick]) => {
            const sportIcon = pick.sport === 'NBA' ? '🏀' : pick.sport === 'NFL' ? '🏈' : '⚾'
            const isPitcher = ['pitcher_strikeouts','pitcher_outs_recorded','pitcher_hits_allowed','pitcher_walks','pitcher_earned_runs'].includes(pick.marketKey)
            const categoryLabel = pick.sport === 'MLB' ? (isPitcher ? 'PITCHER' : 'BATTER') : pick.sport || 'PROP'
            return (
              <div key={teamMKey} style={{
                background: '#0d0d0d',
                border: `1px solid ${pick.result === 'W' ? '#00ff8833' : pick.result === 'L' ? '#ff444433' : '#1a1a1a'}`,
                borderRadius: '10px', padding: '0.85rem 1.1rem', opacity: 0.85,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.62rem', color: '#444', fontWeight: 'bold', letterSpacing: '0.07em' }}>
                    {sportIcon} {categoryLabel}
                  </span>
                  {pick.isDogGame
                    ? <span style={{ fontSize: '0.58rem', color: '#ff994466', background: '#ff994411', border: '1px solid #ff994422', borderRadius: '4px', padding: '0.1rem 0.4rem', fontWeight: 'bold' }}>🐕 DOG</span>
                    : <span style={{ fontSize: '0.58rem', color: '#00ff8866', background: '#00ff8811', border: '1px solid #00ff8822', borderRadius: '4px', padding: '0.1rem 0.4rem', fontWeight: 'bold' }}>🔒 LOCK</span>
                  }
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#888' }}>{pick.player}</div>
                    <div style={{ color: '#444', fontSize: '0.75rem' }}>
                      {pick.label} · {pick.side === 'over' ? '⬆ Over' : '⬇ Under'} {pick.line}
                    </div>
                  </div>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', color: pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#444' }}>
                    {pick.odds > 0 ? `+${pick.odds}` : pick.odds}
                  </div>
                </div>
                {pick.result === null && <div style={{ marginTop: '0.35rem', color: '#444', fontSize: '0.68rem' }}>⏳ Pending — auto-resolves</div>}
                {pick.result === 'W' && <div style={{ marginTop: '0.35rem', color: '#00ff88', fontWeight: 'bold', fontSize: '0.85rem' }}>✅ WIN</div>}
                {pick.result === 'L' && <div style={{ marginTop: '0.35rem', color: '#ff4444', fontWeight: 'bold', fontSize: '0.85rem' }}>❌ LOSS</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── SNEAK PEEK — Strikeouts only, all games ────────────────────────────────
function PropsSneakPeek({ propLines, allGames, onPick, todayPicks = {} }) {
  const [open, setOpen] = React.useState(false)
  const [dkProps, setDkProps] = React.useState([])

  React.useEffect(() => {
    const loadProps = () => {
      fetch('http://127.0.0.1:3001/dk-props')
        .then(r => r.ok ? r.json() : {})
        .then(data => {
          const allProps = Object.entries(data).flatMap(([sport, sd]) =>
            (sd.props || []).map(p => ({ ...p, _sport: sport }))
          )
          setDkProps(allProps.filter(p => p.isMainLine && String(p.subcategoryId) === '15221'))
        })
        .catch(() => {})
    }
    loadProps()
    const interval = setInterval(loadProps, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const byGame = {}
  dkProps.forEach(p => {
    const eid = p.eventId
    if (!byGame[eid]) byGame[eid] = { home: p.home, away: p.away, pitchers: [] }
    byGame[eid].pitchers.push(p)
  })
  const sortedGames = Object.entries(byGame).sort(([, a], [, b]) => (a.away || '').localeCompare(b.away || ''))

  return (
    <div style={{ marginTop: '1.5rem', border: '1px solid #1a1a1a', borderRadius: '10px', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', padding: '0.75rem 1rem', background: '#111',
        border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: '0.68rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.07em' }}>
          ⚾ ALL STRIKEOUTS · {sortedGames.length > 0 ? `${sortedGames.length} games · ${dkProps.length} pitchers` : 'run dk_scraper.py to load'}
        </span>
        <span style={{ color: '#444', fontSize: '0.7rem' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ background: '#0d0d0d', padding: '0.75rem' }}>
          {sortedGames.map(([eventId, game]) => (
            <div key={eventId} style={{ marginBottom: '0.65rem', paddingBottom: '0.65rem', borderBottom: '1px solid #111' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 'bold', color: '#555', marginBottom: '0.3rem' }}>
                {game.away} @ {game.home}
              </div>
              {game.pitchers.sort((a, b) => b.line - a.line).map(prop => {
                const pickKey = `${prop.player}||pitcher_strikeouts`
                const alreadyPicked = todayPicks[pickKey]
                return (
                  <div key={prop.player} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#888', flex: 1 }}>
                      {prop.player} <span style={{ color: '#555', fontFamily: 'monospace' }}>{prop.line}</span>
                    </span>
                    {alreadyPicked ? (
                      <span style={{ fontSize: '0.65rem', color: alreadyPicked.side === 'over' ? '#00ff88' : '#ff4488', background: '#1a1a1a', border: `1px solid ${alreadyPicked.side === 'over' ? '#00ff8844' : '#ff448844'}`, borderRadius: '4px', padding: '0.1rem 0.5rem' }}>
                        {alreadyPicked.side === 'over' ? '⬆ Over' : '⬇ Under'} ✓
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.68rem', color: '#4c9be8' }}>
                        ⬆ {prop.overOdds > 0 ? '+' : ''}{prop.overOdds} · ⬇ {prop.underOdds > 0 ? '+' : ''}{prop.underOdds}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
          {sortedGames.length === 0 && (
            <div style={{ color: '#333', fontSize: '0.72rem', textAlign: 'center', padding: '1rem' }}>
              Run dk_scraper.py to load props
            </div>
          )}
        </div>
      )}
    </div>
  )
}