import React from 'react'

/**
 * Small pill badge flagging a doubleheader game.
 * Props:
 *   show - boolean, renders nothing when false
 *   size - 'sm' | 'md' (default 'md')
 */
export default function DHBadge({ show, size = 'md' }) {
  if (!show) return null

  const isSmall = size === 'sm'

  return (
    <span
      style={{
        display: 'inline-block',
        padding: isSmall ? '0.1rem 0.4rem' : '0.2rem 0.6rem',
        borderRadius: '999px',
        border: '1px solid #c89b3c',
        background: '#c89b3c18',
        color: '#c89b3c',
        fontWeight: 'bold',
        fontSize: isSmall ? '0.62rem' : '0.72rem',
        letterSpacing: '0.04em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      DH
    </span>
  )
}
