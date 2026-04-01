import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatOdds, getSportsInSeason, getGameDateLabel } from '../utils/odds.js'
import { getTeamLogoUrl, LOGO_STYLE } from '../utils/teamLogos.js'

function getGameStatus(game) {
  const status = game.espnStatus
  if (!status) return null
  const state = status.type?.state
  const completed = status.type?.completed
  if (completed || state === 'post') {
    const s = game.espnScores
    const scoreLabel = s ? `${game.away_team.split(' ').pop()} ${s.away} \u2013 ${game.home_team.split(' ').pop()} ${s.home}` : ''
    return { state: 'post', label: scoreLabel ? `Final \u00b7 ${scoreLabel}` : 'Final' }
  }
  if (state === 'in') {
    const clock = status.displayClock
    const period = status.period
    const sport = game.sportLabel
    let periodLabel = period ? `P${period}` : ''
    if (sport === 'NBA') periodLabel = period ? `Q${period}` : ''
    if (sport === 'MLB') periodLabel = period ? `Inn ${period}` : ''
    const s = game.espnScores
    const scoreLabel = s ? `${game.away_team.split(' ').pop()} ${s.away} \u2013 ${game.home_team.split(' ').pop()} ${s.home}` : null
    const timePart = [periodLabel, clock].filter(Boolean).join(' ')
    return { state: 'in', label: [timePart, scoreLabel].filter(Boolean).join(' \u00b7 ') || 'In Progress' }
  }
  return { state: 'pre', label: null }
}

const SPORT_TABS = ['ALL', 'NBA', 'MLB', 'NFL']
const SPORT_COLORS = { NBA: '#c89b3c', MLB: '#4c9be8', NFL: '#7ac96f', ALL: '#00ff88' }

function FinalGamesSection({ games, renderGame }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0.5rem',
      }}>
        <span style={{ fontSize: '0.65rem', color: '#444', fontWeight: 'bold', letterSpacing: '0.08em' }}>
          {'✓'} FINAL {'·'} {games.length} game{games.length !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: '0.6rem', color: '#333' }}>{open ? '\u25b2' : '\u25bc'}</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {games.map(g => renderGame(g))}
        </div>
      )}
    </div>
  )
}

function FinalsCard({ game }) {
  const aS = Number(game.espnScores?.away)
  const hS = Number(game.espnScores?.home)
  const awayWon = aS > hS
  const homeWon = hS > aS
  const sportColor = SPORT_COLORS[game.sportLabel] || '#555'
  const isMlb = game.sportLabel === 'MLB'

  return (
    <div style={{
      background: '#0e0e0e',
      border: '1px solid #1c1c1c',
      borderRadius: '14px',
      overflow: 'hidden',
    }}>
      {/* sport + time bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.45rem 1rem',
        background: '#131313',
        borderBottom: '1px solid #1c1c1c',
      }}>
        <span style={{ fontSize: '0.6rem', fontWeight: 'bold', letterSpacing: '0.1em', color: sportColor }}>
          {game.sportLabel}
        </span>
        <span style={{ fontSize: '0.6rem', color: '#333' }}>|</span>
        <span style={{ fontSize: '0.6rem', color: '#555', letterSpacing: '0.05em' }}>
          FINAL · {new Date(game.commence_time).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {new Date(game.commence_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* away row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.65rem 1rem 0.35rem',
        opacity: awayWon ? 1 : 0.45,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {awayWon && <span style={{ fontSize: '0.55rem', color: '#00cc66', fontWeight: 'bold', letterSpacing: '0.08em' }}>W</span>}
          {getTeamLogoUrl(game.away_team, game.sportLabel) && (
            <img src={getTeamLogoUrl(game.away_team, game.sportLabel)} style={{ ...LOGO_STYLE, width: '22px', height: '22px', opacity: awayWon ? 1 : 0.4 }} alt="" />
          )}
          <span style={{ fontSize: '0.92rem', fontWeight: awayWon ? '700' : '400', color: awayWon ? '#fff' : '#666' }}>
            {game.away_team}
          </span>
        </div>
        <span style={{
          fontSize: '1.4rem', fontWeight: '700', fontFamily: 'monospace',
          color: awayWon ? '#fff' : '#444',
          minWidth: '2.5rem', textAlign: 'right',
        }}>{isNaN(aS) ? '—' : aS}</span>
      </div>

      {/* home row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.35rem 1rem 0.65rem',
        opacity: homeWon ? 1 : 0.45,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {homeWon && <span style={{ fontSize: '0.55rem', color: '#00cc66', fontWeight: 'bold', letterSpacing: '0.08em' }}>W</span>}
          {getTeamLogoUrl(game.home_team, game.sportLabel) && (
            <img src={getTeamLogoUrl(game.home_team, game.sportLabel)} style={{ ...LOGO_STYLE, width: '22px', height: '22px', opacity: homeWon ? 1 : 0.4 }} alt="" />
          )}
          <span style={{ fontSize: '0.92rem', fontWeight: homeWon ? '700' : '400', color: homeWon ? '#fff' : '#666' }}>
            {game.home_team}
          </span>
        </div>
        <span style={{
          fontSize: '1.4rem', fontWeight: '700', fontFamily: 'monospace',
          color: homeWon ? '#fff' : '#444',
          minWidth: '2.5rem', textAlign: 'right',
        }}>{isNaN(hS) ? '—' : hS}</span>
      </div>
    </div>
  )
}

// Collapsible day section for Finals with ML record sidebar
function FinalsDay({ daysAgo, games, label, date, defaultOpen, teamRecords }) {
  const [open, setOpen] = useState(defaultOpen)
  const [showStats, setShowStats] = useState(false)

  // Build sorted team ML records from games in this day
  const dayTeams = {}
  for (const g of games) {
    if (!g.espnScores) continue
    const aS = Number(g.espnScores.away), hS = Number(g.espnScores.home)
    if (isNaN(aS) || isNaN(hS)) continue
    const awayWon = aS > hS
    for (const [team, won] of [[g.away_team, awayWon], [g.home_team, !awayWon]]) {
      if (!dayTeams[team]) dayTeams[team] = won
    }
  }

  // Teams with 10-day records, sorted by win % desc
  const teamList = Object.keys(dayTeams)
    .map(team => {
      const r = teamRecords[team] || { mlW: 0, mlL: 0 }
      const total = r.mlW + r.mlL
      const pct = total > 0 ? Math.round((r.mlW / total) * 100) : null
      return { team, wonToday: dayTeams[team], r, total, pct }
    })
    .sort((a, b) => (b.pct || 0) - (a.pct || 0))

  const headerColor = daysAgo === 0 ? '#00ff88' : daysAgo === 1 ? '#ccc' : '#444'

  return (
    <div style={{ marginBottom: '0.75rem', border: '1px solid #1a1a1a', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Clickable header row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.7rem 1rem', background: '#0e0e0e', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '0.1em', color: headerColor }}>
            {label}
          </span>
          <span style={{ fontSize: '0.6rem', color: '#2a2a2a' }}>·</span>
          <span style={{ fontSize: '0.62rem', color: '#3a3a3a' }}>{date}</span>
          <span style={{ fontSize: '0.6rem', color: '#2a2a2a' }}>·</span>
          <span style={{ fontSize: '0.62rem', color: '#2a2a2a' }}>{games.length} game{games.length !== 1 ? 's' : ''}</span>
        </div>
        <span style={{ fontSize: '0.55rem', color: '#333' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0.6rem 0.75rem 0.75rem' }}>
          {/* Stats toggle */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
            <button
              onClick={() => setShowStats(s => !s)}
              style={{
                fontSize: '0.62rem', padding: '0.2rem 0.6rem',
                background: showStats ? '#1a2a1a' : '#111',
                color: showStats ? '#00cc66' : '#444',
                border: `1px solid ${showStats ? '#00cc6644' : '#1e1e1e'}`,
                borderRadius: '4px', cursor: 'pointer',
              }}
            >
              {showStats ? '📊 Hide records' : '📊 10-day records'}
            </button>
          </div>

          {/* ML record panel — shown when toggled */}
          {showStats && (
            <div style={{
              background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '8px',
              padding: '0.6rem 0.75rem', marginBottom: '0.75rem',
            }}>
              <div style={{ fontSize: '0.58rem', color: '#333', letterSpacing: '0.08em', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                MONEYLINE RECORD (last 10 days)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {teamList.map(({ team, wonToday, r, total, pct }) => (
                  <div key={team} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.25rem 0', borderBottom: '1px solid #0f0f0f',
                  }}>
                    {/* Today's result dot */}
                    <span style={{
                      width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                      background: wonToday ? '#00cc66' : '#cc3333',
                    }} />
                    <span style={{ fontSize: '0.75rem', color: '#888', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {team}
                    </span>
                    <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#555', flexShrink: 0 }}>
                      {r.mlW}–{r.mlL}
                    </span>
                    {pct !== null && (
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 'bold', flexShrink: 0,
                        minWidth: '2.4rem', textAlign: 'right',
                        color: pct >= 60 ? '#00cc66' : pct >= 45 ? '#888' : '#cc4444',
                      }}>
                        {pct}%
                      </span>
                    )}
                    {/* Win rate bar */}
                    <div style={{ width: '40px', height: '4px', background: '#1a1a1a', borderRadius: '2px', flexShrink: 0 }}>
                      <div style={{
                        height: '100%', borderRadius: '2px',
                        width: `${pct || 0}%`,
                        background: pct >= 60 ? '#00cc66' : pct >= 45 ? '#555' : '#cc4444',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Game cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {games.map(g => <FinalsCard key={g.id} game={g} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// MLB season start dates by year — used to filter out spring training games
const MLB_SEASON_START = { 2026: new Date('2026-03-25T00:00:00'), 2025: new Date('2025-03-20T00:00:00') }
// Show "early season" banner for 14 days after opening day
const MLB_EARLY_SEASON_DAYS = 14

function ResultDot({ won, label, isSpread }) {
  const bg = won === true ? (isSpread ? '#1a3a4a' : '#00cc6622') : won === false ? '#cc333322' : '#1a1a1a'
  const border = won === true ? (isSpread ? '#4c9be866' : '#00cc6666') : won === false ? '#cc333366' : '#222'
  const symbol = won === true ? (isSpread ? '✓' : '✓') : won === false ? '✗' : '—'
  const color = won === true ? (isSpread ? '#4c9be8' : '#00cc66') : won === false ? '#cc4444' : '#444'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
      <div style={{
        width: '26px', height: '26px', borderRadius: '6px',
        background: bg, border: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.75rem', color, fontWeight: 'bold',
      }}>{symbol}</div>
      <span style={{ fontSize: '0.48rem', color: '#555' }}>{label}</span>
    </div>
  )
}

function TeamHistoryChart({ teamName, allFinals, sportColor, sport }) {
  const now = new Date()
  const year = now.getFullYear()
  const mlbStart = MLB_SEASON_START[year]

  // For MLB, filter out spring training (before opening day), then take last 10 games
  const games = allFinals
    .filter(g => g.away_team === teamName || g.home_team === teamName)
    .filter(g => {
      if (sport !== 'MLB' || !mlbStart) return true
      return new Date(g.commence_time) >= mlbStart
    })
    .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))
    .slice(-10)  // last 10 games only

  // Show banner only within the first MLB_EARLY_SEASON_DAYS days of the season
  const daysSinceOpen = mlbStart ? (now - mlbStart) / (1000 * 60 * 60 * 24) : Infinity
  const isEarlyMlbSeason = sport === 'MLB' && daysSinceOpen >= 0 && daysSinceOpen < MLB_EARLY_SEASON_DAYS

  if (games.length === 0) {
    return <div style={{ color: '#333', fontSize: '0.75rem', padding: '0.5rem 0' }}>No recent game history</div>
  }

  const barData = games.map(g => {
    const isHome = g.home_team === teamName
    const aS = Number(g.espnScores?.away)
    const hS = Number(g.espnScores?.home)
    const scoresValid = !isNaN(aS) && !isNaN(hS) && (aS > 0 || hS > 0)
    const won = !scoresValid ? null : (isHome ? hS > aS : aS > hS)
    const d = new Date(g.commence_time)
    const label = `${d.getMonth()+1}/${d.getDate()}`

    // ATS: try bookmaker spread first, then ESPN closing line, then MLB run line default
    const bm = g.bookmakers?.[0]
    const sp = bm?.markets?.find(m => m.key === 'spreads')
    const spreadOutcome = sp?.outcomes?.find(o => o.name === teamName)
    let spread = spreadOutcome?.point ?? null
    let spreadSource = spread !== null ? 'book' : null

    if (spread === null && g.espnSpread) {
      spread = isHome ? g.espnSpread.home : g.espnSpread.away
      spreadSource = 'espn'
    }
    if (spread === null && sport === 'MLB') {
      // MLB run line is always fixed: favorite is -1.5, underdog is +1.5
      // Use the home/away position as proxy since we don't have fav info per-game
      spread = isHome ? -1.5 : 1.5
      spreadSource = 'rl'
    }
    let coveredSpread = null
    if (spread !== null && scoresValid) {
      const margin = isHome ? (hS - aS) : (aS - hS)
      coveredSpread = margin + spread > 0
    }
    return { label, won, coveredSpread, spreadSource, opponent: isHome ? g.away_team : g.home_team }
  })

  const mlWins = barData.filter(d => d.won === true).length
  const mlTotal = barData.filter(d => d.won !== null).length
  const mlPct = mlTotal > 0 ? Math.round((mlWins / mlTotal) * 100) : null
  const mlColor = mlPct === null ? '#555' : mlPct >= 60 ? '#00cc66' : mlPct >= 45 ? '#888' : '#cc4444'

  const spWins = barData.filter(d => d.coveredSpread === true).length
  const spTotal = barData.filter(d => d.coveredSpread !== null).length
  const spPct = spTotal > 0 ? Math.round((spWins / spTotal) * 100) : null
  const spColor = spPct === null ? '#555' : spPct >= 60 ? '#4c9be8' : spPct >= 45 ? '#888' : '#cc4444'
  // Label: if all spread data came from run line fallback, call it RL
  const usesRunLine = spTotal > 0 && barData.filter(d => d.coveredSpread !== null).every(d => d.spreadSource === 'rl')
  const atsLabel = usesRunLine ? 'RL' : 'ATS'

  return (
    <div style={{ padding: '0.6rem 0 0.25rem' }}>
      {/* Team name + record summary */}
      <div style={{ marginBottom: '0.55rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '0.3rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: sportColor, letterSpacing: '0.04em' }}>
            {teamName.split(' ').slice(-1)[0]}
          </span>
          <span style={{ fontSize: '0.52rem', color: '#555' }}>last {games.length} games</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: mlColor }}>
            ML {mlWins}–{mlTotal - mlWins}{mlPct !== null ? ` (${mlPct}%)` : ''}
          </span>
          <span style={{ fontSize: '0.65rem', fontWeight: spTotal > 0 ? 'bold' : 'normal', color: spTotal > 0 ? spColor : '#555' }}>
            {spTotal > 0 ? `${atsLabel} ${spWins}–${spTotal - spWins}${spPct !== null ? ` (${spPct}%)` : ''}` : 'ATS —'}
          </span>
        </div>
      </div>

      {/* ML row */}
      <div style={{ marginBottom: '0.4rem' }}>
        <div style={{ fontSize: '0.48rem', color: '#336633', letterSpacing: '0.08em', marginBottom: '0.2rem', fontWeight: 'bold' }}>ML</div>
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {barData.map((d, i) => <ResultDot key={i} won={d.won} label={d.label} isSpread={false} />)}
        </div>
      </div>

      {/* Spread row — show data if available, otherwise note */}
      <div>
        <div style={{ fontSize: '0.48rem', color: '#3a6a8a', letterSpacing: '0.08em', marginBottom: '0.2rem', fontWeight: 'bold' }}>{atsLabel}</div>
        {spTotal > 0 ? (
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {barData.map((d, i) => <ResultDot key={i} won={d.coveredSpread} label={d.label} isSpread={true} />)}
          </div>
        ) : (
          <div style={{ fontSize: '0.6rem', color: '#555', fontStyle: 'italic', padding: '0.2rem 0' }}>
            no ATS data available
          </div>
        )}
      </div>

      {/* Early season notice */}
      {isEarlyMlbSeason && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.58rem', color: '#aa8800', background: '#1a1200', border: '1px solid #44330033', borderRadius: '4px', padding: '0.25rem 0.5rem' }}>
          ⚾ MLB opened Mar 25 — limited sample
        </div>
      )}
    </div>
  )
}

function GameExpandedChart({ game, allFinals, accentColor }) {
  const sportColor = SPORT_COLORS[game.sportLabel] || '#aaa'

  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px solid #1a2a1a',
      borderTop: 'none',
      borderRadius: '0 0 8px 8px',
      padding: '0.75rem 1rem',
      marginTop: '-1px',
    }}>
      <div style={{ fontSize: '0.55rem', color: '#335533', fontWeight: 'bold', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>
        📊 LAST 10 GAMES · ML & ATS
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '0.75rem' }}>
        <TeamHistoryChart teamName={game.away_team} allFinals={allFinals} sportColor={sportColor} sport={game.sportLabel} />
        <div style={{ background: '#1a1a1a', alignSelf: 'stretch' }} />
        <TeamHistoryChart teamName={game.home_team} allFinals={allFinals} sportColor={sportColor} sport={game.sportLabel} />
      </div>
    </div>
  )
}

export default function GamesTab({ allGames, loading, onRefresh, cacheAge }) {
  const [selectedGame, setSelectedGame] = useState(null)
  const [sportTab, setSportTab] = useState('ALL')
  const [sectionTab, setSectionTab] = useState('upcoming')
  const [pastGames, setPastGames] = useState([])
  const [finalsSport, setFinalsSport] = useState('ALL')

  useEffect(() => {
    if (!allGames.length) return
    const available = new Set(allGames.map(g => g.sportLabel))
    if (sportTab !== 'ALL' && !available.has(sportTab)) {
      setSportTab(available.size ? [...available][0] : 'ALL')
    }
    // Fetch yesterday + 2 days ago for Finals tab
    const labelMap = { 'baseball/mlb': 'MLB', 'basketball/nba': 'NBA' }
    const dateStr = (daysAgo) => {
      const d = new Date(); d.setDate(d.getDate() - daysAgo)
      return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
    }
    const pastFetches = [1,2,3,4,5,6,7,8,9].flatMap(daysAgo =>
      ['baseball/mlb', 'basketball/nba'].map(ep => ({ ep, daysAgo,
        url: `https://site.api.espn.com/apis/site/v2/sports/${ep}/scoreboard?dates=${dateStr(daysAgo)}`
      }))
    )
    Promise.all(pastFetches.map(({ ep, daysAgo, url }) =>
      fetch(url)
        .then(r => r.ok ? r.json() : { events: [] })
        .then(d => ({ ep, daysAgo, events: d.events || [] }))
        .catch(() => ({ ep, daysAgo, events: [] }))
    )).then(results => {
      const games = results.flatMap(({ ep, daysAgo, events }) =>
        events
          .filter(e => e.competitions?.[0]?.status?.type?.completed)
          .map(e => {
            const comp = e.competitions[0]
            const home = comp.competitors.find(c => c.homeAway === 'home')
            const away = comp.competitors.find(c => c.homeAway === 'away')
            if (!home || !away) return null
            return {
              id: `past_${daysAgo}_${e.id}`,
              home_team: home.team.displayName, away_team: away.team.displayName,
              commence_time: e.date, sportLabel: labelMap[ep],
              espnScores: { home: home.score, away: away.score },
              // ESPN includes the closing spread in competitions[0].odds[0].details
              // Format: "TB Rays -1.5", "LAL -5.5", "Boston Celtics -7", etc.
              espnSpread: (() => {
                const odds = comp.odds?.[0]
                if (!odds) return null
                const detail = (odds.details || '').trim()
                if (!detail) return null
                // Extract the line number at the end: "-1.5", "+5", "-7", "PK" etc.
                if (detail === 'PK' || detail.toLowerCase() === 'pick') return { home: 0, away: 0 }
                const lineMatch = detail.match(/([+-]?\d+\.?\d*)$/)
                if (!lineMatch) return null
                const line = parseFloat(lineMatch[1])
                // The team name before the number is the favored team
                const teamFragment = detail.replace(/\s*[+-]?\d+\.?\d*$/, '').trim().toLowerCase()
                const homeName = home.team.displayName.toLowerCase()
                const awayName = away.team.displayName.toLowerCase()
                const homeAbbr = (home.team.abbreviation || '').toLowerCase()
                const awayAbbr = (away.team.abbreviation || '').toLowerCase()
                // Check if the fragment matches home or away (abbreviation or partial name)
                const matchesHome = homeName.includes(teamFragment) || homeAbbr.includes(teamFragment) || teamFragment.includes(homeAbbr)
                const matchesAway = awayName.includes(teamFragment) || awayAbbr.includes(teamFragment) || teamFragment.includes(awayAbbr)
                if (matchesHome) return { home: -Math.abs(line), away: Math.abs(line) }
                if (matchesAway) return { home: Math.abs(line), away: -Math.abs(line) }
                // Fallback: use homeTeamOdds.favorite flag
                if (odds.homeTeamOdds?.favorite === true) return { home: -Math.abs(line), away: Math.abs(line) }
                if (odds.awayTeamOdds?.favorite === true) return { home: Math.abs(line), away: -Math.abs(line) }
                return null
              })(),
              daysAgo,
            }
          })
          .filter(Boolean)
      )
      setPastGames(games)
    })
  }, [allGames])

  const availableSports = new Set(allGames.map(g => g.sportLabel))
  const visibleTabs = SPORT_TABS.filter(t => t === 'ALL' || availableSports.has(t))

  const filteredGames = (sportTab === 'ALL'
    ? allGames
    : allGames.filter(g => g.sportLabel === sportTab)
  ).slice().sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))

  const localDateStr = (isoStr) => {
    const d = new Date(isoStr)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  const now = new Date()
  const todayStr    = localDateStr(now.toISOString())
  const tomorrowStr = localDateStr(new Date(now.getTime() + 86400000).toISOString())

  const todayGames    = filteredGames.filter(g => localDateStr(g.commence_time) === todayStr)
  const tomorrowGames = filteredGames.filter(g => localDateStr(g.commence_time) === tomorrowStr)
  const laterGames    = filteredGames.filter(g => localDateStr(g.commence_time) > tomorrowStr)

  const activeTodayGames = todayGames.filter(g => !g.espnStatus?.type?.completed && g.espnStatus?.type?.state !== 'post')
  const finalTodayGames  = todayGames.filter(g => g.espnStatus?.type?.completed || g.espnStatus?.type?.state === 'post')
  const liveGames        = activeTodayGames.filter(g => g.espnStatus?.type?.state === 'in')
  const upcomingToday    = activeTodayGames.filter(g => g.espnStatus?.type?.state !== 'in')
  const hasAny = todayGames.length + tomorrowGames.length + laterGames.length > 0


  const accentColor = SPORT_COLORS[sportTab] || '#00ff88'

  const allFinals = [
    ...finalTodayGames.map(g => ({ ...g, daysAgo: 0 })),
    ...pastGames,
  ]

  const renderGame = (game, inUpcoming = false) => {
    const bm = game.bookmakers?.[0]
    const ml = bm?.markets?.find(m => m.key === 'h2h')
    const sp = bm?.markets?.find(m => m.key === 'spreads')
    const status = getGameStatus(game)
    const isLive = status?.state === 'in'
    const isFinal = status?.state === 'post'
    const isUnavailable = isLive || isFinal
    const sportColor = SPORT_COLORS[game.sportLabel] || '#aaa'
    const isMlb = game.sportLabel === 'MLB'
    const awayPitcher = isMlb ? (game.pitchers?.away || null) : null
    const homePitcher = isMlb ? (game.pitchers?.home || null) : null
    const isSelected = selectedGame?.id === game.id
    const showChart = isSelected && inUpcoming

    return (
      <div key={game.id}>
        <div onClick={() => setSelectedGame(isSelected ? null : game)} style={{
          padding: '1rem',
          borderRadius: showChart ? '8px 8px 0 0' : '8px',
          cursor: 'pointer',
          background: isSelected ? '#1a3a2a' : '#1a1a1a',
          border: `1px solid ${isSelected ? accentColor : isLive ? '#ff994444' : isFinal ? '#33333388' : '#2a2a2a'}`,
          borderBottom: showChart ? `1px solid ${accentColor}33` : undefined,
          opacity: isFinal ? 0.55 : 1,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ color: sportColor, fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>{game.sportLabel}</span>
              {isMlb ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    {getTeamLogoUrl(game.away_team, 'MLB') && (
                      <img src={getTeamLogoUrl(game.away_team, 'MLB')} style={{ ...LOGO_STYLE, width: '24px', height: '24px', display: 'block', margin: '0 auto 2px' }} alt="" />
                    )}
                    <div><strong>{game.away_team}</strong></div>
                    <div style={{ fontSize: '0.65rem', color: awayPitcher ? '#4c9be8' : '#333', marginTop: '0.1rem' }}>{'⚾'} {awayPitcher || 'TBA'}</div>
                  </div>
                  <span style={{ color: '#444', fontSize: '0.8rem' }}>@</span>
                  <div style={{ textAlign: 'center' }}>
                    {getTeamLogoUrl(game.home_team, 'MLB') && (
                      <img src={getTeamLogoUrl(game.home_team, 'MLB')} style={{ ...LOGO_STYLE, width: '24px', height: '24px', display: 'block', margin: '0 auto 2px' }} alt="" />
                    )}
                    <div><strong>{game.home_team}</strong></div>
                    <div style={{ fontSize: '0.65rem', color: homePitcher ? '#4c9be8' : '#333', marginTop: '0.1rem' }}>{'⚾'} {homePitcher || 'TBA'}</div>
                  </div>
                </div>
              ) : (
                <>
                  {getTeamLogoUrl(game.home_team, game.sportLabel) && (
                    <img src={getTeamLogoUrl(game.home_team, game.sportLabel)} style={{ ...LOGO_STYLE, width: '22px', height: '22px' }} alt="" />
                  )}
                  <strong>{game.home_team}</strong>
                  <span style={{ color: '#555', margin: '0 0.25rem' }}>vs</span>
                  {getTeamLogoUrl(game.away_team, game.sportLabel) && (
                    <img src={getTeamLogoUrl(game.away_team, game.sportLabel)} style={{ ...LOGO_STYLE, width: '22px', height: '22px' }} alt="" />
                  )}
                  <strong>{game.away_team}</strong>
                </>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {isLive && (
                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', padding: '0.15rem 0.55rem', background: '#2a1500', border: '1px solid #ff994466', borderRadius: '4px', color: '#ff9944' }}>
                  {'🔴'} LIVE {'·'} {status.label}
                </span>
              )}
              {isFinal && (() => {
                const score = game.espnScores
                return (
                  <span style={{ fontSize: '0.7rem', fontWeight: 'bold', padding: '0.15rem 0.65rem', background: '#1a1a1a', border: '1px solid #33333388', borderRadius: '4px', color: '#555' }}>
                    {score ? `${game.away_team.split(' ').pop()} ${score.away} \u2013 ${game.home_team.split(' ').pop()} ${score.home}` : `\u2713 ${status.label}`}
                  </span>
                )
              })()}
              <span style={{ color: '#555', fontSize: '0.8rem' }}>{getGameDateLabel(game.commence_time)}</span>
              {inUpcoming && <span style={{ fontSize: '0.6rem', color: isSelected ? accentColor : '#2a2a2a' }}>{isSelected ? '▲' : '▼'}</span>}
            </div>
          </div>
          {ml && (
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1.5rem', fontSize: '0.85rem', flexWrap: 'wrap' }}>
              <span style={{ color: '#666' }}>ML:</span>
              {ml.outcomes.map(o => (
                <span key={o.name} style={{ color: isUnavailable ? '#444' : (o.price < 0 ? '#00ff88' : '#ff9944') }}>
                  {o.name} <strong>{formatOdds(o.price)}</strong>
                </span>
              ))}
              {sp && <>
                <span style={{ color: '#666', marginLeft: '1rem' }}>SP:</span>
                {sp.outcomes.map(o => (
                  <span key={o.name} style={{ color: isUnavailable ? '#444' : '#aaa' }}>
                    {o.name} <strong>{o.point > 0 ? `+${o.point}` : o.point} ({formatOdds(o.price)})</strong>
                  </span>
                ))}
              </>}
            </div>
          )}
        </div>
        {showChart && (
          <GameExpandedChart game={game} allFinals={allFinals} accentColor={accentColor} />
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', color: '#aaa' }}>🎮 GAMES</h2>
        {cacheAge && <span style={{ color: '#555', fontSize: '0.75rem' }}>updated {cacheAge} {'·'} auto-refreshes every 8h</span>}
      </div>

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.45rem 0.9rem', display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
          <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: accentColor, lineHeight: 1 }}>{todayGames.length}</span>
          <span style={{ fontSize: '0.68rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today</span>
        </div>
        {(tomorrowGames.length + laterGames.length) > 0 && (
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.45rem 0.9rem', display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
            <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#4c9be8', lineHeight: 1 }}>{tomorrowGames.length}</span>
            <span style={{ fontSize: '0.68rem', color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tomorrow</span>
          </div>
        )}
        <div style={{ background: '#1a1a1a', border: '1px solid #1e1e1e', borderRadius: '8px', padding: '0.45rem 0.9rem', display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
          <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#333', lineHeight: 1 }}>{filteredGames.length}</span>
          <span style={{ fontSize: '0.68rem', color: '#333', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
        {[['upcoming', '🏟️ Upcoming'], ['finals', '✓ Finals']].map(([key, label]) => (
          <button key={key} onClick={() => setSectionTab(key)} style={{
            padding: '0.35rem 0.85rem', borderRadius: '6px', cursor: 'pointer',
            fontSize: '0.78rem', fontWeight: sectionTab === key ? 'bold' : 'normal',
            background: sectionTab === key ? '#fff' : '#1a1a1a',
            color: sectionTab === key ? '#000' : '#666',
            border: `1px solid ${sectionTab === key ? '#fff' : '#2a2a2a'}`,
          }}>{label}</button>
        ))}
      </div>

      {/* Sport filter */}
      {sectionTab === 'upcoming' && visibleTabs.length > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
          {visibleTabs.map(t => {
            const isActive = sportTab === t
            const color = SPORT_COLORS[t] || '#00ff88'
            return (
              <button key={t} onClick={() => { setSportTab(t); setSelectedGame(null) }} style={{
                padding: '0.35rem 0.9rem', background: isActive ? color : '#1a1a1a',
                color: isActive ? '#000' : '#888', border: `1px solid ${isActive ? color : '#333'}`,
                borderRadius: '6px', cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
                fontSize: '0.8rem',
              }}>{t}</button>
            )
          })}
        </div>
      )}

      {loading && <p style={{ color: '#888' }}>Fetching odds...</p>}

      {!loading && availableSports.size > 0 && !availableSports.has('MLB') && (() => {
        const month = new Date().getMonth() + 1
        const day = new Date().getDate()
        if ((month === 3 && day >= 20) || (month >= 4 && month <= 10)) {
          return (
            <div style={{ padding: '0.6rem 0.9rem', background: '#1a1200', border: '1px solid #554400', borderRadius: '6px', color: '#aa8800', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
              {'⚠️'} MLB is in season but no games were returned — try <strong>Refresh</strong>.
            </div>
          )
        }
        return null
      })()}

      {/* FINALS VIEW */}
      {sectionTab === 'finals' && (() => {
        const dayLabel = (daysAgo) => {
          if (daysAgo === 0) return 'TODAY'
          if (daysAgo === 1) return 'YESTERDAY'
          const d = new Date(); d.setDate(d.getDate() - daysAgo)
          return d.toLocaleDateString([], { weekday: 'long' }).toUpperCase()
        }
        const dayDate = (daysAgo) => {
          const d = new Date(); d.setDate(d.getDate() - daysAgo)
          return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
        }

        const todayFinals = finalTodayGames.map(g => ({ ...g, daysAgo: 0 }))
        const allFinals = [...todayFinals, ...pastGames]
        const finalsFiltered = finalsSport === 'ALL' ? allFinals : allFinals.filter(g => g.sportLabel === finalsSport)
        const finalsAvailableSports = [...new Set(allFinals.map(g => g.sportLabel))].filter(Boolean)

        // Build team ML + ATS records across all 10 days
        const teamRecords = {}
        for (const g of allFinals) {
          if (!g.espnScores) continue
          const aS = Number(g.espnScores.away)
          const hS = Number(g.espnScores.home)
          if (isNaN(aS) || isNaN(hS) || (aS === 0 && hS === 0)) continue
          const awayWon = aS > hS
          for (const [team, won, isHome] of [[g.away_team, awayWon, false], [g.home_team, !awayWon, true]]) {
            if (!teamRecords[team]) teamRecords[team] = { mlW: 0, mlL: 0 }
            if (won) teamRecords[team].mlW++
            else teamRecords[team].mlL++
          }
        }

        const byDay = {}
        for (const g of finalsFiltered) {
          if (!byDay[g.daysAgo]) byDay[g.daysAgo] = []
          byDay[g.daysAgo].push(g)
        }
        const dayKeys = Array.from({ length: 10 }, (_, i) => i).filter(k => byDay[k]?.length > 0)

        return (
          <div>
            {/* Sport filter */}
            {finalsAvailableSports.length > 1 && (
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
                {['ALL', ...finalsAvailableSports].map(t => {
                  const isActive = finalsSport === t
                  const color = SPORT_COLORS[t] || '#00ff88'
                  return (
                    <button key={t} onClick={() => setFinalsSport(t)} style={{
                      padding: '0.3rem 0.8rem', background: isActive ? color : '#1a1a1a',
                      color: isActive ? '#000' : '#666', border: `1px solid ${isActive ? color : '#2a2a2a'}`,
                      borderRadius: '6px', cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal',
                      fontSize: '0.75rem',
                    }}>{t}</button>
                  )
                })}
              </div>
            )}

            {pastGames.length === 0 && finalTodayGames.length === 0 && (
              <div style={{ color: '#333', fontSize: '0.82rem', textAlign: 'center', padding: '3rem 0' }}>Loading...</div>
            )}

            {dayKeys.map(daysAgo => (
              <FinalsDay
                key={daysAgo}
                daysAgo={daysAgo}
                games={byDay[daysAgo].slice().sort((a,b) => new Date(a.commence_time) - new Date(b.commence_time))}
                label={dayLabel(daysAgo)}
                date={dayDate(daysAgo)}
                defaultOpen={daysAgo <= 1}
                teamRecords={teamRecords}
              />
            ))}
          </div>
        )
      })()}

      {/* UPCOMING VIEW */}
      {sectionTab === 'upcoming' && (
        <div style={{ marginBottom: '2rem' }}>
          {!loading && !hasAny && (
            <p style={{ color: '#555' }}>No {sportTab === 'ALL' ? '' : sportTab + ' '}games found.</p>
          )}
          {liveGames.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#ff9944', fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                {'🔴'} LIVE {'·'} {liveGames.length} game{liveGames.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {liveGames.map(g => renderGame(g, true))}
              </div>
            </div>
          )}
          {upcomingToday.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#555', fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                {'🏟️'} TODAY {'·'} {upcomingToday.length} game{upcomingToday.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {upcomingToday.map(g => renderGame(g, true))}
              </div>
            </div>
          )}
          {finalTodayGames.length > 0 && (
            <FinalGamesSection games={finalTodayGames} renderGame={renderGame} />
          )}
          {tomorrowGames.length > 0 && (
            <div style={{ marginBottom: laterGames.length > 0 ? '1.5rem' : 0 }}>
              <div style={{ fontSize: '0.65rem', color: '#4c9be8', fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                {'🌅'} TOMORROW {'·'} {tomorrowGames.length} game{tomorrowGames.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {tomorrowGames.map(g => renderGame(g, true))}
              </div>
            </div>
          )}
          {laterGames.length > 0 && (
            <div>
              <div style={{ fontSize: '0.65rem', color: '#444', fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                {'📆'} LATER {'·'} {laterGames.length} game{laterGames.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {laterGames.map(g => renderGame(g, true))}
              </div>
            </div>
          )}
        </div>
      )}


    </div>
  )
}
