import React, { useState, useEffect, useMemo } from 'react'
import { loadPrefs, savePrefs } from '../hooks/useSaveData.js'

const SERVER = 'http://127.0.0.1:3001'

// ── MLB Teams ─────────────────────────────────────────────────────────────────
const MLB_TEAMS = [
  // AL East
  'New York Yankees', 'Boston Red Sox', 'Baltimore Orioles', 'Toronto Blue Jays', 'Tampa Bay Rays',
  // AL Central
  'Chicago White Sox', 'Cleveland Guardians', 'Detroit Tigers', 'Kansas City Royals', 'Minnesota Twins',
  // AL West
  'Houston Astros', 'Los Angeles Angels', 'Oakland Athletics', 'Seattle Mariners', 'Texas Rangers',
  // NL East
  'Atlanta Braves', 'Miami Marlins', 'New York Mets', 'Philadelphia Phillies', 'Washington Nationals',
  // NL Central
  'Chicago Cubs', 'Cincinnati Reds', 'Milwaukee Brewers', 'Pittsburgh Pirates', 'St. Louis Cardinals',
  // NL West
  'Arizona Diamondbacks', 'Colorado Rockies', 'Los Angeles Dodgers', 'San Diego Padres', 'San Francisco Giants',
]

const TEAM_ABBREVS = {
  'Houston Astros': ['HOU Astros', 'Astros', 'HOU'],
  'New York Yankees': ['NY Yankees', 'Yankees', 'NYY'],
  'Los Angeles Dodgers': ['LA Dodgers', 'Dodgers', 'LAD'],
  'Boston Red Sox': ['BOS Red Sox', 'Red Sox', 'BOS'],
  'Chicago Cubs': ['CHI Cubs', 'Cubs', 'CHC'],
  'San Francisco Giants': ['SF Giants', 'Giants', 'SFG'],
  'Atlanta Braves': ['ATL Braves', 'Braves', 'ATL'],
  'New York Mets': ['NY Mets', 'Mets', 'NYM'],
  'Cleveland Guardians': ['CLE Guardians', 'Guardians', 'CLE'],
  'Seattle Mariners': ['SEA Mariners', 'Mariners', 'SEA'],
  'Los Angeles Angels': ['LA Angels', 'Angels', 'LAA'],
  'Toronto Blue Jays': ['TOR Blue Jays', 'Blue Jays', 'TOR'],
  'San Diego Padres': ['SD Padres', 'Padres', 'SDP'],
  'Arizona Diamondbacks': ['ARI Diamondbacks', 'Diamondbacks', 'ARI'],
  'Kansas City Royals': ['KC Royals', 'Royals', 'KCR'],
  'Detroit Tigers': ['DET Tigers', 'Tigers', 'DET'],
  'Minnesota Twins': ['MIN Twins', 'Twins', 'MIN'],
  'Pittsburgh Pirates': ['PIT Pirates', 'Pirates', 'PIT'],
  'Milwaukee Brewers': ['MIL Brewers', 'Brewers', 'MIL'],
  'Colorado Rockies': ['COL Rockies', 'Rockies', 'COL'],
  'Miami Marlins': ['MIA Marlins', 'Marlins', 'MIA'],
  'Oakland Athletics': ['OAK Athletics', 'Athletics', 'OAK'],
  'Texas Rangers': ['TEX Rangers', 'Rangers', 'TEX'],
  'Tampa Bay Rays': ['TB Rays', 'Rays', 'TBR'],
  'Baltimore Orioles': ['BAL Orioles', 'Orioles', 'BAL'],
  'Philadelphia Phillies': ['PHI Phillies', 'Phillies', 'PHI'],
  'Washington Nationals': ['WSH Nationals', 'Nationals', 'WSH'],
  'Chicago White Sox': ['CHI White Sox', 'White Sox', 'CHW'],
  'Cincinnati Reds': ['CIN Reds', 'Reds', 'CIN'],
  'St. Louis Cardinals': ['STL Cardinals', 'Cardinals', 'STL'],
}

// Check if a pick's team matches the selected favorite (handles abbreviations)
function teamMatches(pickTeam, favTeam) {
  if (!pickTeam || !favTeam) return false
  const pt = pickTeam.toLowerCase()
  const ft = favTeam.toLowerCase()
  if (pt === ft) return true
  // Check abbrevs
  const abbrevs = (TEAM_ABBREVS[favTeam] || []).map(a => a.toLowerCase())
  return abbrevs.some(a => pt === a || pt.includes(a.split(' ').pop()) || a.includes(pt.split(' ').pop()))
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = '#aaa', note }) {
  return (
    <div style={{
      background: '#1a1a1a', border: '1px solid #242424', borderRadius: '12px',
      padding: '0.9rem 1rem', flex: '1 1 100px', minWidth: '90px',
    }}>
      <div style={{ fontSize: '0.58rem', color: '#444', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.63rem', color: '#555', marginTop: '0.3rem' }}>{sub}</div>}
      {note && <div style={{ fontSize: '0.6rem', color: '#444', marginTop: '0.2rem', fontStyle: 'italic' }}>{note}</div>}
    </div>
  )
}

// ── Bias Meter ────────────────────────────────────────────────────────────────
function BiasMeter({ pickPct }) {
  // 50% = perfectly neutral, 100% = always pick them, 0% = always fade
  const pct = Math.round(pickPct)
  const pos = Math.max(2, Math.min(98, pct)) // clamp for visual
  const color = pct > 70 ? '#ff9944' : pct < 30 ? '#8888ff' : '#00ff88'
  const label = pct > 70 ? 'BIASED' : pct < 30 ? 'FADER' : 'BALANCED'
  const labelColor = pct > 70 ? '#ff9944' : pct < 30 ? '#8888ff' : '#00ff88'
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.62rem', color: '#444', letterSpacing: '0.07em' }}>BIAS METER</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: labelColor }}>{label}</span>
      </div>
      <div style={{ position: 'relative', height: '8px', background: '#111', borderRadius: '4px', border: '1px solid #222' }}>
        {/* gradient track */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '4px',
          background: 'linear-gradient(to right, #8888ff, #00ff88 50%, #ff9944)',
          opacity: 0.18,
        }} />
        {/* needle */}
        <div style={{
          position: 'absolute', top: '-3px', width: '14px', height: '14px',
          background: color, borderRadius: '50%', border: '2px solid #111',
          left: `calc(${pos}% - 7px)`,
          transition: 'left 0.4s ease',
          boxShadow: `0 0 6px ${color}88`,
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem' }}>
        <span style={{ fontSize: '0.58rem', color: '#333' }}>Always fade</span>
        <span style={{ fontSize: '0.58rem', color: '#333' }}>Neutral</span>
        <span style={{ fontSize: '0.58rem', color: '#333' }}>Always pick</span>
      </div>
    </div>
  )
}

// ── Main Tab ──────────────────────────────────────────────────────────────────


// ── Today's Game Card ─────────────────────────────────────────────────────────
function TodayGameCard({ team, allGames, todayLock, todayDog, mode }) {

  // Fuzzy: does a pick's team field match the full team name?
  function nameMatches(pickTeam, fullName) {
    if (!pickTeam || !fullName) return false
    const pt = pickTeam.toLowerCase()
    const fn = fullName.toLowerCase()
    if (pt === fn) return true
    // last word match: 'HOU Astros' matches 'Houston Astros' via 'astros'
    const ptLast = pt.split(' ').pop()
    const fnLast = fn.split(' ').pop()
    if (ptLast && ptLast === fnLast) return true
    if (fn.includes(pt) || pt.includes(fn)) return true
    return false
  }

  // Find today's MLB game involving this team
  const last = team.toLowerCase().split(' ').pop()
  const todayGame = allGames.find(g => {
    if (g.sportLabel !== 'MLB') return false
    const home = (g.home_team || '').toLowerCase()
    const away = (g.away_team || '').toLowerCase()
    return home.includes(last) || away.includes(last)
  })

  if (!todayGame) return null

  const isHome   = (todayGame.home_team || '').toLowerCase().includes(last)
  const opponent = isHome ? todayGame.away_team : todayGame.home_team
  const teamFull = isHome ? todayGame.home_team : todayGame.away_team

  const gameTime = todayGame.commence_time
    ? new Date(todayGame.commence_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  // Is this game the one they locked/dogged?
  const lockOnThisGame = todayLock && (
    nameMatches(todayLock.home, todayGame.home_team) &&
    nameMatches(todayLock.away, todayGame.away_team)
  )
  const dogOnThisGame = todayDog && (
    nameMatches(todayDog.home, todayGame.home_team) &&
    nameMatches(todayDog.away, todayGame.away_team)
  )

  // Who did they pick?
  const lockedOnThem   = lockOnThisGame && nameMatches(todayLock.team, teamFull)
  const lockedAgainst  = lockOnThisGame && !nameMatches(todayLock.team, teamFull)
  const doggedOnThem   = dogOnThisGame  && nameMatches(todayDog.team,  teamFull)
  const doggedAgainst  = dogOnThisGame  && !nameMatches(todayDog.team, teamFull)

  const hasPick = lockedOnThem || lockedAgainst || doggedOnThem || doggedAgainst
  const noPick  = !lockOnThisGame && !dogOnThisGame

  const teamShort = team.split(' ').pop()
  const oppShort  = opponent.split(' ').pop()

  // ML odds from DK if available
  const mlOdds = todayGame._dk?.h2h
    ? (isHome
        ? (todayGame._dk.h2h.homeOdds > 0 ? '+' : '') + todayGame._dk.h2h.homeOdds
        : (todayGame._dk.h2h.awayOdds > 0 ? '+' : '') + todayGame._dk.h2h.awayOdds)
    : null

  return (
    <div style={{
      background: '#111', border: '1px solid #2a2a2a',
      borderRadius: '12px', padding: '0.9rem 1.1rem', marginBottom: '1.5rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.6rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.08em' }}>⚾ TODAY</span>
        {gameTime && <span style={{ fontSize: '0.62rem', color: '#444' }}>{gameTime}</span>}
      </div>

      {/* Matchup row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
        <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: isHome ? '#aaa' : '#ddd' }}>
          {isHome ? oppShort : teamShort}
        </span>
        <span style={{ fontSize: '0.65rem', color: '#333' }}>@</span>
        <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: isHome ? '#ddd' : '#aaa' }}>
          {isHome ? teamShort : oppShort}
        </span>
        {mlOdds && (
          <span style={{
            fontSize: '0.65rem', marginLeft: 'auto', fontWeight: 'bold',
            color: mlOdds.startsWith('+') ? '#ff9944' : '#4c9be8',
          }}>
            {mlOdds} ML
          </span>
        )}
      </div>

      {/* Pick status */}
      {hasPick && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {lockedOnThem && (
            <div style={{ fontSize: '0.72rem', color: '#00ff88' }}>
              🔒 Locked {teamShort} {todayLock.odds > 0 ? '+' : ''}{todayLock.odds}
              {todayLock.market === 'spreads' && todayLock.point != null ? ` (${todayLock.point > 0 ? '+' : ''}${todayLock.point})` : ''}
            </div>
          )}
          {lockedAgainst && (
            <div style={{ fontSize: '0.72rem', color: '#ff9944' }}>
              🔒 Fading {teamShort} — locked {(todayLock.team || '').split(' ').pop()} {todayLock.odds > 0 ? '+' : ''}{todayLock.odds}
            </div>
          )}
          {doggedOnThem && (
            <div style={{ fontSize: '0.72rem', color: '#ff9944' }}>
              🐕 Dogged {teamShort} {todayDog.odds > 0 ? '+' : ''}{todayDog.odds}
            </div>
          )}
          {doggedAgainst && (
            <div style={{ fontSize: '0.72rem', color: '#8888ff' }}>
              🐕 Dog on opponent — took {(todayDog.team || '').split(' ').pop()} {todayDog.odds > 0 ? '+' : ''}{todayDog.odds}
            </div>
          )}
        </div>
      )}

      {/* No pick yet on this game — show quick nav */}
      {noPick && (
        <div>
          <div style={{ fontSize: '0.6rem', color: '#333', marginBottom: '0.4rem' }}>
            {mode === 'favs' ? 'No pick on this game yet.' : 'No pick yet — fade or flip?'}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('betonme:quicknav', { detail: { tab: 'lock' } }))}
              style={{
                flex: 1, padding: '0.5rem', fontSize: '0.68rem', fontWeight: 'bold',
                background: mode === 'favs' ? '#0a2a1a' : '#2a0a0a',
                border: `1px solid ${mode === 'favs' ? '#00ff8844' : '#ff444444'}`,
                borderRadius: '7px',
                color: mode === 'favs' ? '#00ff88' : '#ff4444',
                cursor: 'pointer',
              }}
            >
              {mode === 'favs' ? `🔒 Lock ${teamShort}` : `🔒 Fade ${teamShort}`}
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('betonme:quicknav', { detail: { tab: 'dogs' } }))}
              style={{
                flex: 1, padding: '0.5rem', fontSize: '0.68rem', fontWeight: 'bold',
                background: '#1a1a0a', border: '1px solid #ffaa4444',
                borderRadius: '7px', color: '#ffaa44', cursor: 'pointer',
              }}
            >
              🐕 Dog tab
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


export default function FavsTab({ allGames, todayLock, todayDog, onLockChange, onDogChange }) {
  const [favTeam, setFavTeam] = useState(() => localStorage.getItem('favTeam_MLB') || '')
  const [picking, setPicking] = useState(() => !localStorage.getItem('favTeam_MLB'))
  const [saveData, setSaveData] = useState(null)

  useEffect(() => {
    // Hydrate favTeam from server prefs (authoritative, overrides localStorage if set)
    loadPrefs().then(prefs => {
      if (prefs?.favTeam_MLB) {
        setFavTeam(prefs.favTeam_MLB)
        setPicking(false)
        localStorage.setItem('favTeam_MLB', prefs.favTeam_MLB)
      }
    }).catch(() => {})
    fetch(`${SERVER}/data`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSaveData(d))
      .catch(() => {})
  }, [])
  function selectTeam(team) {
    setFavTeam(team)
    setPicking(false)
    loadPrefs().then(prefs => savePrefs({ ...prefs, 'favTeam_MLB': team }))
    localStorage.setItem('favTeam_MLB', team)  // keep for fast reads
  }

  // ── Crunch all pick data ───────────────────────────────────────────────────
  const analytics = useMemo(() => {
    if (!favTeam || !saveData) return null

    const allPicks = [] // { date, team, sport, result, odds, isLock, isDog, involved, pickedThem }

    // From predictions legs
    Object.entries(saveData.predictions || {}).forEach(([date, pred]) => {
      ;(pred.legs || []).forEach(leg => {
        if (leg.sport !== 'MLB') return
        const involved = teamMatches(leg.home, favTeam) || teamMatches(leg.away, favTeam)
        const pickedThem = teamMatches(leg.team, favTeam)
        allPicks.push({ date, ...leg, involved, pickedThem, source: 'prediction' })
      })
    })

    // From app.picks (lock picks)
    Object.entries(saveData.app?.picks || {}).forEach(([date, pick]) => {
      if (pick?.sport !== 'MLB') return
      const involved = teamMatches(pick.home, favTeam) || teamMatches(pick.away, favTeam)
      const pickedThem = teamMatches(pick.team, favTeam)
      allPicks.push({ date, ...pick, involved, pickedThem, source: 'lock' })
    })

    if (allPicks.length === 0) return { empty: true }

    const mlbPicks = allPicks
    const favInvolved = mlbPicks.filter(p => p.involved)
    const favPicked   = mlbPicks.filter(p => p.pickedThem)
    const favFaded    = favInvolved.filter(p => !p.pickedThem)

    // W/L rates — only resolved
    function rate(picks) {
      const resolved = picks.filter(p => p.result === 'W' || p.result === 'L')
      const wins = resolved.filter(p => p.result === 'W').length
      return { wins, losses: resolved.length - wins, total: resolved.length, pct: resolved.length ? Math.round(wins / resolved.length * 100) : null }
    }

    const overallRate   = rate(mlbPicks)
    const pickedRate    = rate(favPicked)
    const fadedRate     = rate(favFaded)
    const involvedRate  = rate(favInvolved)

    // Bias: of all games fav team was involved, % of time you picked them
    const involvedResolved = favInvolved.filter(p => p.result === 'W' || p.result === 'L')
    const biasScore = involvedResolved.length
      ? (favPicked.filter(p => p.result === 'W' || p.result === 'L').length / involvedResolved.length) * 100
      : 50

    // Knowledge delta: are you better when their games are involved vs overall?
    const knowledgeDelta = (involvedRate.pct !== null && overallRate.pct !== null)
      ? involvedRate.pct - overallRate.pct
      : null

    // Avg odds when picking them (positive = underdog bets, negative = chalk)
    const pickedResolvedOdds = favPicked.filter(p => p.odds)
    const avgOdds = pickedResolvedOdds.length
      ? Math.round(pickedResolvedOdds.reduce((s, p) => s + p.odds, 0) / pickedResolvedOdds.length)
      : null

    return {
      empty: mlbPicks.length === 0,
      totalMLB: mlbPicks.length,
      favInvolvedCount: favInvolved.length,
      favPickedCount: favPicked.length,
      favFadedCount: favFaded.length,
      overallRate,
      pickedRate,
      fadedRate,
      involvedRate,
      biasScore,
      knowledgeDelta,
      avgOdds,
      recentPicks: favInvolved.filter(p => p.result).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 5),
    }
  }, [favTeam, saveData])

  // ── Team Selector ─────────────────────────────────────────────────────────
  if (picking || !favTeam) {
    return (
      <div>
        <div style={{ marginBottom: '1.75rem' }}>
          <h2 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: '#aaa' }}>⭐ FAVS</h2>
          <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>Pick your favorite MLB team. We'll tell you if you actually know ball or just ride with your team.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
          {MLB_TEAMS.map(team => (
            <button key={team} onClick={() => selectTeam(team)} style={{
              padding: '0.65rem 0.75rem', background: '#111', border: '1px solid #1e1e1e',
              borderRadius: '8px', color: '#666', cursor: 'pointer', fontSize: '0.78rem',
              textAlign: 'left', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#8888ff'; e.currentTarget.style.color = '#aaa' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e1e1e'; e.currentTarget.style.color = '#666' }}
            >
              {team}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Analytics View ────────────────────────────────────────────────────────
  const a = analytics
  if (!a) return null  // still loading saveData or no favTeam set yet

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', color: '#aaa' }}>⭐ FAVS</h2>
          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>{favTeam}</div>
          <div style={{ fontSize: '0.7rem', color: '#444', marginTop: '0.15rem' }}>MLB · your bias report</div>
        </div>
        <button onClick={() => setPicking(true)} style={{
          fontSize: '0.68rem', padding: '0.35rem 0.75rem', background: 'transparent',
          border: '1px solid #2a2a2a', borderRadius: '6px', color: '#555', cursor: 'pointer',
        }}>change team</button>
      </div>
      {/* Today's game — show lock/dog status or quick pick */}
      {favTeam && (
        <TodayGameCard
          team={favTeam}
          allGames={allGames}
          todayLock={todayLock}
          todayDog={todayDog}
          onLockChange={onLockChange}
          onDogChange={onDogChange}
          mode="favs"
        />
      )}


      {a?.empty ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#333' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📊</div>
          <div style={{ fontSize: '0.85rem' }}>No MLB picks yet involving {favTeam}.</div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.4rem', color: '#2a2a2a' }}>Make some picks and come back.</div>
        </div>
      ) : (
        <>
          {/* Bias meter */}
          <BiasMeter pickPct={a.biasScore} />

          {/* Core stats row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <StatCard
              label="Picked them"
              value={a.pickedRate.pct !== null ? `${a.pickedRate.pct}%` : '· · ·'}
              sub={`${a.pickedRate.wins}W–${a.pickedRate.losses}L · ${a.favPickedCount} picks`}
              color={a.pickedRate.pct === null ? '#555' : a.pickedRate.pct >= 55 ? '#00ff88' : a.pickedRate.pct >= 40 ? '#aaa' : '#ff4444'}
            />
            <StatCard
              label="Faded them"
              value={a.fadedRate.pct !== null ? `${a.fadedRate.pct}%` : '· · ·'}
              sub={`${a.fadedRate.wins}W–${a.fadedRate.losses}L · ${a.favFadedCount} picks`}
              color={a.fadedRate.pct === null ? '#555' : a.fadedRate.pct >= 55 ? '#00ff88' : a.fadedRate.pct >= 40 ? '#aaa' : '#ff4444'}
            />
            <StatCard
              label="MLB overall"
              value={a.overallRate.pct !== null ? `${a.overallRate.pct}%` : '· · ·'}
              sub={`${a.overallRate.wins}W–${a.overallRate.losses}L`}
              color='#555'
            />
          </div>

          {/* Knowledge delta */}
          {a.knowledgeDelta !== null && (
            <div style={{
              background: '#111', border: `1px solid ${a.knowledgeDelta > 0 ? '#00ff8822' : '#ff444422'}`,
              borderRadius: '10px', padding: '0.85rem 1.1rem', marginBottom: '0.75rem',
            }}>
              <div style={{ fontSize: '0.62rem', color: '#444', letterSpacing: '0.07em', marginBottom: '0.3rem' }}>KNOWLEDGE DELTA</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{
                  fontSize: '1.4rem', fontWeight: 'bold',
                  color: a.knowledgeDelta > 0 ? '#00ff88' : '#ff4444',
                }}>
                  {a.knowledgeDelta > 0 ? '+' : ''}{a.knowledgeDelta}%
                </span>
                <span style={{ fontSize: '0.75rem', color: '#555' }}>
                  {a.knowledgeDelta > 0
                    ? `vs your MLB average — you have an edge on ${favTeam.split(' ').pop()} games`
                    : `vs your MLB average — you're actually worse on ${favTeam.split(' ').pop()} games`}
                </span>
              </div>
            </div>
          )}

          {/* Avg odds card */}
          {a.avgOdds !== null && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <StatCard
                label="Avg odds (picking them)"
                value={a.avgOdds > 0 ? `+${a.avgOdds}` : `${a.avgOdds}`}
                sub={a.avgOdds > 0 ? 'underdog lean' : 'chalk lean'}
                color={a.avgOdds > 0 ? '#ff9944' : '#4c9be8'}
              />
              <StatCard
                label="Games involved"
                value={a.favInvolvedCount}
                sub={`${a.favPickedCount} picked · ${a.favFadedCount} faded`}
                color='#8888ff'
              />
            </div>
          )}

          {/* Recent picks log */}
          {a.recentPicks.length > 0 && (
            <div>
              <div style={{ fontSize: '0.62rem', color: '#333', fontWeight: 'bold', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>
                RECENT · {favTeam.split(' ').pop()} GAMES
              </div>
              {a.recentPicks.map((pick, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.55rem 0', borderBottom: '1px solid #111', fontSize: '0.75rem',
                }}>
                  <div style={{ color: '#555' }}>{pick.date}</div>
                  <div style={{ color: '#666' }}>
                    {pick.away} @ {pick.home}
                  </div>
                  <div style={{ color: pick.pickedThem ? '#8888ff' : '#444', fontSize: '0.68rem' }}>
                    {pick.pickedThem ? '✓ picked' : '✗ faded'}
                  </div>
                  <div style={{
                    fontWeight: 'bold', fontSize: '0.78rem',
                    color: pick.result === 'W' ? '#00ff88' : pick.result === 'L' ? '#ff4444' : '#333',
                  }}>
                    {pick.result || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Coming soon teaser */}
          <div style={{ marginTop: '2rem', padding: '1rem', background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.62rem', color: '#2a2a2a', fontWeight: 'bold', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>COMING SOON</div>
            {[
              'Head-to-head record vs division rivals',
              'Time-of-day edge (day games vs night games)',
              'Streak awareness — do you chase or pivot?',
              'Pitcher matchup awareness score',
              'Home / away split in your picks',
            ].map((item, i) => (
              <div key={i} style={{ fontSize: '0.72rem', color: '#222', marginBottom: '0.3rem' }}>· {item}</div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
