import React, { useState, useEffect, useMemo } from 'react'
import { loadPrefs, savePrefs, loadFavPick, saveFavPick, SERVER } from '../hooks/useSaveData.js'
import { getTodayKey, getGameDateLabel } from '../utils/odds.js'
import DHBadge from '../components/DHBadge.jsx'
// STEP MARKER: step 3/6 in progress — file 3 of 5 (FavsTab.jsx) done.
// Next: HateWatchTab.jsx, checkbetonme.sh.

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

// ── Shared slider renderer ────────────────────────────────────────────────────
function SliderMeter({ title, label, labelColor, sub, pos, gradientLeft, gradientRight, leftText, rightText }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
        <span style={{ fontSize: '0.62rem', color: '#444', letterSpacing: '0.07em' }}>{title}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: labelColor }}>{label}</span>
      </div>
      <div style={{ position: 'relative', height: '8px', background: '#111', borderRadius: '4px', border: '1px solid #222' }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '4px',
          background: `linear-gradient(to right, ${gradientLeft}, #333 50%, ${gradientRight})`,
          opacity: 0.22,
        }} />
        <div style={{ position: 'absolute', left: '50%', top: '-2px', width: '1px', height: '12px', background: '#2a2a2a' }} />
        <div style={{
          position: 'absolute', top: '-3px', width: '14px', height: '14px',
          background: labelColor, borderRadius: '50%', border: '2px solid #111',
          left: `calc(${pos}% - 7px)`, transition: 'left 0.4s ease',
          boxShadow: `0 0 6px ${labelColor}88`,
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem' }}>
        <span style={{ fontSize: '0.58rem', color: '#333' }}>{leftText}</span>
        <span style={{ fontSize: '0.58rem', color: '#444' }}>{sub}</span>
        <span style={{ fontSize: '0.58rem', color: '#333' }}>{rightText}</span>
      </div>
    </div>
  )
}

// ── Bias Meter — how often you ride your fav vs go against them ───────────────
// Left = objective (you fade your own team sometimes), Right = pure bias (always ride)
function BiasMeter({ gutPct }) {
  if (gutPct === null) return null
  const pct = Math.round(gutPct)
  const pos = Math.max(2, Math.min(98, pct))
  const { label, color, sub } =
    pct > 80 ? { label: 'PURE BIAS',    color: '#ff4444', sub: 'You never go against your gut' } :
    pct > 65 ? { label: 'BIASED',       color: '#ff9944', sub: 'Feelings over data' } :
    pct > 40 ? { label: 'BALANCED',     color: '#00ff88', sub: "You're making calls, not just riding" } :
    pct > 20 ? { label: 'CONTRARIAN',   color: '#8888ff', sub: 'You fade your own instincts' } :
               { label: 'FULL FADE',    color: '#aaaaff', sub: 'You never trust your gut at all' }
  return (
    <SliderMeter
      title="BIAS METER"
      label={label} labelColor={color} sub={sub}
      pos={pos}
      gradientLeft="#00ff88" gradientRight="#ff4444"
      leftText="Objective" rightText="Pure bias"
    />
  )
}

// ── Sharpness Meter — odds-adjusted edge on your gut picks vs baseline ────────
// Left = losing money on these picks, Right = beating the market
function SharpnessMeter({ picks, overallPct, minPicks = 3 }) {
  const resolved = picks.filter(p => (p.result === 'W' || p.result === 'L') && p.odds != null)
  if (resolved.length < minPicks || overallPct === null) {
    return (
      <div style={{ marginBottom: '1.25rem', padding: '0.7rem 1rem', background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: '8px' }}>
        <div style={{ fontSize: '0.62rem', color: '#444', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>SHARPNESS METER</div>
        <div style={{ fontSize: '0.72rem', color: '#333' }}>Need at least {minPicks} resolved picks with odds to measure sharpness.</div>
      </div>
    )
  }
  // Odds-adjusted edge: for each pick, did you beat implied probability?
  // impliedProb = odds < 0 ? (-odds)/(-odds+100) : 100/(odds+100)
  const edgeScores = resolved.map(p => {
    const imp = p.odds < 0 ? (-p.odds) / (-p.odds + 100) : 100 / (p.odds + 100)
    const outcome = p.result === 'W' ? 1 : 0
    return outcome - imp  // positive = beat the market, negative = lost to it
  })
  const avgEdge = edgeScores.reduce((s, e) => s + e, 0) / edgeScores.length
  const edgePct = Math.round(avgEdge * 100)

  // Needle: map -30 to +30 edge range onto 2–98 slider
  const pos = Math.max(2, Math.min(98, 50 + edgePct * 1.6))
  const { label, color, sub } =
    edgePct > 15  ? { label: 'SHARP',          color: '#00ff88', sub: 'Your instinct is finding real value' } :
    edgePct > 5   ? { label: 'SLIGHT EDGE',    color: '#ffaa44', sub: 'Beating baseline, keep it up' } :
    edgePct > -5  ? { label: 'BREAK EVEN',     color: '#aaa',    sub: 'No edge yet, could go either way' } :
    edgePct > -15 ? { label: 'LOSING EDGE',    color: '#ff9944', sub: 'Your bias is costing you' } :
                    { label: 'GETTING PLAYED', color: '#ff4444', sub: 'The market knows more than your gut' }
  return (
    <SliderMeter
      title="SHARPNESS METER"
      label={label} labelColor={color} sub={`${edgePct > 0 ? '+' : ''}${edgePct}% vs market · ${resolved.length} picks`}
      pos={pos}
      gradientLeft="#ff4444" gradientRight="#00ff88"
      leftText="Losing edge" rightText="Sharp"
    />
  )
}

// ── Main Tab ──────────────────────────────────────────────────────────────────


// ── Today's Game Card — owns favPick slot ─────────────────────────────────────
function TodayGameCard({ team, allGames, todayFavPick, todayLock, todayDog, onFavPickChange, doubleheaderIds = new Set() }) {
  const [step, setStep]       = useState('side')   // 'side' | 'line' | 'nopick_confirm'
  const [side, setSide]       = useState(null)      // 'ride' | 'fade'
  const [picking, setPicking] = useState(false)
  const [saving, setSaving]   = useState(false)

  function resetFlow() { setStep('side'); setSide(null) }

  function nameMatches(a, b) {
    if (!a || !b) return false
    const al = a.toLowerCase(), bl = b.toLowerCase()
    if (al === bl) return true
    if (al.split(' ').pop() === bl.split(' ').pop()) return true
    return al.includes(bl) || bl.includes(al)
  }

  function fmtO(price) {
    if (price == null) return null
    const n = Math.round(price)
    return n > 0 ? `+${n}` : `${n}`
  }

  // Check if lock or dog already covers this team
  const last = team.toLowerCase().split(' ').pop()
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

  if (!todayGame) {
    const nextGame = allGames
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

    const teamShort = team.split(' ').pop()
    const isNoPick  = !!todayFavPick?.noPick

    async function saveNoPickEarly() {
      setSaving(true)
      try {
        const existing = await loadFavPick()
        const updated  = { ...existing, [getTodayKey()]: { noPick: true, reason: 'not_playing' } }
        await saveFavPick(updated)
        onFavPickChange?.()
        setNoPickConfirm(false)
      } catch (e) { console.error(e) }
      finally { setSaving(false) }
    }

    if (!nextGame) return (
      <div style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '0.9rem 1.1rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.62rem', color: '#444' }}>⚾ No upcoming MLB games found for {teamShort}</div>
      </div>
    )

    const nextIsHome   = (nextGame.home_team || '').toLowerCase().includes(last)
    const nextOpponent = nextIsHome ? nextGame.away_team : nextGame.home_team
    const nextOppShort = (nextOpponent || '').split(' ').pop()
    const dateLabel    = getGameDateLabel(nextGame.commence_time)

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
        {isNoPick && !noPickConfirm && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#444', fontStyle: 'italic' }}>🚫 No pick today — marked as off day</span>
            <button onClick={() => setNoPickConfirm(true)} style={{
              fontSize: '0.6rem', padding: '0.2rem 0.5rem', background: 'transparent',
              border: '1px solid #222', borderRadius: '5px', color: '#444', cursor: 'pointer',
            }}>undo</button>
          </div>
        )}

        {/* No Pick confirm dialog */}
        {noPickConfirm && (
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
              <button onClick={() => setNoPickConfirm(false)} style={{
                flex: 1, padding: '0.5rem', borderRadius: '6px', cursor: 'pointer',
                background: 'transparent', border: '1px solid #1e1e1e', color: '#444', fontSize: '0.7rem',
              }}>← Go back</button>
            </div>
          </div>
        )}

        {/* No Pick button — only show if no pick set yet */}
        {!isNoPick && !noPickConfirm && (
          <button onClick={() => setNoPickConfirm(true)} style={{
            fontSize: '0.62rem', padding: '0.3rem 0.6rem', background: 'transparent',
            border: '1px solid #1e1e1e', borderRadius: '5px', color: '#333', cursor: 'pointer',
          }}>🚫 No pick today</button>
        )}
      </div>
    )
  }

  const isHome   = (todayGame.home_team || '').toLowerCase().includes(last)
  const teamFull = isHome ? todayGame.home_team : todayGame.away_team
  const opponent = isHome ? todayGame.away_team : todayGame.home_team
  const teamShort = teamFull.split(' ').pop()
  const oppShort  = opponent.split(' ').pop()

  const gameTime = todayGame.commence_time
    ? new Date(todayGame.commence_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  const bm         = todayGame.bookmakers?.[0]
  const mlMarket   = bm?.markets?.find(m => m.key === 'h2h')
  const spMarket   = bm?.markets?.find(m => m.key === 'spreads')
  const teamML     = mlMarket?.outcomes?.find(o => nameMatches(o.name, teamFull))
  const teamSpread = spMarket?.outcomes?.find(o => nameMatches(o.name, teamFull))

  const oppML     = mlMarket?.outcomes?.find(o => !nameMatches(o.name, teamFull))
  const oppSpread = spMarket?.outcomes?.find(o => !nameMatches(o.name, teamFull))

  const hasFavPick   = !!todayFavPick && !todayFavPick.noPick
  const isNoPick     = !!todayFavPick?.noPick
  const isCovered    = !!coveredPick
  const displayPick  = coveredPick || todayFavPick
  const isSpread     = displayPick?.market === 'spreads'
  const savedSide    = todayFavPick?.favSide   // 'ride' | 'fade'
  const anyPick      = isCovered || hasFavPick || isNoPick

  async function saveNoPick() {
    setSaving(true)
    try {
      const existing = await loadFavPick()
      const updated  = { ...existing, [getTodayKey()]: { noPick: true, reason: 'not_playing' } }
      await saveFavPick(updated)
      onFavPickChange?.()
      setNoPickConfirm(false)
      setPicking(false)
    } catch (e) {
      console.error('favPick noPick save failed', e)
    } finally {
      setSaving(false)
    }
  }

  async function makePick(pickedTeam, market, odds, point, favSide) {
    setSaving(true)
    try {
      const existing = await loadFavPick()
      const updated  = { ...existing, [getTodayKey()]: {
        sport: 'MLB', sportLabel: 'MLB',
        team: pickedTeam,
        home: todayGame.home_team,
        away: todayGame.away_team,
        odds, market, point: point ?? null,
        gameId: todayGame.id,
        favSide,  // 'ride' | 'fade' — tracks whether this was a fav pick or a fade
      }}
      await saveFavPick(updated)
      onFavPickChange?.()
      setPicking(false)
      resetFlow()
    } catch (e) {
      console.error('favPick save failed', e)
    } finally {
      setSaving(false)
    }
  }

  // Card border: green for ride, red for fade, neutral otherwise
  const cardBorder = anyPick
    ? (savedSide === 'fade' ? '#ff444433' : '#00ff8833')
    : '#2a2a2a'

  return (
    <div style={{ background: '#111', border: `1px solid ${cardBorder}`, borderRadius: '12px', padding: '0.9rem 1.1rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.6rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.08em' }}>⚾ TODAY — YOUR PICK</span>
        {gameTime && <span style={{ fontSize: '0.62rem', color: '#444' }}>{gameTime}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.7rem' }}>
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
        <DHBadge show={doubleheaderIds.has(todayGame?.id)} size="sm" />
      </div>

      {/* Covered by lock or dog */}
      {isCovered && !picking && (
        <div style={{ fontSize: '0.78rem', color: '#00ff88', fontWeight: 'bold' }}>
          {coverSource} · ⭐ {teamShort} {isSpread
            ? `${displayPick.point > 0 ? '+' : ''}${displayPick.point} (${fmtO(displayPick.odds)})`
            : `${fmtO(displayPick.odds)} ML`}
          <span style={{ fontSize: '0.6rem', color: '#444', fontWeight: 'normal', marginLeft: '0.5rem' }}>covered</span>
        </div>
      )}

      {/* No Pick Today */}
      {isNoPick && !picking && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.78rem', color: '#444', fontStyle: 'italic' }}>
            🚫 No pick today — {teamShort} not in play
          </div>
          <button onClick={() => { setPicking(true); resetFlow() }} style={{
            fontSize: '0.6rem', padding: '0.2rem 0.5rem', background: 'transparent',
            border: '1px solid #222', borderRadius: '5px', color: '#444', cursor: 'pointer',
          }}>change</button>
        </div>
      )}

      {/* Saved pick summary */}
      {!isCovered && hasFavPick && !picking && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: savedSide === 'fade' ? '#ff4444' : '#00ff88' }}>
            {savedSide === 'fade' ? '😤' : '⭐'} {(displayPick.team || '').split(' ').pop()} {isSpread
              ? `${displayPick.point > 0 ? '+' : ''}${displayPick.point} (${fmtO(displayPick.odds)})`
              : `${fmtO(displayPick.odds)} ML`}
            <span style={{ fontSize: '0.62rem', color: '#444', fontWeight: 'normal', marginLeft: '0.4rem' }}>
              {savedSide === 'fade' ? '— fading your fav' : '— riding your fav'}
            </span>
          </div>
          <button onClick={() => { setPicking(true); resetFlow() }} style={{
            fontSize: '0.6rem', padding: '0.2rem 0.5rem', background: 'transparent',
            border: '1px solid #222', borderRadius: '5px', color: '#444', cursor: 'pointer',
          }}>change</button>
        </div>
      )}

      {/* Pick flow */}
      {(!anyPick || picking) && !isCovered && (
        <div>

          {/* Step 1: Ride or Fade */}
          {step === 'side' && (
            <div>
              <div style={{ fontSize: '0.6rem', color: '#444', letterSpacing: '0.07em', marginBottom: '0.55rem' }}>
                {teamShort.toUpperCase()} IS PLAYING — WHAT'S YOUR MOVE?
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button onClick={() => { setSide('ride'); setStep('line') }} style={{
                  flex: 1, padding: '0.7rem 0.5rem', borderRadius: '8px', cursor: 'pointer',
                  background: '#0a1a0a', border: '1px solid #00ff8855',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#00ff88'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#00ff8855'}
                >
                  <span style={{ fontSize: '1.1rem' }}>⭐</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#00ff88' }}>Ride</span>
                  <span style={{ fontSize: '0.6rem', color: '#555' }}>back {teamShort}</span>
                </button>
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
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => setStep('nopick_confirm')} style={{
                  fontSize: '0.62rem', padding: '0.3rem 0.6rem', background: 'transparent',
                  border: '1px solid #1e1e1e', borderRadius: '5px', color: '#333', cursor: 'pointer',
                }}>🚫 No pick today</button>
                {picking && (
                  <button onClick={() => { setPicking(false); resetFlow() }} style={{
                    fontSize: '0.6rem', padding: '0.2rem 0.5rem', background: 'transparent',
                    border: '1px solid #1a1a1a', borderRadius: '5px', color: '#333', cursor: 'pointer',
                  }}>cancel</button>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Pick the line */}
          {step === 'line' && side && (
            <div>
              <div style={{ fontSize: '0.6rem', color: '#444', letterSpacing: '0.07em', marginBottom: '0.55rem' }}>
                <span style={{ color: side === 'ride' ? '#00ff88' : '#ff4444' }}>
                  {side === 'ride' ? '⭐ RIDE' : '😤 FADE'}
                </span>
                <span style={{ color: '#333' }}> — ML OR SPREAD?</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {side === 'ride' ? (
                  <>
                    {teamML && (
                      <button onClick={() => makePick(teamFull, 'h2h', teamML.price, null, 'ride')} disabled={saving} style={{
                        padding: '0.55rem 0.9rem', borderRadius: '7px', cursor: saving ? 'not-allowed' : 'pointer',
                        background: '#0a1a0a', border: '1px solid #00ff8866',
                        color: '#00ff88', fontSize: '0.8rem', fontWeight: 'bold',
                      }}>
                        {teamShort} ML {fmtO(teamML.price)}
                      </button>
                    )}
                    {teamSpread && (
                      <button onClick={() => makePick(teamFull, 'spreads', teamSpread.price, teamSpread.point, 'ride')} disabled={saving} style={{
                        padding: '0.55rem 0.9rem', borderRadius: '7px', cursor: saving ? 'not-allowed' : 'pointer',
                        background: '#0a1a0a', border: '1px solid #00ff8844',
                        color: '#00ff88', fontSize: '0.8rem', fontWeight: 'bold',
                      }}>
                        {teamShort} {teamSpread.point > 0 ? '+' : ''}{teamSpread.point} ({fmtO(teamSpread.price)})
                      </button>
                    )}
                    {!teamML && !teamSpread && (
                      <div style={{ fontSize: '0.72rem', color: '#333' }}>No odds available yet</div>
                    )}
                  </>
                ) : (
                  <>
                    {oppML && (
                      <button onClick={() => makePick(opponent, 'h2h', oppML.price, null, 'fade')} disabled={saving} style={{
                        padding: '0.55rem 0.9rem', borderRadius: '7px', cursor: saving ? 'not-allowed' : 'pointer',
                        background: '#1a0000', border: '1px solid #ff444466',
                        color: '#ff4444', fontSize: '0.8rem', fontWeight: 'bold',
                      }}>
                        {oppShort} ML {fmtO(oppML.price)}
                      </button>
                    )}
                    {oppSpread && (
                      <button onClick={() => makePick(opponent, 'spreads', oppSpread.price, oppSpread.point, 'fade')} disabled={saving} style={{
                        padding: '0.55rem 0.9rem', borderRadius: '7px', cursor: saving ? 'not-allowed' : 'pointer',
                        background: '#1a0000', border: '1px solid #ff444444',
                        color: '#ff4444', fontSize: '0.8rem', fontWeight: 'bold',
                      }}>
                        {oppShort} {oppSpread.point > 0 ? '+' : ''}{oppSpread.point} ({fmtO(oppSpread.price)})
                      </button>
                    )}
                    {!oppML && !oppSpread && (
                      <div style={{ fontSize: '0.72rem', color: '#333' }}>No odds available yet</div>
                    )}
                  </>
                )}
              </div>
              <button onClick={() => setStep('side')} style={{
                marginTop: '0.5rem', fontSize: '0.6rem', padding: '0.2rem 0.5rem',
                background: 'transparent', border: '1px solid #1a1a1a', borderRadius: '5px', color: '#333', cursor: 'pointer',
              }}>← back</button>
            </div>
          )}

          {/* No Pick Confirmation */}
          {step === 'nopick_confirm' && (
            <div style={{ background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#aaa', fontWeight: 'bold', marginBottom: '0.4rem' }}>
                🚫 Skip today's pick?
              </div>
              <div style={{ fontSize: '0.65rem', color: '#555', marginBottom: '0.8rem', lineHeight: 1.5 }}>
                Mark <span style={{ color: '#888' }}>{teamShort}</span> as not in play today. Won't count against your stats.
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

        </div>
      )}
    </div>
  )
}



export default function FavsTab({ allGames, todayLock, todayDog, todayFavPick, onFavPickChange, onTeamChange, doubleheaderIds = new Set() }) {
  const [favTeam, setFavTeam] = useState('')
  const [picking, setPicking] = useState(true)
  const [saveData, setSaveData] = useState(null)

  useEffect(() => {
    // Hydrate favTeam from server prefs (DB is authoritative)
    loadPrefs().then(prefs => {
      if (prefs?.favTeam_MLB) {
        setFavTeam(prefs.favTeam_MLB)
        setPicking(false)
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
    onTeamChange?.()
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

    // From favPick (FavsTab ride/fade picks) — favSide is authoritative
    Object.entries(saveData.favPick || {}).forEach(([date, pick]) => {
      if (!pick || pick.noPick || pick.sport !== 'MLB') return
      const involved = teamMatches(pick.home, favTeam) || teamMatches(pick.away, favTeam)
      // If favSide is set, use it directly. Otherwise fall back to team match.
      const pickedThem = pick.favSide ? pick.favSide === 'ride' : teamMatches(pick.team, favTeam)
      allPicks.push({ date, ...pick, involved, pickedThem, source: 'fav' })
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

    // Bias: of all games fav team was involved, % of time you picked them (all picks, not just resolved)
    const biasScore = favInvolved.length
      ? (favPicked.length / favInvolved.length) * 100
      : null

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
      sharpnessPicks: favPicked,  // picks where you rode your fav — used for sharpness meter
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
          doubleheaderIds={doubleheaderIds}
          allGames={allGames}
          todayFavPick={todayFavPick}
          todayLock={todayLock}
          todayDog={todayDog}
          onFavPickChange={onFavPickChange}
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
          {/* Bias meter + Sharpness meter */}
          <BiasMeter gutPct={a.biasScore} />
          <SharpnessMeter picks={a.sharpnessPicks} overallPct={a.overallRate.pct} />

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

          {/* Verdict */}
          {(() => {
            const biased = a.biasScore !== null && a.biasScore > 65
            const balanced = a.biasScore !== null && a.biasScore >= 40 && a.biasScore <= 65
            const resolvedWithOdds = a.sharpnessPicks.filter(p => (p.result === 'W' || p.result === 'L') && p.odds != null)
            let sharp = null
            if (resolvedWithOdds.length >= 3 && a.overallRate.pct !== null) {
              const edgeScores = resolvedWithOdds.map(p => {
                const imp = p.odds < 0 ? (-p.odds) / (-p.odds + 100) : 100 / (p.odds + 100)
                return (p.result === 'W' ? 1 : 0) - imp
              })
              sharp = Math.round(edgeScores.reduce((s, e) => s + e, 0) / edgeScores.length * 100) > 5
            }
            let verdict, vcolor, vsub
            if (biased && sharp === true) {
              verdict = 'Riding Right'; vcolor = '#00ff88'; vsub = 'Pure loyalty but your fav picks are actually hitting'
            } else if (biased && sharp === false) {
              verdict = 'Homer Bet'; vcolor = '#ff4444'; vsub = 'Heart over head — the market is punishing you'
            } else if (biased && sharp === null) {
              verdict = 'Ride or Die'; vcolor = '#ff9944'; vsub = 'You always back them — need more data to see if it pays'
            } else if (balanced && sharp === true) {
              verdict = 'Sharp Fan'; vcolor = '#00ff88'; vsub = 'Objective reads + solid results — this is how you win'
            } else if (balanced && sharp === false) {
              verdict = 'Trying to Be Smart'; vcolor = '#ffaa44'; vsub = "Balanced approach but the picks aren't landing yet"
            } else if (balanced) {
              verdict = 'Even Keel'; vcolor = '#aaa'; vsub = 'Reading the game, not just the fandom — build more data'
            } else {
              verdict = sharp === true ? 'Contrarian Edge' : 'Against Your Own Team'
              vcolor  = sharp === true ? '#8888ff' : '#555'
              vsub    = sharp === true ? 'You fade your own fav and it pays — ruthless' : "You barely back them — are they even your fav?"
            }
            return (
              <div style={{ background: '#111', border: `1px solid ${vcolor}33`, borderRadius: '10px', padding: '0.85rem 1.1rem', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.62rem', color: '#444', letterSpacing: '0.07em', marginBottom: '0.3rem' }}>VERDICT</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: vcolor }}>{verdict}</span>
                  <span style={{ fontSize: '0.72rem', color: '#555' }}>{vsub}</span>
                </div>
              </div>
            )
          })()}

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