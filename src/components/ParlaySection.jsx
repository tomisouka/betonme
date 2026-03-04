import React from 'react'

export default function ParlaySection({ title, emoji, defaultOpen, children, totalOdds, forceOpen, onToggle }) {
  const [open, setOpen] = React.useState(defaultOpen)

  // Allow parent to force open (e.g. auto-open Lay when Predictions locks)
  React.useEffect(() => { if (forceOpen) setOpen(true) }, [forceOpen])

  function toggle() { setOpen(o => !o); onToggle && onToggle() }

  const formatTotalOdds = (odds) => {
    if (!odds) return null
    return odds > 0 ? `+${odds}` : `${odds}`
  }

  return (
    <div style={{
      background: '#141414', border: '1px solid #2a2a2a',
      borderRadius: '12px', marginBottom: '0.75rem', overflow: 'hidden',
    }}>
      {/* Header — always visible, click to toggle */}
      <div
        onClick={toggle}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1rem 1.25rem', cursor: 'pointer',
          background: open ? '#1a1a1a' : '#141414',
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.1rem' }}>{emoji}</span>
          <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {totalOdds && (
            <span style={{
              fontSize: '0.8rem', fontWeight: 'bold', color: '#00ff88',
              background: '#0a2a1a', border: '1px solid #00ff8844',
              borderRadius: '5px', padding: '0.2rem 0.6rem',
            }}>
              {formatTotalOdds(totalOdds)}
            </span>
          )}
          <span style={{ color: '#444', fontSize: '0.85rem' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Collapsible body */}
      {open && (
        <div style={{ padding: '1.25rem', borderTop: '1px solid #222' }}>
          {children}
        </div>
      )}
    </div>
  )
}
