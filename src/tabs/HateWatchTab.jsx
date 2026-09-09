import React, { useState, useEffect, useMemo } from 'react'
import { loadPrefs, savePrefs, loadHatePick, saveHatePick, SERVER } from '../hooks/useSaveData.js'
import { getTodayKey, getGameDateLabel } from '../utils/odds.js'
// STEP MARKER: step 3/6 in progress — file 4 of 5 (HateWatchTab.jsx) done.
// Next: checkbetonme.sh (final file in step 3).

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
function HateEdgeMeter({ fadeRate, overallRate, fadedCount, spreadWins = 0 }) {
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
      {spreadWins > 0 && (
        <div style={{ fontSize: '0.58rem', color: '#ffaa4466', marginTop: '0.3rem', textAlign: 'right' }}>
          ★ {spreadWins} spread win{spreadWins !== 1 ? 's' : ''} · 1.5× weight applied
        </div>
      )}
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


// ── Today's Game Card — owns hatePick slot ────────────────────────────────────
function TodayGameCard({ team, allGames, todayHatePick, todayLock, todayDog, onHatePickChange }) {
  const [step, setStep]       = useState('side')   // 'side' | 'line' | 'nopick_confirm'
  const [side, setSide]       = useState(null)      // 'fade' | 'sell'
  const [saving, setSaving]   = useState(false)
  const [changing, setChanging] = useState(false)

  function nameMatches(a, b) {
    if (!a || !b) return false
    const al = a.toLowerCase().trim(), bl = b.toLowerCase().trim()
    if (al === bl) return true
    if (al.includes(bl) || bl.includes(al)) return true
    const alLast = al.split(' ').pop(), blLast = bl.split(' ').pop()
    if (alLast.length > 2 && alLast === blLast) return true
    return false
  }

  function fmtO(price) {
    if (price == null) return null
    const n = Math.round(price)
    return n > 0 ? `+${n}` : `${n}`
  }

  const last = team.toLowerCase().split(' ').pop()

  // Check if lock or dog already covers this team
  const lockCoversTeam = todayLock?.team && nameMatches(todayLock.team, team)
  const dogCoversTeam  = todayDog?.team  && nameMatches(todayDog.team,  team)
  const coveredPick    = lockCoversTeam ? todayLock : dogCoversTeam ? todayDog : null
  const coverSource    = lockCoversTeam ? '🔒 Lock' : dogCoversTeam ? '🐕 Dog' : null

  const _now = new Date()
  const _todayMidnight = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate())
  const _tomorrowMidnight = new Date(_todayMidnight.getTime() + 86400000)

  const todayGame = allGames.find(g => {
    if (g.sportLabel !== 'MLB') return false
    const home = (g.home_team || '').toLowerCase()
    const away = (g.away_team || '').toLowerCase()
    if (!home.includes(last) && !away.includes(last)) return false
    const gameTime = new Date(g.commence_time)
    return gameTime >= _todayMidnight && gameTime < _tomorrowMidnight
  })

  const noGameNextGame = !todayGame ? allGames
    .filter(g => {
      if (g.sportLabel !== 'MLB') return false
      const home = (g.home_team || '').toLowerCase()
      const away = (g.away_team || '').toLowerCase()
      if (!home.includes(last) && !away.includes(last)) return false
      const gameDay = new Date(g.commence_time)
      const gameMidnight = new Date(gameDay.getFullYear(), gameDay.getMonth(), gameDay.getDate())
      return gameMidnight > _todayMidnight
    })
    .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))[0]
    : null

  if (!todayGame) {
    const teamShort = team.split(' ').pop()
    const isNoPick  = !!todayHatePick?.noPick

    if (!noGameNextGame) return (
      <div style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '0.9rem 1.1rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.62rem', color: '#444' }}>⚾ No upcoming MLB games found for {teamShort}</div>
      </div>
    )

    const nextIsHome   = (noGameNextGame.home_team || '').toLowerCase().includes(last)
    const nextOpponent = nextIsHome ? noGameNextGame.away_team : noGameNextGame.home_team
    const nextOppShort = (nextOpponent || '').split(' ').pop()
    const dateLabel    = getGameDateLabel(noGameNextGame.commence_time)

    async function saveNoPickEarly() {
      setSaving(true)
      try {
        const existing = await loadHatePick()
        const updated  = { ...existing, [getTodayKey()]: { noPick: true, reason: 'not_playing' } }
        await saveHatePick(updated)
        onHatePickChange?.()
        setStep('side')
      } catch (e) { console.error(e) }
      finally { setSaving(false) }
    }

    return (
      <div style={{ background: '#111', border: `1px solid ${isNoPick ? '#333' : '#2a2a2a'}`, borderRadius: '12px', padding: '0.9rem 1.1rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.58rem', color: '#444', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
          ⚾ No game today · next up
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#ccc', marginBottom: '0.3rem' }}>
          {nextIsHome
            ? <>{nextOppShort} <span style={{ color: '#444', fontWeight: 'normal' }}>@</span> <span style={{ color: '#fff' }}>{teamShort}</span></>
            : <><span style={{ color: '#fff' }}>{teamShort}</span> <span style={{ color: '#444', fontWeight: 'normal' }}>@</span> {nextOppShort}</>
          }
        </div>
        <div style={{ fontSize: '0.62rem', color: '#555', marginBottom: '0.75rem' }}>{dateLabel}</div>

        {/* No Pick state */}
        {isNoPick && step !== 'nopick_confirm' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#444', fontStyle: 'italic' }}>🚫 No pick today — marked as off day</span>
            <button onClick={() => setStep('nopick_confirm')} style={{
              fontSize: '0.6rem', padding: '0.2rem 0.5rem', background: 'transparent',
              border: '1px solid #222', borderRadius: '5px', color: '#444', cursor: 'pointer',
            }}>undo</button>
          </div>
        )}

        {/* No Pick confirm dialog */}
        {step === 'nopick_confirm' && (
          <div style={{ background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.75rem 0.85rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#aaa', fontWeight: 'bold', marginBottom: '0.3rem' }}>🚫 Skip today's pick?</div>
            <div style={{ fontSize: '0.63rem', color: '#555', marginBottom: '0.7rem', lineHeight: 1.5 }}>
              Mark <span style={{ color: '#888' }}>{teamShort}</span> as not in play today. Won't count against your stats.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={saveNoPickEarly} disabled={saving} style={{
                flex: 1, padding: '0.5rem', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer',
                background: '#1a1a1a', border: '1px solid #333', color: '#888', fontSize: '0.73rem', fontWeight: 'bold',
              }}>{saving ? 'Saving...' : 'Yes, skip today'}</button>
              <button onClick={() => setStep('side')} style={{
                flex: 1, padding: '0.5rem', borderRadius: '6px', cursor: 'pointer',
                background: 'transparent', border: '1px solid #1e1e1e', color: '#444', fontSize: '0.7rem',
              }}>← Go back</button>
            </div>
          </div>
        )}

        {/* No Pick button — only show if no pick set yet */}
        {!isNoPick && step !== 'nopick_confirm' && (
          <button onClick={() => setStep('nopick_confirm')} style={{
            fontSize: '0.62rem', padding: '0.3rem 0.6rem', background: 'transparent',
            border: '1px solid #1e1e1e', borderRadius: '5px', color: '#333', cursor: 'pointer',
          }}>🚫 No pick today</button>
        )}
      </div>
    )
  }

  const isHome    = (todayGame.home_team || '').toLowerCase().includes(last)
  const teamFull  = isHome ? todayGame.home_team : todayGame.away_team
  const opponent  = isHome ? todayGame.away_team : todayGame.home_team
  const teamShort = teamFull.split(' ').pop()
  const oppShort  = opponent.split(' ').pop()

  const gameTime = todayGame.commence_time
    ? new Date(todayGame.commence_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  const bm          = todayGame.bookmakers?.[0]
  const mlMarket    = bm?.markets?.find(m => m.key === 'h2h')
  const spMarket    = bm?.markets?.find(m => m.key === 'spreads')
  const teamML      = mlMarket?.outcomes?.find(o => nameMatches(o.name, teamFull))
                   ?? mlMarket?.outcomes?.find(o => nameMatches(o.name, teamShort))
                   ?? (mlMarket?.outcomes?.length === 2 ? mlMarket.outcomes.find(o => !nameMatches(o.name, opponent)) : null)
  const oppML       = mlMarket?.outcomes?.find(o => !nameMatches(o.name, teamFull) && o !== teamML)
                   ?? (mlMarket?.outcomes?.length === 2 ? mlMarket.outcomes.find(o => o !== teamML) : null)
  const teamSpread  = spMarket?.outcomes?.find(o => nameMatches(o.name, teamFull))
                   ?? spMarket?.outcomes?.find(o => nameMatches(o.name, teamShort))
  const oppSpread   = spMarket?.outcomes?.find(o => !nameMatches(o.name, teamFull) && o !== teamSpread)

  // For fade: betting opponent. For sell: betting hate team.
  // Casual = lower odds (more negative / less positive). Super = higher odds (bigger dog price).
  function getLineOptions(pickSide) {
    const isMLB = true
    if (pickSide === 'fade') {
      // Fading hate team = betting opponent
      const lines = []
      if (oppML)     lines.push({ label: `${oppShort} ML`, market: 'h2h',     odds: oppML.price,     point: null,            team: opponent })
      if (oppSpread) lines.push({ label: `${oppShort} ${oppSpread.point > 0 ? '+' : ''}${oppSpread.point}`, market: 'spreads', odds: oppSpread.price, point: oppSpread.point, team: opponent })
      // Sort: lower absolute value first (chalk = casual), higher absolute value = super
      lines.sort((a, b) => Math.abs(a.odds) - Math.abs(b.odds))
      return lines
    } else {
      // Selling out = betting hate team
      const lines = []
      if (teamML)     lines.push({ label: `${teamShort} ML`, market: 'h2h',     odds: teamML.price,     point: null,              team: teamFull })
      if (teamSpread) lines.push({ label: `${teamShort} ${teamSpread.point > 0 ? '+' : ''}${teamSpread.point}`, market: 'spreads', odds: teamSpread.price, point: teamSpread.point, team: teamFull })
      lines.sort((a, b) => Math.abs(a.odds) - Math.abs(b.odds))
      return lines
    }
  }

  const hasHatePick = !!todayHatePick && !todayHatePick.noPick
  const isNoPick    = !!todayHatePick?.noPick
  const isCovered   = !!coveredPick
  const displayPick = coveredPick || todayHatePick
  const isSpread    = displayPick?.market === 'spreads'
  const anyPick     = isCovered || hasHatePick || isNoPick
  const savedSide   = todayHatePick?.intensitySide
  const savedIntensity = todayHatePick?.intensity // 'casual_fade' | 'super_fade' | 'casual_sell' | 'super_sell'

  function intensityLabel(intensity) {
    if (intensity === 'casual_fade') return '😤 Casual Fade'
    if (intensity === 'super_fade')  return '😤😤😤 Super Fade'
    if (intensity === 'casual_sell') return '🤝 Casual Sell Out'
    if (intensity === 'super_sell')  return '💰 Super Sell Out'
    return savedSide === 'fade' ? '😤 Fade' : '🤝 Sell Out'
  }

  function intensityColor(intensity) {
    if (intensity === 'super_fade')  return '#ff2222'
    if (intensity === 'casual_fade') return '#ff7744'
    if (intensity === 'casual_sell') return '#aaaaff'
    if (intensity === 'super_sell')  return '#ffdd44'
    return '#aaa'
  }

  async function makePick(lineOpt, intensityId) {
    setSaving(true)
    try {
      const existing = await loadHatePick()
      const updated  = { ...existing, [getTodayKey()]: {
        sport: 'MLB', sportLabel: 'MLB',
        team: lineOpt.team,
        home: todayGame.home_team,
        away: todayGame.away_team,
        odds: lineOpt.odds, market: lineOpt.market, point: lineOpt.point ?? null,
        gameId: todayGame.id,
        intensity: intensityId,
        intensitySide: side,
      }}
      await saveHatePick(updated)
      onHatePickChange?.()
      setChanging(false)
      setStep('side')
      setSide(null)
    } catch (e) {
      console.error('hatePick save failed', e)
    } finally {
      setSaving(false)
    }
  }

  async function saveNoPick() {
    setSaving(true)
    try {
      const existing = await loadHatePick()
      const updated  = { ...existing, [getTodayKey()]: { noPick: true, reason: 'not_playing' } }
      await saveHatePick(updated)
      onHatePickChange?.()
      setChanging(false)
      setStep('side')
      setSide(null)
    } catch (e) {
      console.error('hatePick noPick save failed', e)
    } finally {
      setSaving(false)
    }
  }

  async function makePickNoOdds(intensityId) {
    setSaving(true)
    try {
      const existing = await loadHatePick()
      const updated  = { ...existing, [getTodayKey()]: {
        sport: 'MLB', sportLabel: 'MLB',
        team: side === 'fade' ? opponent : teamFull,
        home: todayGame.home_team,
        away: todayGame.away_team,
        odds: null, market: null, point: null,
        gameId: todayGame.id,
        intensity: intensityId,
        intensitySide: side,
      }}
      await saveHatePick(updated)
      onHatePickChange?.()
      setChanging(false)
      setStep('side')
      setSide(null)
    } catch (e) {
      console.error('hatePick save failed', e)
    } finally {
      setSaving(false)
    }
  }

  const showPicker = !anyPick || changing
  const lineOpts   = side ? getLineOptions(side) : []
  const hasOdds    = lineOpts.length > 0

  return (
    <div style={{ background: '#111', border: `1px solid ${anyPick ? '#ff444433' : '#2a2a2a'}`, borderRadius: '12px', padding: '0.9rem 1.1rem', marginBottom: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.6rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.08em' }}>⚾ TODAY — YOUR PICK</span>
        {gameTime && <span style={{ fontSize: '0.62rem', color: '#444' }}>{gameTime}</span>}
      </div>

      {/* Matchup */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
        <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: isHome ? '#aaa' : '#ddd' }}>
          {isHome ? oppShort : teamShort}
        </span>
        <span style={{ fontSize: '0.65rem', color: '#333' }}>@</span>
        <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: isHome ? '#ddd' : '#aaa' }}>
          {isHome ? teamShort : oppShort}
        </span>
        {teamML && (
          <span style={{ fontSize: '0.65rem', marginLeft: 'auto', fontWeight: 'bold', color: teamML.price < 0 ? '#4c9be8' : '#ff9944' }}>
            {teamShort} {fmtO(teamML.price)} ML
          </span>
        )}
      </div>

      {/* Covered by lock/dog */}
      {isCovered && !hasHatePick && !changing && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.78rem', color: '#ff4444', fontWeight: 'bold' }}>
            {coverSource} · 😤 {(coveredPick.team || '').split(' ').pop()} {coveredPick?.market === 'spreads'
              ? `${coveredPick.point > 0 ? '+' : ''}${coveredPick.point} (${fmtO(coveredPick.odds)})`
              : `${fmtO(coveredPick.odds)} ML`}
            <span style={{ fontSize: '0.6rem', color: '#444', fontWeight: 'normal', marginLeft: '0.5rem' }}>covered</span>
          </div>
          <button onClick={() => { setChanging(true); setStep('side'); setSide(null) }} style={{
            fontSize: '0.6rem', padding: '0.2rem 0.5rem', background: 'transparent',
            border: '1px solid #ff444444', borderRadius: '5px', color: '#ff4444', cursor: 'pointer',
          }}>add hate pick</button>
        </div>
      )}

      {/* No Pick Today — skipped */}
      {isNoPick && !changing && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.78rem', color: '#444', fontStyle: 'italic' }}>
            🚫 No pick today — {teamShort} not in play
          </div>
          <button onClick={() => { setChanging(true); setStep('side'); setSide(null) }} style={{
            fontSize: '0.6rem', padding: '0.2rem 0.5rem', background: 'transparent',
            border: '1px solid #222', borderRadius: '5px', color: '#444', cursor: 'pointer',
          }}>change</button>
        </div>
      )}

      {/* Saved pick summary */}
      {hasHatePick && !changing && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isCovered && (
              <div style={{ fontSize: '0.58rem', color: '#333', marginBottom: '0.25rem' }}>
                {coverSource} covered · your hate pick:
              </div>
            )}
            <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: intensityColor(savedIntensity) }}>
              {intensityLabel(savedIntensity)}
              {todayHatePick?.odds != null
                ? ` · ${(todayHatePick.team || '').split(' ').pop()} ${todayHatePick?.market === 'spreads'
                    ? `${todayHatePick.point > 0 ? '+' : ''}${todayHatePick.point} (${fmtO(todayHatePick.odds)})`
                    : `${fmtO(todayHatePick.odds)} ML`}`
                : ' — no odds yet'}
            </div>
          </div>
          <button onClick={() => { setChanging(true); setStep('side'); setSide(null) }} style={{
            fontSize: '0.6rem', padding: '0.2rem 0.5rem', background: 'transparent',
            border: '1px solid #222', borderRadius: '5px', color: '#444', cursor: 'pointer',
          }}>change</button>
        </div>
      )}

      {/* Pick flow */}
      {showPicker && (
        <div>

          {/* Step 1: Fade or Sell Out */}
          {step === 'side' && (
            <div>
              <div style={{ fontSize: '0.6rem', color: '#444', letterSpacing: '0.07em', marginBottom: '0.55rem' }}>
                {teamShort.toUpperCase()} IS PLAYING — WHAT'S YOUR MOVE?
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => { setSide('fade'); setStep('line') }} style={{
                  flex: 1, padding: '0.7rem 0.5rem', borderRadius: '8px', cursor: 'pointer',
                  background: '#1a0000', border: '1px solid #ff444455',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#ff4444'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#ff444455'}
                >
                  <span style={{ fontSize: '1.1rem' }}>😤</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#ff4444' }}>Fade</span>
                  <span style={{ fontSize: '0.6rem', color: '#555' }}>bet against {teamShort}</span>
                </button>
                <button onClick={() => { setSide('sell'); setStep('line') }} style={{
                  flex: 1, padding: '0.7rem 0.5rem', borderRadius: '8px', cursor: 'pointer',
                  background: '#0a0a1a', border: '1px solid #aaaaff55',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#aaaaff'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#aaaaff55'}
                >
                  <span style={{ fontSize: '1.1rem' }}>🤝</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#aaaaff' }}>Sell Out</span>
                  <span style={{ fontSize: '0.6rem', color: '#555' }}>ride with {teamShort}</span>
                </button>
              </div>
              <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => setStep('nopick_confirm')} style={{
                  fontSize: '0.62rem', padding: '0.3rem 0.6rem', background: 'transparent',
                  border: '1px solid #1e1e1e', borderRadius: '5px', color: '#333', cursor: 'pointer',
                }}>🚫 No pick today</button>
                {changing && (
                  <button onClick={() => { setChanging(false); setStep('side'); setSide(null) }} style={{
                    fontSize: '0.6rem', padding: '0.2rem 0.5rem',
                    background: 'transparent', border: '1px solid #1a1a1a', borderRadius: '5px', color: '#333', cursor: 'pointer',
                  }}>cancel</button>
                )}
              </div>
            </div>
          )}

          {/* Step: No Pick Confirmation */}
          {step === 'nopick_confirm' && (
            <div style={{ background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#aaa', fontWeight: 'bold', marginBottom: '0.4rem' }}>
                🚫 Skip today's pick?
              </div>
              <div style={{ fontSize: '0.65rem', color: '#555', marginBottom: '0.8rem', lineHeight: 1.5 }}>
                Mark <span style={{ color: '#888' }}>{teamShort}</span> as not in play today. This won't count against your stats.
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={saveNoPick} disabled={saving} style={{
                  flex: 1, padding: '0.55rem 0.5rem', borderRadius: '7px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  background: '#1a1a1a', border: '1px solid #333',
                  color: '#888', fontSize: '0.75rem', fontWeight: 'bold',
                }}>
                  {saving ? 'Saving...' : 'Yes, skip today'}
                </button>
                <button onClick={() => setStep('side')} style={{
                  flex: 1, padding: '0.55rem 0.5rem', borderRadius: '7px', cursor: 'pointer',
                  background: 'transparent', border: '1px solid #1e1e1e',
                  color: '#444', fontSize: '0.72rem',
                }}>
                  ← Go back
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Pick the line — casual (lower odds) or super (higher odds) */}
          {step === 'line' && side && (
            <div>
              <div style={{ fontSize: '0.6rem', color: '#444', letterSpacing: '0.07em', marginBottom: '0.55rem' }}>
                <span style={{ color: side === 'fade' ? '#ff4444' : '#aaaaff' }}>
                  {side === 'fade' ? '😤 FADE' : '🤝 SELL OUT'}
                </span>
                {hasOdds
                  ? <span style={{ color: '#333' }}> — CASUAL (safer) OR SUPER (bigger line)?</span>
                  : <span style={{ color: '#333' }}> — NO ODDS YET, PICK YOUR INTENSITY</span>
                }
              </div>

              {hasOdds ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {lineOpts.map((opt, i) => {
                    const isCasual  = i === 0
                    const label     = isCasual
                      ? (side === 'fade' ? '😤 Casual Fade' : '🤝 Casual Sell Out')
                      : (side === 'fade' ? '😤😤😤 Super Fade' : '💰 Super Sell Out')
                    const intensityId = isCasual
                      ? (side === 'fade' ? 'casual_fade' : 'casual_sell')
                      : (side === 'fade' ? 'super_fade'  : 'super_sell')
                    const color = isCasual
                      ? (side === 'fade' ? '#ff7744' : '#aaaaff')
                      : (side === 'fade' ? '#ff2222' : '#ffdd44')
                    return (
                      <button key={i} onClick={() => makePick(opt, intensityId)} disabled={saving} style={{
                        flex: 1, padding: '0.65rem 0.5rem', borderRadius: '8px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        background: '#0f0f0f', border: `1px solid ${color}55`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = color}
                      onMouseLeave={e => e.currentTarget.style.borderColor = `${color}55`}
                      >
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color }}>{label}</span>
                        <span style={{ fontSize: '0.78rem', color: '#ddd', fontWeight: 'bold' }}>{opt.label}</span>
                        <span style={{ fontSize: '0.7rem', color: opt.odds < 0 ? '#4c9be8' : '#ff9944', fontWeight: 'bold' }}>{fmtO(opt.odds)}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                /* No odds — just save intensity */
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['casual', 'super']).map(lvl => {
                    const intensityId = `${lvl}_${side}`
                    const label = lvl === 'casual'
                      ? (side === 'fade' ? '😤 Casual Fade' : '🤝 Casual Sell Out')
                      : (side === 'fade' ? '😤😤😤 Super Fade' : '💰 Super Sell Out')
                    const color = lvl === 'casual'
                      ? (side === 'fade' ? '#ff7744' : '#aaaaff')
                      : (side === 'fade' ? '#ff2222' : '#ffdd44')
                    return (
                      <button key={lvl} onClick={() => makePickNoOdds(intensityId)} disabled={saving} style={{
                        flex: 1, padding: '0.65rem 0.5rem', borderRadius: '8px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        background: '#0f0f0f', border: `1px solid ${color}55`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = color}
                      onMouseLeave={e => e.currentTarget.style.borderColor = `${color}55`}
                      >
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color }}>{label}</span>
                        <span style={{ fontSize: '0.62rem', color: '#333' }}>no odds yet</span>
                      </button>
                    )
                  })}
                </div>
              )}

              <button onClick={() => { setStep('side'); setSide(null) }} style={{
                marginTop: '0.5rem', fontSize: '0.6rem', padding: '0.2rem 0.5rem',
                background: 'transparent', border: '1px solid #1a1a1a', borderRadius: '5px', color: '#333', cursor: 'pointer',
              }}>← back</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function HateWatchTab({ allGames, todayLock, todayDog, todayHatePick, onHatePickChange, onTeamChange }) {
  const [hateTeam, setHateTeam] = useState('')
  const [picking, setPicking]   = useState(true)
  const [saveData, setSaveData] = useState(null)

  useEffect(() => {
    fetch(`${SERVER}/data`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setSaveData(d))
      .catch(() => {})
  }, [])

  // Load team preference from DB prefs on mount
  useEffect(() => {
    loadPrefs().then(prefs => {
      const saved = prefs['hateTeam_MLB']
      if (saved) {
        setHateTeam(saved)
        setPicking(false)
      }
    }).catch(() => {})
  }, [])

  function selectTeam(team) {
    setHateTeam(team)
    setPicking(false)
    loadPrefs().then(prefs => savePrefs({ ...prefs, 'hateTeam_MLB': team }))
    onTeamChange?.()
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

    // Spread wins count 1.5×, spread losses count 1× — taking the spread is harder
    function rate(picks) {
      const resolved = picks.filter(p => p.result === 'W' || p.result === 'L')
      const wins     = resolved.filter(p => p.result === 'W').length
      const losses   = resolved.length - wins
      // Weighted win rate: spread wins get 1.5× weight
      let wWins = 0, wTotal = 0
      resolved.forEach(p => {
        const isSpread = p.market === 'spreads' && p.point != null
        const w = isSpread ? 1.5 : 1
        if (p.result === 'W') wWins += w
        wTotal += w
      })
      const spreadWins = resolved.filter(p => p.result === 'W' && p.market === 'spreads').length
      return {
        wins, losses, total: resolved.length,
        spreadWins,
        pct: resolved.length ? Math.round(wins / resolved.length * 100) : null,
        weightedPct: wTotal > 0 ? Math.round(wWins / wTotal * 100) : null,
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
          todayHatePick={todayHatePick}
          todayLock={todayLock}
          todayDog={todayDog}
          onHatePickChange={onHatePickChange}
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
          <HateEdgeMeter fadeRate={a.fadeRate.weightedPct ?? a.fadeRate.pct} overallRate={a.overallRate.pct} fadedCount={a.fadedCount} spreadWins={a.fadeRate.spreadWins} />

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