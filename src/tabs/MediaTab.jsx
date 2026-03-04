import React from 'react'
import TodoBox from '../components/TodoBox.jsx'

export default function MediaTab() {
  return (
    <div>
      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: '#aaa' }}>📺 MEDIA</h2>
        <TodoBox items={[
          "Discord integration: post to a #picks channel and app fetches and displays as a live feed (Discord bot + webhook, free)",
          "Twitter/X: dedicated account posts a pick tweet daily, paste URL into dev panel to render via Twitter embed script (free, manual)",
        ]} />
        <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>
          More coming soon.
        </p>
      </div>
      <div style={{ textAlign: 'center', padding: '4rem 0' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚧</div>
        <div style={{ color: '#333', fontSize: '0.9rem' }}>This section is under construction.</div>
      </div>
    </div>
  )
}
