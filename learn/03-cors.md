# 03 — CORS (Cross-Origin Resource Sharing)

## The concept

Browsers have a security rule: a webpage can only make requests to the
**same origin** it was loaded from, unless the server explicitly allows otherwise.

An **origin** is: protocol + domain + port.

```
http://localhost:5173   ← origin A (your React app)
http://127.0.0.1:3001   ← origin B (your Express server)
```

These are different origins. When your React app tries to fetch from the server,
the browser blocks it — unless the server sends back a header saying "yes, I allow
requests from that origin."

That header is: `Access-Control-Allow-Origin`

## What the error looks like

```
Access to fetch at 'http://127.0.0.1:3001/data' from origin
'http://localhost:5175' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present
```

Note: the server DID respond (200 OK) — the browser received the response
and then threw it away because the CORS header was missing or wrong.
This is purely a browser enforcement. The server itself doesn't block it.

## How it's configured in BetOnMe

The `cors` npm package handles this in `server.js`:

```js
// OLD — hardcoded ports, broke when Vite bumped to 5175
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }))

// FIXED — allows any localhost port dynamically
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) cb(null, true)
    else cb(new Error('CORS blocked'))
  }
}))
```

The regex `^http:\/\/localhost:\d+$` matches any `http://localhost:NNNN` origin.
`!origin` covers server-to-server requests that don't send an origin header.

## Why Vite changes ports

Vite defaults to port 5173. If something is already running on 5173,
it tries 5174, then 5175, etc. This is normal — but if your server only
allows specific ports, any bump breaks the connection.

The dynamic regex fix means you never have to update `server.js` when
Vite picks a different port.

## Important distinction

CORS only applies to **browser** requests. If you hit `http://127.0.0.1:3001/data`
directly in a browser tab, or with `curl`, there's no CORS check — you get the
data fine. CORS is enforced by the browser on behalf of the page, not by the server.

This is why the server logs showed `200 OK` even while the browser was rejecting it.

## Key takeaway

When you see a CORS error:
1. The server IS running and responding
2. The browser is blocking the response
3. Fix is always on the server — add the right `Access-Control-Allow-Origin` header
4. Never fix CORS by disabling it in the browser — that's just hiding the problem
