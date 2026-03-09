# 06 — Local State vs Server State

## The concept

In a React app with a backend, data lives in two places at once:

- **Server state** — the source of truth, persisted to disk (`savedata.json`)
- **Local state** — a copy in memory inside the React component (`appState`)

These two can get out of sync. Managing that gap is one of the core challenges
of frontend development.

## The two categories in BetOnMe

```
savedata.json (server state — persists forever)
├── app        → lock picks, coins, streak
├── predictions
├── lay
├── dog
├── propPick
└── ouPick

localStorage (cache — intentionally temporary, 3hr TTL)
├── oddsCache      → odds API response
├── propsCache     → player props
└── statsCache     → player stats
```

Odds, props, and stats are NOT in savedata.json on purpose. They're fetched fresh
from external APIs and only need to survive a browser session. Losing them just
means a re-fetch. Losing your pick history is a different story.

## The pattern: load once, mutate in memory, save back

```js
// 1. Load from server into local state on mount
useEffect(() => {
  async function init() {
    const s = await loadState()
    setAppState(s)
  }
  init()
}, [])

// 2. When user does something, mutate local state immediately (fast UI)
//    and queue the save behind it
async function confirmPick() {
  const s = { ...appState, picks: { ...appState.picks } }
  s.picks[todayKey] = newPick
  s.coins -= stake
  setAppState({ ...s })   // ← UI updates instantly, no waiting
  await saveState(s)       // ← save happens in background
}
```

The user sees the result immediately. The save happens after. If the save fails,
the UI is already updated — which means there's a gap. For a local app this is fine.
For a production app you'd want to handle save errors and potentially roll back.

## The bug pattern: re-reading instead of using what you have

The original `confirmPick` did this:

```js
async function confirmPick() {
  const s = await loadState()   // re-read from server — WHY?
  s.picks[todayKey] = newPick
  await saveState(s)
}
```

This is wasteful and risky. `appState` already has the current data — the component
loaded it on mount and has been keeping it in sync. Re-reading introduces a round
trip to the server and opens a window for a race condition.

The fix: treat `appState` as authoritative within the component. Only go back to
the server when you genuinely need a fresh read (e.g., on mount, or after an
external change).

## The single source of truth principle

At any given moment, one thing should be "the truth." In BetOnMe:

- `savedata.json` is the truth at rest (when the app is closed)
- `appState` is the truth while the app is open

When the app opens, it syncs `appState` from `savedata.json`. After that,
`appState` leads and `savedata.json` follows (via saves). The server doesn't
push changes to the client — the client is always the initiator.

## Key takeaway

- Load once on mount, store in component state
- Mutate component state directly for immediate UI updates
- Save to server as a side effect — don't re-read just to save
- localStorage is for temporary cache, not persistent data
