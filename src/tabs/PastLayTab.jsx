import React, { useState, useEffect } from 'react'
import { loadLayHistory, loadPredictions, loadState, loadDogState, loadOuPick, loadPropPick } from '../hooks/useSaveData.js'
import { formatOdds } from '../utils/odds.js'

function fmtDateLabel(key) {
  if (!key) return ''
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const d = new Date(key + 'T12:00:00')
  const [, mm, dd] = key.split('-')
  return `${days[d.getDay()]} ${mm}/${dd}`
}

function getTodayKey() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const W_COLOR = '#00ff88'
const L_COLOR = '#ff4444'

function resultDot(result) {
  if (result === 'W') return <span style={{ color: W_COLOR }}>✅</span>
  if (result === 'L') return <span style={{ color: L_COLOR }}>❌</span>
  return <span style={{ color: '#555' }}>⏳</span>
}

function resultBadge(result, hitCount, totalCount) {
  if (!result) return null
  const pct = totalCount ? Math.round(hitCount / totalCount * 100) : null
  return (
    <div style={{
      padding: '0.2rem 0.65rem', borderRadius: '5px', fontWeight: 'bold', fontSize: '0.75rem',
      background: result === 'W' ? '#00ff8818' : '#ff444418',
      border: `1px solid ${result === 'W' ? '#00ff8833' : '#ff444433'}`,
      color: result === 'W' ? W_COLOR : L_COLOR, flexShrink: 0,
    }}>
      {hitCount != null && totalCount != null ? `${hitCount}/${totalCount} · ` : ''}
      {pct != null ? `${pct}% ` : ''}{result === 'W' ? '✅' : '❌'}
    </div>
  )
}

function Section({ emoji, title, accent, children, badge, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: '12px', marginBottom: '0.75rem', overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.65rem 1rem', borderBottom: open ? '1px solid #1a1a1a' : 'none',
          background: '#141414', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '0.82rem', color: accent || '#aaa' }}>{emoji} {title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {badge}
          <span style={{ color: '#333', fontSize: '0.75rem', fontWeight: 'bold' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && <div style={{ padding: '0.75rem 1rem' }}>{children}</div>}
    </div>
  )
}

function LegRow({ label, labelColor, team, sub, result, odds }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.55rem 0.75rem', borderRadius: '8px',
      background: result === 'W' ? '#0a2a1a' : result === 'L' ? '#2a0a0a' : '#1a1a1a',
      border: `1px solid ${result === 'W' ? '#00ff8833' : result === 'L' ? '#ff444433' : '#2a2a2a'}`,
      marginBottom: '0.4rem',
    }}>
      <div>
        <div style={{ fontSize: '0.6rem', color: labelColor || '#555', fontWeight: 'bold', marginBottom: '0.15rem', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ fontWeight: 'bold', fontSize: '0.88rem' }}>{team || '—'}</div>
        {sub && <div style={{ color: '#444', fontSize: '0.7rem', marginTop: '0.1rem' }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
        {odds != null && (
          <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: odds < 0 ? W_COLOR : '#ff9944' }}>{formatOdds(odds)}</div>
        )}
        <div style={{ fontSize: '1.1rem' }}>{resultDot(result)}</div>
      </div>
    </div>
  )
}

export default function PastLayTab() {
  const [allData, setAllData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [appState, dogState, layHist, predHist, ouHist, propHist] = await Promise.all([
        loadState(), loadDogState(), loadLayHistory(), loadPredictions(), loadOuPick(), loadPropPick(),
      ])
      setAllData({ appState, dogState, layHist, predHist, ouHist, propHist })
      const today = getTodayKey()
      const allDays = new Set([
        ...Object.keys(appState.picks || {}),
        ...Object.keys(dogState.picks || {}),
        ...Object.keys(layHist),
        ...Object.keys(predHist),
        ...Object.keys(ouHist),
        ...Object.keys(propHist),
      ])
      const past = [...allDays].filter(k => k < today).sort((a, b) => b.localeCompare(a))
      if (past.length > 0) setSelectedKey(past[0])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p style={{ color: '#555', fontSize: '0.85rem' }}>Loading history...</p>

  const today = getTodayKey()
  const { appState, dogState, layHist, predHist, ouHist, propHist } = allData

  const allDays = new Set([
    ...Object.keys(appState.picks || {}),
    ...Object.keys(dogState.picks || {}),
    ...Object.keys(layHist),
    ...Object.keys(predHist),
    ...Object.keys(ouHist),
    ...Object.keys(propHist),
  ])
  const pastDays = [...allDays].filter(k => k < today).sort((a, b) => b.localeCompare(a))

  if (pastDays.length === 0) {
    return (
      <div>
        <h2 style={{ margin: '0 0 0.3rem', fontSize: '1rem', color: '#aaa' }}>📋 PAST LAYS</h2>
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.5rem', textAlign: 'center', marginTop: '1rem' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🎯</div>
          <div style={{ color: '#555', fontSize: '0.85rem' }}>No past picks yet. History shows up here after your first day.</div>
        </div>
      </div>
    )
  }

  const lockDays = pastDays.filter(k => appState.picks?.[k]?.result)
  const lockW = lockDays.filter(k => appState.picks[k].result === 'W').length
  const lockL = lockDays.filter(k => appState.picks[k].result === 'L').length
  const layDays = pastDays.filter(k => layHist[k]?.overallResult)
  const layW = layDays.filter(k => layHist[k].overallResult === 'W').length
  const layL = layDays.filter(k => layHist[k].overallResult === 'L').length

  const key = selectedKey || pastDays[0]
  const lock = appState.picks?.[key] || null
  const dog  = dogState.picks?.[key] || null
  const ou   = ouHist[key] || null
  const pred = predHist[key] || null
  const lay  = layHist[key] || null
  const prop = propHist[key] || null

  const propEntries = prop
    ? Object.entries(prop).filter(([, v]) => typeof v === 'object' && v !== null && v.player)
    : []

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ margin: '0 0 0.3rem', fontSize: '1rem', color: '#aaa' }}>📋 PAST LAYS</h2>
        <p style={{ margin: 0, color: '#444', fontSize: '0.82rem' }}>Every pick, every day — see what hit and what didn't.</p>
      </div>

      {/* Record pills */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {(lockW + lockL) > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.45rem 0.85rem', fontSize: '0.78rem' }}>
            <span style={{ color: '#555' }}>🔒 Lock</span>
            <span style={{ color: W_COLOR, fontWeight: 'bold' }}>{lockW}W</span>
            <span style={{ color: '#333' }}>–</span>
            <span style={{ color: L_COLOR, fontWeight: 'bold' }}>{lockL}L</span>
            <span style={{ color: lockW >= lockL ? W_COLOR : L_COLOR, fontWeight: 'bold' }}>{Math.round(lockW / (lockW + lockL) * 100)}%</span>
          </div>
        )}
        {(layW + layL) > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '0.45rem 0.85rem', fontSize: '0.78rem' }}>
            <span style={{ color: '#555' }}>🎯 Lay</span>
            <span style={{ color: W_COLOR, fontWeight: 'bold' }}>{layW}W</span>
            <span style={{ color: '#333' }}>–</span>
            <span style={{ color: L_COLOR, fontWeight: 'bold' }}>{layL}L</span>
            <span style={{ color: layW >= layL ? W_COLOR : L_COLOR, fontWeight: 'bold' }}>{Math.round(layW / (layW + layL) * 100)}%</span>
          </div>
        )}
      </div>

      {/* Day selector */}
      <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>
        {pastDays.map(dk => {
          const result = layHist[dk]?.overallResult || appState.picks?.[dk]?.result || null
          const isSelected = dk === key
          return (
            <button key={dk} onClick={() => setSelectedKey(dk)} style={{
              flexShrink: 0, padding: '0.4rem 0.8rem', borderRadius: '8px',
              cursor: 'pointer', fontWeight: 'bold', fontSize: '0.75rem',
              background: isSelected ? (result === 'W' ? '#0a2a1a' : result === 'L' ? '#2a0a0a' : '#222') : '#111',
              border: `1px solid ${isSelected ? (result === 'W' ? '#00ff8866' : result === 'L' ? '#ff444466' : '#444') : '#222'}`,
              color: isSelected ? (result === 'W' ? W_COLOR : result === 'L' ? L_COLOR : '#fff') : (result === 'W' ? '#00ff8855' : result === 'L' ? '#ff444455' : '#333'),
            }}>
              {fmtDateLabel(dk)}{result === 'W' ? ' ✅' : result === 'L' ? ' ❌' : ''}
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: '0.88rem', fontWeight: 'bold', color: '#555', marginBottom: '0.85rem' }}>
        {fmtDateLabel(key)}
      </div>

      {/* 1. Lock */}
      {lock && (
        <Section emoji="🔒" title="Lock of the Day" accent="#00ff88" badge={resultBadge(lock.result, null, null)}>
          <LegRow
            label={`${lock.sport} · ${lock.market === 'h2h' ? 'MONEYLINE' : `SPREAD ${lock.point > 0 ? '+' : ''}${lock.point}`}`}
            labelColor="#00ff88" team={lock.team}
            sub={`${lock.away} vs ${lock.home}`}
            result={lock.result} odds={lock.odds}
          />
          {lock.stake != null && (
            <div style={{ fontSize: '0.72rem', color: '#333', marginTop: '0.15rem' }}>
              Stake 🪙{lock.stake}
              {lock.result === 'W' && lock.profit != null && <span style={{ color: W_COLOR, marginLeft: '0.5rem' }}>+🪙{lock.profit.toFixed(2)}</span>}
            </div>
          )}
        </Section>
      )}

      {/* 2. Dog */}
      {dog && (
        <Section emoji="🐕" title="Dog of the Day" accent="#ff9944" badge={resultBadge(dog.result, null, null)}>
          <LegRow
            label={`${dog.sport} · UNDERDOG ML`} labelColor="#ff9944"
            team={dog.team} sub={`${dog.away} vs ${dog.home}`}
            result={dog.result} odds={dog.odds}
          />
        </Section>
      )}

      {/* 3. Double Lock */}
      {ou && lock && (
        <Section emoji="🔒🔒" title="Double Lock — O/U" accent="#00ff88"
          badge={ou.result ? resultBadge(ou.result, null, null) : null}>
          <LegRow label="LEG 1 · LOCK" labelColor="#00ff88" team={lock.team}
            sub={lock.market === 'h2h' ? 'Moneyline' : `Spread ${lock.point > 0 ? '+' : ''}${lock.point}`}
            result={lock.result} odds={lock.odds} />
          <LegRow label="LEG 2 · O/U" labelColor="#8888ff"
            team={`${ou.name} ${ou.point}`}
            sub={`${lock.away} vs ${lock.home} — Total`}
            result={ou.result ?? null} odds={ou.odds} />
        </Section>
      )}

      {/* 4. Predictions */}
      {pred?.legs?.length > 0 && (
        <Section emoji="🔮" title="Predictions" accent="#8888ff"
          badge={pred.overallResult ? resultBadge(pred.overallResult, pred.hitCount, pred.totalCount) : null}>
          {pred.legs.map((leg, i) => (
            <LegRow key={leg.gameId || i}
              label={leg.isLock ? '🔒 LOCK' : leg.isDog ? '🐕 DOG' : `LEG ${i + 1}`}
              labelColor={leg.isLock ? '#00ff88' : leg.isDog ? '#ff9944' : '#8888ff'}
              team={leg.team || '—'} sub={`${leg.away} vs ${leg.home} · ${leg.sport}`}
              result={leg.result} />
          ))}
        </Section>
      )}

      {/* 5. Lay of the Day */}
      {lay?.legs?.length > 0 && (
        <Section emoji="🎯" title="Lay of the Day" accent="#8888ff"
          badge={lay.overallResult ? resultBadge(lay.overallResult, lay.hitCount, lay.totalCount) : null}>
          {lay.legs.map((leg, i) => (
            <LegRow key={leg.gameId || i}
              label={leg.isLock ? '🔒 LOCK' : leg.isDog ? '🐕 DOG' : `LEG ${i + 1}`}
              labelColor={leg.isLock ? '#00ff88' : leg.isDog ? '#ff9944' : '#8888ff'}
              team={leg.team || '—'} sub={`${leg.away} vs ${leg.home} · ${leg.sport}`}
              result={leg.result} />
          ))}

        </Section>
      )}

      {/* 6. Prop */}
      {propEntries.length > 0 && (
        <Section emoji="🎲" title="Prop Pick" accent="#ffdd44">
          {propEntries.map(([teamKey, pick], i) => (
            <LegRow key={i}
              label={`${pick.sport} · ${(pick.label || 'PROP').toUpperCase()} · ${(pick.side || '').toUpperCase()}`}
              labelColor="#ffdd44"
              team={`${pick.player} ${pick.side === 'over' ? '⬆' : '⬇'} ${pick.line}`}
              sub={`${pick.team || teamKey}`}
              result={pick.result} odds={pick.odds} />
          ))}
        </Section>
      )}

      {!lock && !dog && !ou && !pred && !lay && propEntries.length === 0 && (
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.25rem', color: '#444', fontSize: '0.85rem', textAlign: 'center' }}>
          No picks recorded for {fmtDateLabel(key)}.
        </div>
      )}
    </div>
  )
}