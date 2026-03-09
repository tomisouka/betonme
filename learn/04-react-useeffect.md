# 04 — useEffect & Component Lifecycle

## The concept

React components are functions that return UI. They re-run (re-render) any time
their state or props change. But some things should only happen once — loading
data from a server, setting up a subscription, running a migration.

`useEffect` lets you run side effects tied to the component's lifecycle.

```js
useEffect(() => {
  // runs after the component renders
}, []) // ← empty array = only run once, on mount
```

The second argument is the **dependency array**. It controls when the effect re-runs:
- `[]` — run once when component mounts
- `[value]` — re-run whenever `value` changes
- no array — run after every render (almost never what you want)

## The async pattern

`useEffect` callbacks can't be async directly. The workaround is to define
an async function inside and call it immediately:

```js
useEffect(() => {
  async function init() {
    const data = await loadState()
    setAppState(data)
  }
  init()   // call it — useEffect itself stays synchronous
}, [])
```

## How it works in LockTab

```js
useEffect(() => {
  async function init() {
    // 1. fetch from server
    const res = await fetch('http://127.0.0.1:3001/data')
    const all = await res.json()
    let s = all.app || {}

    // 2. add daily coins if needed
    if (s.lastCoinDate !== todayKey) {
      s.coins = (s.coins || 0) + 1
      s.lastCoinDate = todayKey
      await saveState(s)
    }

    // 3. resolve any pending picks (pass s in — no extra read)
    s = await resolvePendingPicks(s)

    // 4. update UI
    setAppState({ ...s })
  }
  init()
}, [])
```

Steps 1→2→3→4 run in strict order because each is awaited before the next starts.

## Why order matters

Before the fix, the pattern was:

```js
setAppState({ ...s })    // UI update
resolvePendingPicks()    // fired without await — ran in parallel
```

`setAppState` and `resolvePendingPicks` ran at the same time.
`resolvePendingPicks` did its own `loadState()` read, which raced against
the coin save. The UI also showed stale data until resolve finished.

After the fix, everything is sequential — one read, one chain of operations,
one UI update at the end with the final state.

## React Strict Mode double-invoke

In development, React 19 intentionally runs effects **twice** to help catch bugs.
You'll see effects fire, clean up, then fire again. This is why the console shows
duplicate fetches on startup. In production this doesn't happen.

The double-invoke is why the write queue matters even more — in dev, two
`init()` calls fire back to back, which stress-tests the queue.

## Key takeaway

- `useEffect(() => { ... }, [])` = run once on mount
- Put async logic inside a named function inside the effect
- Always `await` every async call that the next line depends on
- The dependency array controls re-runs — empty means once
