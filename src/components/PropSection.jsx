import React from 'react'
import { formatOdds } from '../utils/odds.js'

const PAGE_SIZE = 5

export const MARKET_EMOJIS = {
  player_points: '🏀',
  player_rebounds: '🔄',
  player_assists: '🎯',
  player_threes: '3pt',
  pitcher_strikeouts: '⚾',
  batter_total_bases: '🏃',
  batter_hits: '🥎',
  player_pass_yds: '🏈',
  player_rush_yds: '💨',
  player_reception_yds: '🙌',
}

export const PROP_MARKET_LABELS = {
  player_points: 'Points O/U',
  player_rebounds: 'Rebounds O/U',
  player_assists: 'Assists O/U',
  player_threes: '3-Pointers O/U',
  pitcher_strikeouts: 'Strikeouts O/U',
  batter_total_bases: 'Total Bases O/U',
  batter_hits: 'Hits O/U',
  player_pass_yds: 'Pass Yards O/U',
  player_rush_yds: 'Rush Yards O/U',
  player_reception_yds: 'Rec Yards O/U',
}

export const ODDS_API_PROP_MARKETS = {
  NBA: ['player_points', 'player_rebounds', 'player_assists', 'player_threes'],
  MLB: ['pitcher_strikeouts', 'batter_total_bases', 'batter_hits'],
  NFL: ['player_pass_yds', 'player_rush_yds', 'player_reception_yds'],
}

export const MARKET_ORDER = {
  NBA: ['player_points', 'player_rebounds', 'player_assists', 'player_threes'],
  MLB: ['pitcher_strikeouts', 'batter_total_bases', 'batter_hits'],
  NFL: ['player_pass_yds', 'player_rush_yds', 'player_reception_yds'],
}

export default function PropSection({ marketKey, label, props, pickedTeams, onPick, defaultOpen, homeTeam, awayTeam, teamColorMap }) {
  const [open, setOpen] = React.useState(defaultOpen)
  const [sortDir, setSortDir] = React.useState('desc')
  const [showAll, setShowAll] = React.useState(false)

  const teamColor = (team) => teamColorMap?.[team] || '#555'

  const pickedCount = props.filter(p => pickedTeams[p.team] === `${p.player}|${p.marketKey}`).length

  const pickedProps = props.filter(p => pickedTeams[p.team] === `${p.player}|${p.marketKey}`)
  const unpickedProps = props.filter(p => pickedTeams[p.team] !== `${p.player}|${p.marketKey}`)

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
            const isPicked = pickedTeams[prop.team] === `${prop.player}|${prop.marketKey}`
            const teamPickedElsewhere = pickedTeams[prop.team] && !isPicked
            return (
              <div
                key={`${prop.player}-${prop.marketKey}`}
                onClick={() => !isPicked && onPick(prop)}
                style={{
                  background: isPicked ? '#1a1a2a' : '#1a1a1a',
                  border: `1px solid ${isPicked ? '#8888ff' : '#2a2a2a'}`,
                  borderRadius: '8px', padding: '0.75rem 1rem',
                  cursor: isPicked ? 'default' : 'pointer',
                  opacity: teamPickedElsewhere ? 0.35 : 1,
                  transition: 'border-color 0.15s, opacity 0.15s',
                }}
                onMouseEnter={e => { if (!isPicked && !teamPickedElsewhere) e.currentTarget.style.borderColor = '#8888ff' }}
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
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fff' }}>{prop.line}</div>
                    <div style={{ fontSize: '0.7rem', color: '#555' }}>
                      ⬆ {formatOdds(prop.overOdds)} · ⬇ {formatOdds(prop.underOdds)}
                    </div>
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
