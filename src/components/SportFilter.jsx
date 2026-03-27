import React from 'react'

export const SPORT_COLORS = {
  ALL: '#00ff88',
  NBA: '#c89b3c',
  MLB: '#4c9be8',
  NFL: '#7ac96f',
}

/**
 * Filter a games array by selected sport tab.
 * @param {Array} games - array of game objects with .sportLabel
 * @param {string} tab  - 'ALL' | 'NBA' | 'MLB' | 'NFL'
 */
export function filterBySport(games, tab) {
  if (!tab || tab === 'ALL') return games
  return games.filter(g => g.sportLabel === tab)
}

/**
 * Pill-style sport filter bar.
 * Props:
 *   games     - full unfiltered games array (used to derive available tabs)
 *   value     - currently selected tab string
 *   onChange  - callback(tab)
 *   label     - noun for the count label, e.g. 'game' (default) or 'parlay'
 *   style     - optional container style overrides
 */
export default function SportFilter({ games = [], value = 'ALL', onChange, label = 'game', style = {} }) {
  const available = new Set(games.map(g => g.sportLabel))
  const tabs = ['ALL', 'NBA', 'MLB', 'NFL'].filter(t => t === 'ALL' || available.has(t))
  const filteredCount = filterBySport(games, value).length
  const activeColor = SPORT_COLORS[value] || '#00ff88'

  if (tabs.length <= 1 && games.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      marginBottom: '1rem',
      ...style,
    }}>
      {/* Count header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
        <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: activeColor, lineHeight: 1 }}>
          {filteredCount}
        </span>
        <span style={{ fontSize: '0.75rem', color: '#555', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {filteredCount === 1 ? label : label + 's'}{value !== 'ALL' ? ` · ${value}` : ''}
        </span>
      </div>

      {/* Pills — only render if there's more than one sport to choose from */}
      {tabs.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {tabs.map(tab => {
            const color = SPORT_COLORS[tab] || '#888'
            const isActive = value === tab
            return (
              <button
                key={tab}
                onClick={() => onChange(tab)}
                style={{
                  padding: '0.3rem 0.85rem',
                  borderRadius: '999px',
                  border: `1px solid ${isActive ? color : '#2a2a2a'}`,
                  background: isActive ? `${color}18` : 'transparent',
                  color: isActive ? color : '#555',
                  fontWeight: isActive ? 'bold' : 'normal',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  letterSpacing: '0.04em',
                }}
              >
                {tab}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
