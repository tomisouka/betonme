import React, { useState, useEffect, useMemo } from 'react'
import { loadPrefs, savePrefs } from '../hooks/useSaveData.js'

const SERVER = 'http://127.0.0.1:3001'

// ── MLB Teams ─────────────────────────────────────────────────────────────────
const MLB_TEAMS = [
  'New York Yankees', 'Boston Red Sox', 'Baltimore Orioles', 'Toronto Blue Jays', 'Tampa Bay Rays',
  'Chicago White Sox', 'Cleveland Guardians', 'Detroit Tigers', 'Kansas City Royals', 'Minnesota Twins',
  'Houston Astros', 'Los Angeles Angels', 'Oakland Athletics', 'Seattle Mariners', 'Texas Rangers',
  'Atlanta Braves', 'Miami Marlins', 'New York Mets', 'Philadelphia Phillies', 'Washington Nationals',
  'Chicago Cubs', 'Cincinnati Reds', 'Milwaukee Brewers', 'Pittsburgh Pirates', 'St. Louis Cardinals',
  'Arizona Diamondbacks', 'Colorado Rockies', 'Los Angeles Dodgers', 'San Diego Padres', 'San Francisco Giants',
]

const TEAM_ABBREVS = {
  'Houston Astros':       ['HOU Astros','Astros','HOU'],
  'New York Yankees':     ['NY Yankees','Yankees','NYY'],
  'Los Angeles Dodgers':  ['LA Dodgers','Dodgers','LAD'],
  'Boston Red Sox':       ['BOS Red Sox','Red Sox','BOS'],
  'Chicago Cubs':         ['CHI Cubs','Cubs','CHC'],
  'San Francisco Giants': ['SF Giants','Giants','SFG'],
  'Atlanta Braves':       ['ATL Braves','Braves','ATL'],
  'New York Mets':        ['NY Mets','Mets','NYM'],
  'Cleveland Guardians':  ['CLE Guardians','Guardians','CLE'],
  'Seattle Mariners':     ['SEA Mariners','Mariners','SEA'],
  'Los Angeles Angels':   ['LA Angels','Angels','LAA'],
  'Toronto Blue Jays':    ['TOR Blue Jays','Blue Jays','TOR'],
  'San Diego Padres':     ['SD Padres','Padres','SDP'],
  'Arizona Diamondbacks': ['ARI Diamondbacks','Diamondbacks','ARI'],
  'Kansas City Royals':   ['KC Royals','Royals','KCR'],
  'Detroit Tigers':       ['DET Tigers','Tigers','DET'],
  'Minnesota Twins':      ['MIN Twins','Twins','MIN'],
  'Pittsburgh Pirates':   ['PIT Pirates','Pirates','PIT'],
  'Milwaukee Brewers':    ['MIL Brewers','Brewers','MIL'],
  'Colorado Rockies':     ['COL Rockies','Rockies','COL'],
  'Miami Marlins':        ['MIA Marlins','Marlins','MIA'],
  'Oakland Athletics':    ['OAK Athletics','Athletics','OAK'],
  'Texas Rangers':        ['TEX Rangers','Rangers','TEX'],
  'Tampa Bay Rays':       ['TB Rays','Rays','TBR'],
  'Baltimore Orioles':    ['BAL Orioles','Orioles','BAL'],
  'Philadelphia Phillies':['PHI Phillies','Phillies','PHI'],
  'Washington Nationals': ['WSH Nationals','Nationals','WSH'],
  'Chicago White Sox':    ['CHI White Sox','White Sox','CHW'],
  'Cincinnati Reds':      ['CIN Reds','Reds','CIN'],
  'St. Louis Cardinals':  ['STL Cardinals','Cardinals','STL'],
}

function teamMatches(pickTeam, favTeam) {
  if (!pickTeam || !favTeam) return false
  const pt = pickTeam.toLowerCase()
  const ft = favTeam.toLowerCase()
  if (pt === ft || pt.includes(ft) || ft.includes(pt)) return true
  const abbrevs = (TEAM_ABBREVS[favTeam] || []).map(a => a.toLowerCase())
  return abbrevs.some(a => pt === a || pt.split(' ').pop() === a.split(' ').pop())
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = '#aaa' }) {
  return (
    <div style={{
      background: '#1a1a1a', border: '1px solid #242424', borderRadius: '12px',
      padding: '0.9rem 1rem', flex: '1 1 100px', minWidth: '90px',
    }}>
      <div style={{ fontSize: '0.58rem', color: '#444', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.63rem', color: '#555', marginTop: '0.3rem' }}>{sub}</div>}
    </div>
  )
}

// ── Hate Edge Meter ──────────────────────────────────────────────────────────
// Measures fade win rate vs overall MLB win rate.
// Positive delta = your hate is backed by data. Negative = just vibes.
function HateEdgeMeter({ fadeRate, overallRate, fadedCount }) {
  if (fadedCount < 3 || fadeRate === null) {
    return (
      <div style={{ marginBottom: '1.5rem', padding: '0.85rem 1rem', background: '#111', border: '1px solid #1e1e1e', borderRadius: '10px' }}>
        <div style={{ fontSize: '0.62rem', color: '#444', letterSpacing: '0.07em', marginBottom: '0.3rem' }}>HATE EDGE</div>
        <div style={{ fontSize: '0.75rem', color: '#333' }}>Need at least 3 resolved fades to measure your edge.</div>
      </div>
    )
  }
  const delta  = overallRate !== null ? fadeRate - overallRate : null
  const clamp  = delta !== null ? Math.max(-40, Math.min(40, delta)) : 0
  const pos    = Math.max(2, Math.min(98, 50 + clamp * 1.2))
  const color  = delta === null ? '#555' : delta >= 10 ? '#00ff88' : delta >= 0 ? '#ffaa44' : '#ff4444'
  const label  = delta === null ? '- - -'
               : delta >= 15  ? 'LEGIT EDGE'
               : delta >= 5   ? 'SLIGHT EDGE'
               : delta >= -5  ? 'BREAK EVEN'
               : delta >= -15 ? 'NEGATIVE EDGE'
               :                'COSTING YOU'
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.62rem', color: '#444', letterSpacing: '0.07em' }}>HATE EDGE</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color }}>{label}</span>
      </div>
      <div style={{ position: 'relative', height: '8px', background: '#111', borderRadius: '4px', border: '1px solid #222' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '4px', background: 'linear-gradient(to right, #ff4444, #ffaa44 50%, #00ff88)', opacity: 0.18 }} />
        <div style={{ position: 'absolute', left: '50%', top: '-2px', width: '2px', height: '12px', background: '#333', transform: 'translateX(-50%)' }} />
        <div style={{ position: 'absolute', top: '-3px', width: '14px', height: '14px', background: color, borderRadius: '50%', border: '2px solid #111', left: `calc(${pos}% - 7px)`, transition: 'left 0.4s ease', boxShadow: `0 0 6px ${color}88` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem' }}>
        <span style={{ fontSize: '0.58rem', color: '#333' }}>Worse than avg</span>
        <span style={{ fontSize: '0.58rem', color: '#444' }}>{fadeRate}% fading{overallRate !== null ? ` vs ${overallRate}% overall` : ''}</span>
        <span style={{ fontSize: '0.58rem', color: '#333' }}>Better than avg</span>
      </div>
    </div>
  )
}

// ── Verdict ───────────────────────────────────────────────────────────────────
function Verdict({ fadeRate, overallRate, fadedCount }) {
  if (fadedCount < 3) return (
    <div style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '0.85rem 1.1rem', marginBottom: '0.75rem' }}>
      <div style={{ fontSize: '0.62rem', color: '#444', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>VERDICT</div>
      <div style={{ fontSize: '0.8rem', color: '#444' }}>Need at least 3 fades to render a verdict. Keep hating.</div>
    </div>
  )
  if (fadeRate === null) return null

  const delta = overallRate !== null ? fadeRate - overallRate : null
  let verdict, vcolor, vsub

  if (fadeRate >= 60) {
    verdict = 'Legit Hater'
    vcolor  = '#00ff88'
    vsub    = delta !== null ? `+${delta}% better than your MLB average` : 'Your hate is backed by results'
  } else if (fadeRate >= 45) {
    verdict = 'Cope Hater'
    vcolor  = '#ffaa44'
    vsub    = 'You win sometimes but your hate is not an edge'
  } else {
    verdict = 'Stay In Your Lane'
    vcolor  = '#ff4444'
    vsub    = delta !== null ? `${delta}% worse than your MLB average — your hate is costing you` : 'Your fades are not working'
  }

  return (
    <div style={{
      background: '#111', border: `1px solid ${vcolor}33`,
      borderRadius: '10px', padding: '0.85rem 1.1rem', marginBottom: '0.75rem',
    }}>
      <div style={{ fontSize: '0.62rem', color: '#444', letterSpacing: '0.07em', marginBottom: '0.3rem' }}>VERDICT</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: vcolor }}>{verdict}</span>
        <span style={{ fontSize: '0.72rem', color: '#555' }}>{vsub}</span>
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


export default function HateWatchTab({ allGames, todayLock, todayDog, onLockChange, onDogChange }) {
  const [hateTeam, setHateTeam] = useState('')
  const [picking, setPicking]   = useState(true)
  const [saveData, setSaveData] = useState(null)

  useEffect(() => {
    fetch(`${SERVER}/data`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSaveData(d))
      .catch(() => {})
  }, [])

  // Load team preference from savedata on mount
  useEffect(() => {
    loadPrefs().then(prefs => {
      const saved = prefs['hateTeam_MLB']
      if (saved) {
        setHateTeam(saved)
        setPicking(false)
      }
    }).catch(() => {
      // fallback to localStorage for backwards compat
      const ls = localStorage.getItem('hateTeam_MLB')
      if (ls) { setHateTeam(ls); setPicking(false) }
    })
  }, [])

  function selectTeam(team) {
    setHateTeam(team)
    setPicking(false)
    loadPrefs().then(prefs => savePrefs({ ...prefs, 'hateTeam_MLB': team }))
    localStorage.setItem('hateTeam_MLB', team)  // keep for fast reads
  }

  const analytics = useMemo(() => {
    if (!hateTeam || !saveData) return null

    const allPicks = []

    Object.entries(saveData.predictions || {}).forEach(([date, pred]) => {
      ;(pred.legs || []).forEach(leg => {
        if (leg.sport !== 'MLB') return
        const involved   = teamMatches(leg.home, hateTeam) || teamMatches(leg.away, hateTeam)
        const pickedThem = teamMatches(leg.team, hateTeam)
        const fadedThem  = involved && !pickedThem
        allPicks.push({ date, ...leg, involved, pickedThem, fadedThem, source: 'prediction' })
      })
    })

    Object.entries(saveData.app?.picks || {}).forEach(([date, pick]) => {
      if (pick?.sport !== 'MLB') return
      const involved   = teamMatches(pick.home, hateTeam) || teamMatches(pick.away, hateTeam)
      const pickedThem = teamMatches(pick.team, hateTeam)
      const fadedThem  = involved && !pickedThem
      allPicks.push({ date, ...pick, involved, pickedThem, fadedThem, source: 'lock' })
    })

    if (allPicks.length === 0) return { empty: true }

    const involved   = allPicks.filter(p => p.involved)
    const fadedPicks = allPicks.filter(p => p.fadedThem)
    const pickedPicks= allPicks.filter(p => p.pickedThem)

    function rate(picks) {
      const resolved = picks.filter(p => p.result === 'W' || p.result === 'L')
      const wins     = resolved.filter(p => p.result === 'W').length
      return {
        wins, losses: resolved.length - wins,
        total: resolved.length,
        pct: resolved.length ? Math.round(wins / resolved.length * 100) : null,
      }
    }

    const mlbAll      = allPicks.filter(p => p.sport === 'MLB' || !p.sport)
    const overallRate = rate(mlbAll)
    const fadeRate    = rate(fadedPicks)
    const pickRate    = rate(pickedPicks)

    // saltiness % removed — fading is expected in hate watch

    const avgOdds = fadedPicks.filter(p => p.odds).length
      ? Math.round(fadedPicks.filter(p => p.odds).reduce((s, p) => s + p.odds, 0) / fadedPicks.filter(p => p.odds).length)
      : null

    const knowledgeDelta = (fadeRate.pct !== null && overallRate.pct !== null)
      ? fadeRate.pct - overallRate.pct
      : null

    return {
      empty: involved.length === 0,
      involvedCount: involved.length,
      fadedCount:    fadedPicks.length,
      pickedCount:   pickedPicks.length,
      fadeRate,
      pickRate,
      overallRate,
      knowledgeDelta,
      avgOdds,
      recentFades: fadedPicks.filter(p => p.result).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 5),
    }
  }, [hateTeam, saveData])

  // ── Team Selector ─────────────────────────────────────────────────────────
  if (picking || !hateTeam) {
    return (
      <div>
        <div style={{ marginBottom: '1.75rem' }}>
          <h2 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: '#aaa' }}>😤 HATE WATCH</h2>
          <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>Pick the team you love to fade. We will tell you if your hate is actually profitable or if you are just mad online.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
          {MLB_TEAMS.map(team => (
            <button key={team} onClick={() => selectTeam(team)} style={{
              padding: '0.65rem 0.75rem', background: '#111', border: '1px solid #1e1e1e',
              borderRadius: '8px', color: '#666', cursor: 'pointer', fontSize: '0.78rem',
              textAlign: 'left', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ff4444'; e.currentTarget.style.color = '#aaa' }}
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

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', color: '#aaa' }}>😤 HATE WATCH</h2>
          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff' }}>{hateTeam}</div>
          <div style={{ fontSize: '0.7rem', color: '#444', marginTop: '0.15rem' }}>MLB · your fade report</div>
        </div>
        <button onClick={() => setPicking(true)} style={{
          fontSize: '0.68rem', padding: '0.35rem 0.75rem', background: 'transparent',
          border: '1px solid #2a2a2a', borderRadius: '6px', color: '#555', cursor: 'pointer',
        }}>change team</button>
      </div>
      {/* Today's game — show lock/dog status or quick pick */}
      {hateTeam && (
        <TodayGameCard
          team={hateTeam}
          allGames={allGames}
          todayLock={todayLock}
          todayDog={todayDog}
          onLockChange={onLockChange}
          onDogChange={onDogChange}
          mode="hate"
        />
      )}


      {a?.empty ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: '#333' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>😤</div>
          <div style={{ fontSize: '0.85rem' }}>No MLB picks involving {hateTeam} yet.</div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.4rem', color: '#2a2a2a' }}>Get out there and start hating.</div>
        </div>
      ) : (
        <>
          {/* Hate edge */}
          <HateEdgeMeter fadeRate={a.fadeRate.pct} overallRate={a.overallRate.pct} fadedCount={a.fadedCount} />

          {/* Verdict */}
          <Verdict fadeRate={a.fadeRate.pct} overallRate={a.overallRate.pct} fadedCount={a.fadedCount} />

          {/* Core stats */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <StatCard
              label="When you fade them"
              value={a.fadeRate.pct !== null ? `${a.fadeRate.pct}%` : '· · ·'}
              sub={`${a.fadeRate.wins}W–${a.fadeRate.losses}L · ${a.fadedCount} fades`}
              color={a.fadeRate.pct === null ? '#555' : a.fadeRate.pct >= 55 ? '#00ff88' : a.fadeRate.pct >= 40 ? '#aaa' : '#ff4444'}
            />
            <StatCard
              label="When you pick them"
              value={a.pickRate.pct !== null ? `${a.pickRate.pct}%` : '· · ·'}
              sub={`${a.pickRate.wins}W–${a.pickRate.losses}L · ${a.pickedCount} picks`}
              color={a.pickRate.pct === null ? '#555' : a.pickRate.pct >= 55 ? '#00ff88' : a.pickRate.pct >= 40 ? '#aaa' : '#ff4444'}
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
              <div style={{ fontSize: '0.62rem', color: '#444', letterSpacing: '0.07em', marginBottom: '0.3rem' }}>FADE EDGE</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: a.knowledgeDelta > 0 ? '#00ff88' : '#ff4444' }}>
                  {a.knowledgeDelta > 0 ? '+' : ''}{a.knowledgeDelta}%
                </span>
                <span style={{ fontSize: '0.75rem', color: '#555' }}>
                  {a.knowledgeDelta > 0
                    ? `vs your MLB average — your hate is an actual edge`
                    : `vs your MLB average — your hate is just hate`}
                </span>
              </div>
            </div>
          )}

          {/* Avg odds + game count */}
          {a.avgOdds !== null && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <StatCard
                label="Avg odds (fading them)"
                value={a.avgOdds > 0 ? `+${a.avgOdds}` : `${a.avgOdds}`}
                sub={a.avgOdds > 0 ? 'fading the dog' : 'fading the chalk'}
                color={a.avgOdds > 0 ? '#ff9944' : '#4c9be8'}
              />
              <StatCard
                label="Games involved"
                value={a.involvedCount}
                sub={`${a.fadedCount} faded · ${a.pickedCount} picked`}
                color='#ff4444'
              />
            </div>
          )}

          {/* Recent fades log */}
          {a.recentFades.length > 0 && (
            <div>
              <div style={{ fontSize: '0.62rem', color: '#333', fontWeight: 'bold', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>
                RECENT FADES · {hateTeam.split(' ').pop()}
              </div>
              {a.recentFades.map((pick, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.55rem 0', borderBottom: '1px solid #111', fontSize: '0.75rem',
                }}>
                  <div style={{ color: '#555' }}>{pick.date}</div>
                  <div style={{ color: '#666', fontSize: '0.68rem' }}>
                    {pick.away} @ {pick.home}
                  </div>
                  <div style={{ color: '#ff4444', fontSize: '0.68rem' }}>✗ faded</div>
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

          {/* Coming soon */}
          <div style={{ marginTop: '2rem', padding: '1rem', background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.62rem', color: '#2a2a2a', fontWeight: 'bold', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>COMING SOON</div>
            {[
              'Rivalry fade record — how you do specifically on rivalry matchups',
              'Tilt detector — do you fade them harder after they beat your fav?',
              'Best odds you got fading them (peak hate value)',
              'Division breakdown — easier to fade in-division or out?',
            ].map((item, i) => (
              <div key={i} style={{ fontSize: '0.72rem', color: '#222', marginBottom: '0.3rem' }}>· {item}</div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
