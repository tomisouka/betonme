# 02 — Race Conditions & Write Queues

## The concept

A **race condition** happens when two operations both read the same data,
modify it independently, then both write back — and the second write
overwrites the first one's changes without knowing they happened.

```
Time →

op1: READ  (gets {coins: 0})
op2: READ  (gets {coins: 0})   ← same stale snapshot
op1:          WRITE {coins: 1}
op2:                   WRITE {coins: 0, result: 'L'}  ← stomps op1, coins gone
```

This is called a **read-modify-write race**. It's one of the most common bugs
in any system where multiple things update shared data.

## Why it happened in BetOnMe

Every save function did its own full read before writing:

```js
export async function saveState(state) {
  const current = await loadAllData()          // READ
  await saveAllData({ ...current, app: state }) // WRITE
}
```

On startup, `init()` fired two operations nearly simultaneously:
1. Coin check → `saveState(s)` → READ → WRITE
2. `resolvePendingPicks()` → `loadState()` → READ → WRITE

Both reads happened before either write landed. Both saw `coins: 0`.
Whichever write finished last won. The other's changes were silently dropped.

## The fix — a write queue

A **queue** serializes operations — forces them to run one at a time, in order.
Each job waits for the previous one to fully finish before starting.

```js
let _queue = Promise.resolve()  // starts as an already-resolved promise

function enqueueWrite(key, value) {
  _queue = _queue.then(async () => {
    const current = await loadAllData()           // READ — always fresh now
    await saveAllData({ ...current, [key]: value }) // WRITE
  })
  return _queue
}
```

How it chains:

```
_queue = resolved
→ save('app', s1)   chains onto resolved   → READ → WRITE ✅
→ save('dog', s2)   chains onto save1      →              READ → WRITE ✅
→ save('app', s3)   chains onto save2      →                           READ → WRITE ✅
```

Each READ now happens after the previous WRITE fully finishes.
No two saves ever see the same stale snapshot.

## The second fix — pass state instead of re-reading

Even with the queue, `resolvePendingPicks` was doing its own `loadState()` at
the top — an extra read that could still race against the coin write.

The fix: pass the already-loaded state in as an argument.

```js
// OLD — extra read, potential race
async function resolvePendingPicks() {
  const s = await loadState()   // reads again — might be stale
  ...
}

// FIXED — reuses state already in memory
async function resolvePendingPicks(s) {
  if (!s) s = await loadState() // only reads if no state passed in
  ...
  return s                       // returns modified state back to caller
}

// caller
let s = await loadState()
// ... modify s ...
await saveState(s)
s = await resolvePendingPicks(s)  // passes s in, gets updated s back
setAppState({ ...s })
```

## Key takeaway

Any time multiple async operations share the same data source, you need to
think about ordering. Either:
- **Serialize** them (queue) so they can't overlap
- **Pass state through** so reads don't happen more than once per operation chain
- **Both** for maximum safety
