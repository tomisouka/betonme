import React from 'react'
import { formatOdds } from '../utils/odds.js'

const PAGE_SIZE = 5

export const MARKET_EMOJIS = {
  // NBA
  player_points: '🏀',
  player_rebounds: '🔄',
  player_assists: '🎯',
  player_threes: '3pt',
  // MLB — Pitcher
  pitcher_strikeouts: '⚾',
  pitcher_hits_allowed: '🎯',
  pitcher_walks: '🚶',
  pitcher_earned_runs: '💥',
  // MLB — Batter
  batter_total_bases: '🏃',
  batter_hits: '🥎',
  batter_home_runs: '🏠',
  batter_rbis: '📊',
  batter_runs_scored: '🏅',
  batter_singles: '1️⃣',
  batter_doubles: '2️⃣',
  batter_stolen_bases: '💨',
  batter_triples: '3️⃣',
  batter_walks: '🚶',
  // NFL
  player_pass_yds: '🏈',
  player_rush_yds: '💨',
  player_reception_yds: '🙌',
  player_pass_tds: '🎯',
  player_receptions: '🤲',
  player_rush_attempts: '🦵',
}

export const PROP_MARKET_LABELS = {
  // NBA
  player_points: 'Points O/U',
  player_rebounds: 'Rebounds O/U',
  player_assists: 'Assists O/U',
  player_threes: '3-Pointers O/U',
  // MLB — Pitcher
  pitcher_strikeouts: 'Strikeouts O/U',
  pitcher_hits_allowed: 'Hits Allowed O/U',
  pitcher_walks: 'Walks O/U',
  pitcher_earned_runs: 'Earned Runs O/U',
  // MLB — Batter
  batter_total_bases: 'Total Bases O/U',
  batter_hits: 'Hits O/U',
  batter_home_runs: 'Home Runs O/U',
  batter_rbis: 'RBIs O/U',
  batter_runs_scored: 'Runs Scored O/U',
  batter_singles: 'Singles O/U',
  batter_doubles: 'Doubles O/U',
  batter_stolen_bases: 'Stolen Bases O/U',
  batter_triples: 'Triples O/U',
  batter_walks: 'Walks (Batter) O/U',
  // NFL
  player_pass_yds: 'Pass Yards O/U',
  player_rush_yds: 'Rush Yards O/U',
  player_reception_yds: 'Rec Yards O/U',
  player_pass_tds: 'Pass TDs O/U',
  player_receptions: 'Receptions O/U',
  player_rush_attempts: 'Rush Attempts O/U',
}

// Section groupings for display labels
export const MARKET_SECTION_LABELS = {
  MLB: {
    pitcher: { label: '⚾ Pitcher Props', keys: ['pitcher_strikeouts', 'pitcher_hits_allowed', 'pitcher_walks', 'pitcher_earned_runs'] },
    batter: { label: '🥎 Batter Props', keys: ['batter_hits', 'batter_total_bases', 'batter_home_runs', 'batter_rbis', 'batter_runs_scored', 'batter_singles', 'batter_doubles', 'batter_triples', 'batter_walks', 'batter_stolen_bases'] },
  }
}

export const ODDS_API_PROP_MARKETS = {
  NBA: ['player_points', 'player_rebounds', 'player_assists', 'player_threes'],
  MLB: [
    // Pitcher (confirmed valid keys for FanDuel/DraftKings)
    'pitcher_strikeouts', 'pitcher_hits_allowed', 'pitcher_walks', 'pitcher_earned_runs',
    // Batter
    'batter_hits', 'batter_total_bases', 'batter_home_runs', 'batter_rbis',
    'batter_runs_scored', 'batter_singles', 'batter_doubles', 'batter_triples',
    'batter_walks', 'batter_stolen_bases',
  ],
  NFL: ['player_pass_yds', 'player_rush_yds', 'player_reception_yds', 'player_pass_tds', 'player_receptions', 'player_rush_attempts'],
}

export const MARKET_ORDER = {
  NBA: ['player_points', 'player_rebounds', 'player_assists', 'player_threes'],
  MLB: [
    'pitcher_strikeouts', 'pitcher_hits_allowed', 'pitcher_walks', 'pitcher_earned_runs',
    'batter_hits', 'batter_total_bases', 'batter_home_runs', 'batter_rbis', 'batter_runs_scored', 'batter_singles', 'batter_doubles', 'batter_triples', 'batter_walks', 'batter_stolen_bases',
  ],
  NFL: ['player_pass_yds', 'player_rush_yds', 'player_reception_yds', 'player_pass_tds', 'player_receptions', 'player_rush_attempts'],
}

export default function PropSection({ marketKey, label, props, pickedTeams, onPick, defaultOpen, homeTeam, awayTeam, teamColorMap }) {
  const [open, setOpen] = React.useState(defaultOpen)
  const [sortDir, setSortDir] = React.useState('desc')
  const [showAll, setShowAll] = React.useState(false)

  const teamColor = (team) => teamColorMap?.[team] || '#555'

  const pickedCount = props.filter(p => pickedTeams[`${p.team || 'unknown'}||${p.marketKey}`] === `${p.player}|${p.marketKey}`).length

  const pickedProps = props.filter(p => pickedTeams[`${p.team || 'unknown'}||${p.marketKey}`] === `${p.player}|${p.marketKey}`)
  const unpickedProps = props.filter(p => pickedTeams[`${p.team || 'unknown'}||${p.marketKey}`] !== `${p.player}|${p.marketKey}`)

  const sortedUnpicked = [...unpickedProps].sort((a, b) =>
    sortDir === 'desc' ? b.line - a.line : a.line - b.line
  )

  const visibleUnpicked = showAll ? sortedUnpicked : sortedUnpicked.slice(0, PAGE_SIZE)
  const displayProps = [...pickedProps, ...visibleUnpicked]
  const hiddenCount = sortedUnpicked.length - visibleUnpicked.length

  function toggleSort(e) {
    e.stopPropagation()
    setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    setShowAll(false)
  }

  return (
    <div style={{ background: '#141414', border: '1px solid #222', borderRadius: '10px', marginBottom: '0.5rem', overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1.1rem', cursor: 'pointer', background: open ? '#1a1a1a' : '#141414' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>{MARKET_EMOJIS[marketKey] || '📊'}</span>
          <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{label}</span>
          <span style={{ fontSize: '0.72rem', color: '#444' }}>({props.length})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {pickedCount > 0 && (
            <span style={{ fontSize: '0.68rem', color: '#8888ff', background: '#8888ff22', border: '1px solid #8888ff44', borderRadius: '4px', padding: '0.1rem 0.45rem', fontWeight: 'bold' }}>
              {pickedCount} picked
            </span>
          )}
          {open && (
            <button
              onClick={toggleSort}
              style={{
                padding: '0.15rem 0.55rem', fontSize: '0.7rem', fontWeight: 'bold',
                background: '#222', border: '1px solid #333', borderRadius: '5px',
                color: '#aaa', cursor: 'pointer', lineHeight: 1.4,
              }}
            >
              {sortDir === 'desc' ? '↓ High' : '↑ Low'}
            </button>
          )}
          <span style={{ color: '#444', fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div style={{ padding: '0.6rem 0.75rem', borderTop: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {displayProps.map(prop => {
            // isPicked: this exact player+market is already picked
            const teamMKey = `${prop.team || 'unknown'}||${prop.marketKey}`
            const isPicked = pickedTeams[teamMKey] === `${prop.player}|${prop.marketKey}`
            // pickedElsewhere: a different player on the same team in the same market
            const marketPickedElsewhere = pickedTeams[teamMKey] && !isPicked
            return (
              <div
                key={`${prop.player}-${prop.marketKey}`}
                onClick={() => !isPicked && !marketPickedElsewhere && onPick(prop)}
                style={{
                  background: isPicked ? '#1a1a2a' : '#1a1a1a',
                  border: `1px solid ${isPicked ? '#8888ff' : '#2a2a2a'}`,
                  borderRadius: '8px', padding: '0.75rem 1rem',
                  cursor: isPicked || marketPickedElsewhere ? 'default' : 'pointer',
                  opacity: marketPickedElsewhere ? 0.35 : 1,
                  transition: 'border-color 0.15s, opacity 0.15s',
                }}
                onMouseEnter={e => { if (!isPicked && !marketPickedElsewhere) e.currentTarget.style.borderColor = '#8888ff' }}
                onMouseLeave={e => { if (!isPicked) e.currentTarget.style.borderColor = isPicked ? '#8888ff' : '#2a2a2a' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{prop.player}</span>
                      {isPicked && <span style={{ fontSize: '0.62rem', color: '#8888ff', background: '#8888ff22', borderRadius: '3px', padding: '0.1rem 0.35rem', fontWeight: 'bold' }}>✓ PICKED</span>}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: teamColor(prop.team), fontWeight: 'bold' }}>{prop.team}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fff' }}>
                      {prop.line}{prop.underOdds == null ? '+' : ''}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#555' }}>
                      {prop.underOdds == null
                        ? <span style={{ color: prop.overOdds > 0 ? '#ff9944' : '#aaa' }}>{formatOdds(prop.overOdds)}</span>
                        : <>⬆ {formatOdds(prop.overOdds)} · ⬇ {formatOdds(prop.underOdds)}</>
                      }
                    </div>
                    {prop.allLines && prop.allLines.length > 1 && (
                      <div style={{ fontSize: '0.6rem', color: '#333', marginTop: '0.2rem' }}>
                        {prop.allLines.map(l => (
                          <span key={l.label} style={{ marginLeft: '0.3rem', color: l.line === prop.line ? '#aaa' : '#2a2a2a' }}>
                            {l.label} {formatOdds(l.odds)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {(hiddenCount > 0 || showAll) && (
            <button
              onClick={() => setShowAll(v => !v)}
              style={{
                marginTop: '0.2rem', padding: '0.6rem',
                background: 'transparent', border: '1px solid #2a2a2a',
                borderRadius: '8px', color: '#555', cursor: 'pointer',
                fontSize: '0.78rem', fontWeight: 'bold', transition: 'color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#444' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#2a2a2a' }}
            >
              {showAll ? '▲ Show less' : `▼ Show ${hiddenCount} more`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
