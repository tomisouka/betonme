# 01 — Async / Await & Promises

## The concept

JavaScript runs one thing at a time. But some operations take time — reading a file,
hitting an API, waiting for a server response. Instead of freezing everything while
you wait, JS lets you say "start this, and when it's done, continue."

That's a **Promise** — a value that doesn't exist yet but will.
`async/await` is the clean syntax for working with Promises.

```js
// Without async/await (messy .then chains)
fetch('/data')
  .then(res => res.json())
  .then(data => console.log(data))

// With async/await (reads top to bottom like normal code)
async function load() {
  const res = await fetch('/data')
  const data = await res.json()
  console.log(data)
}
```

`await` pauses that function until the Promise resolves. Nothing else in that
function runs until the awaited thing finishes. Other code outside the function
keeps running normally.

## The key rule

You can only `await` inside an `async` function. If you forget `await`, the
function moves on immediately with a Promise object instead of the real value —
and you get weird bugs where things are `undefined` or `[object Promise]`.

```js
// BUG — forgot await, s is a Promise not real data
const s = loadState()
s.coins // undefined

// CORRECT
const s = await loadState()
s.coins // 5
```

## Where this shows up in BetOnMe

Every data function in `useSaveData.js` is async:

```js
export async function loadState() {
  const data = await loadAllData()   // wait for server response
  return data.app || {}
}
```

And every caller has to await it:

```js
async function init() {
  let s = await loadState()   // ← must await or s is a Promise
  s.coins += 1
  await saveState(s)          // ← must await or save might not finish before next line
}
```

## The mistake we fixed

`resolvePendingPicks()` was being called without `await` inside `init()`:

```js
// OLD — broken
setAppState({ ...s })
resolvePendingPicks()    // fires immediately, doesn't wait, races against coin save

// FIXED
s = await resolvePendingPicks(s)   // waits for full completion before continuing
setAppState({ ...s })
```

Without `await`, both functions ran at the same time and stomped each other's saves.

## Mental model

Think of `await` as a stop sign. The function pauses at the stop sign,
waits for traffic to clear (the Promise to resolve), then continues.
Every async operation that depends on a previous one needs a stop sign.
