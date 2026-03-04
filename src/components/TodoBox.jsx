import React from 'react'

export default function TodoBox({ items }) {
  const [open, setOpen] = React.useState(false)
  if (!items || !items.length) return null
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#1a1a0a', border: '1px solid #33330a', borderRadius: '7px',
          padding: '0.5rem 0.85rem', cursor: 'pointer',
        }}
      >
        <span style={{ color: '#888844', fontSize: '0.72rem', fontWeight: 'bold' }}>📋 TODO ({items.length})</span>
        <span style={{ color: '#555533', fontSize: '0.72rem' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ background: '#141408', border: '1px solid #33330a', borderTop: 'none', borderRadius: '0 0 7px 7px', padding: '0.6rem 0.85rem' }}>
          {items.map((item, i) => (
            <div key={i} style={{ color: '#666633', fontSize: '0.75rem', marginBottom: i < items.length - 1 ? '0.35rem' : 0 }}>
              · {item}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
