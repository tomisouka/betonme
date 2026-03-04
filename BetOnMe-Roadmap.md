# 🎰 BetOnMe — Server Roadmap & App Path

---

## Where You Are Right Now

Your current stack is surprisingly solid for a local tool:

- **Frontend:** React 19 + Vite on `localhost:5173`
- **Backend:** Express server on `localhost:3001` — reads/writes `savedata.json`
- **Sync:** Syncthing keeps `savedata.json` in sync across your devices
- **Cache:** localStorage handles temporary odds/props (intentionally not migrated)

The server is minimal but clean. It does exactly what it needs to: persist data reliably, auto-backup on every write, and export on demand. That's a great foundation to build from.

---

## 🖥️ Server: What It Can Become

### Phase 1 — Harden What You Have (Now → 1 month)

These are quick wins that make the current server more robust without changing its shape.

**Scheduled auto-backups**
Right now you get one rolling backup (`savedata.backup.json`). Add a daily timestamped backup using `node-cron` so you have a week of history to roll back to. Cost: ~10 lines of code.

**Import endpoint**
Add `POST /import` that accepts a JSON file upload and overwrites `savedata.json`. Pairs with the existing export button in the Dev Panel — lets you restore from any snapshot, not just the last backup.

**Persistent error logging**
Add a `server.log` file that captures errors with timestamps. Right now errors only go to the terminal, which you lose when the process restarts.

**Auth token**
The server currently trusts any request from `localhost`. Fine for now, but if you ever expose it (even on a local network), a simple `x-api-key` header check is a 5-minute add.

**Versioned savedata**
Add a `_version` field to `savedata.json`. When the schema changes in the future, the server can auto-migrate old data instead of breaking.

---

### Phase 2 — Multi-Device Without Syncthing (1–3 months)

Syncthing works, but it's a workaround. The real next step is making the server the source of truth that any device can reach.

**Move to a VPS or home server**
Run `server.js` on a cheap VPS ($5/mo on DigitalOcean or Hetzner) or a home server (Raspberry Pi, old laptop). Your phone and laptop both point at the same server — no Syncthing needed.

**HTTPS + simple auth**
Use Caddy or nginx as a reverse proxy to get a free SSL cert via Let's Encrypt. Add a login token to the app so the API isn't wide open. This makes it safe to run on the internet.

**Replace the JSON file with SQLite**
`savedata.json` is fine up to maybe a year of daily data (~300KB). When you want to query history ("what's my record on NBA underdogs in March?"), you'll want a real DB. SQLite is a single file, zero-dependency drop-in. The `better-sqlite3` npm package takes about an hour to swap in.

---

### Phase 3 — Real Backend Features (3–6 months)

Once the server is stable and reachable, you can start building features that only a server makes possible.

**Scheduled result resolution**
Right now ESPN result-checking runs when you open the app. Move it to the server on a cron job — runs at midnight every day whether the app is open or not. Your history always resolves automatically.

**Push notifications**
With a server you can send yourself a push notification when a pick resolves. Options: Pushover ($5 one-time), ntfy.sh (free, self-host), or web push (complex but free). "Your lock WON 🔒✅" lands on your phone the second the game ends.

**Odds caching on the server**
Move the 3-hour odds cache from localStorage to the server. Benefit: you only burn one API call no matter how many devices/browsers you open the app in. Also survives browser cache clears.

**Webhook for the Media tab**
A Discord bot posting your daily picks is a server-side feature. The server can post to a Discord webhook at lock time, then update the message with the result when it resolves. This unblocks the entire Media tab.

**Historical analytics API**
With SQLite and a few endpoints you can start answering questions like: "Which sport am I most profitable in?" or "What's my record when I pick home underdogs?" — power the Stats tab with real data instead of just counting W/L.

---

## 📱 APK / App Path

Here's the honest roadmap from "local web app" to "phone app."

### Option A: PWA (Progressive Web App) — Fastest Path (2–4 weeks)

A PWA is a website that installs like an app. On Android you get a home screen icon, it launches fullscreen, and it works offline. On iOS it's slightly more limited but still works.

**What it takes:**
1. Add a `manifest.json` (app name, icon, theme color)
2. Add a service worker (handles offline + caching)
3. Vite has a plugin for this: `vite-plugin-pwa` — about 30 minutes to set up
4. Host the frontend somewhere (Netlify, Vercel, or your VPS)

**What you get:**
- Installs on Android home screen from Chrome ("Add to Home Screen")
- Fullscreen launch, no browser UI
- Offline mode for cached data
- No app store needed
- Works on iOS too (Safari, limited features)

**Limitation:** Not a real APK. Doesn't appear in the Play Store. Can't use native device APIs (camera, contacts, etc.) — but you don't need those.

**This is the right move for BetOnMe.** It's a personal tool, not a product. PWA gets you 95% of the "app feel" in weeks, not months.

---

### Option B: React Native — Real Native App (2–4 months)

If you want a real APK that installs like any other app, React Native is the natural next step given your React codebase.

**What it takes:**
1. Rewrite the UI in React Native components (`View`, `Text`, `TouchableOpacity` instead of `div`, `span`, `button`)
2. Replace localStorage with `AsyncStorage` or `MMKV`
3. Replace fetch calls (same, actually — fetch works in RN)
4. Set up Android Studio + Java SDK to build the APK
5. Sign the APK for distribution

**The honest cost:** Your App.jsx is ~2,500 lines. A React Native port is probably 3–6 weeks of evenings if you've never done it before, 1–2 weeks if you have. The concepts are the same — it's mostly a component-name swap and styling rewrite (no CSS, everything is inline StyleSheet objects).

**What you get:**
- Real `.apk` file you can sideload on your phone
- Could submit to Play Store (requires $25 developer account)
- Access to native APIs if you ever need them
- Better performance for animations

**Expo** is the recommended starting point — it handles the Android/iOS build tooling for you and lets you preview on your phone instantly with Expo Go. You'd use Expo Router + React Native.

---

### Option C: Capacitor — Wrap the Web App (1–3 weeks)

Capacitor by Ionic takes your existing web app and wraps it in a native shell to produce an APK. It's the middle path between PWA and full React Native.

**What it takes:**
1. `npm install @capacitor/core @capacitor/android`
2. `npx cap init` and `npx cap add android`
3. `vite build` then `npx cap sync`
4. Open in Android Studio and build the APK

**What you get:**
- Real APK from your existing React code — minimal rewrite
- Access to some native APIs via Capacitor plugins
- Works for sideloading; can submit to Play Store

**Limitation:** Performance is web-view based (same as the browser). Fine for a data app like BetOnMe — you're not rendering 3D graphics.

**This is probably the right second step after PWA** if you want an actual APK without a rewrite.

---

## 🗓️ Recommended Timeline

| Timeframe | What to Build |
|-----------|---------------|
| **Now — 2 weeks** | Phase 1 server hardening (timestamped backups, import endpoint, error log) |
| **2–4 weeks** | PWA setup — installs on your phone home screen, works offline |
| **1–2 months** | Move server to VPS or Raspberry Pi, add HTTPS, drop Syncthing |
| **2–3 months** | Swap JSON for SQLite, add scheduled result resolution, odds server-side cache |
| **3–4 months** | Push notifications, Discord webhook for Media tab, analytics endpoints |
| **4–6 months** | Capacitor APK build — wrap the PWA into a real installable APK |
| **6+ months** | React Native rewrite if you want Play Store distribution or native features |

---

## 💡 Quick Wins You Could Do This Week

1. **`vite-plugin-pwa`** — 30 min setup, immediately installable on your phone
2. **Timestamped backup rotation** — 10 lines in `server.js`, keeps 7 days of history
3. **`POST /import` endpoint** — pairs with your existing export button, full round-trip backup/restore
4. **Move `dogapp`, `propPick`, `doubleLockOU` to server** — still listed as TODO in PROGRESS.md, finishes the localStorage migration

---

## The Big Picture

BetOnMe is already past the "toy project" stage — you have a real data persistence layer, auto-backup, export, dev tooling, and a migration system. The server is the right foundation. The path to a proper app is: **PWA first** (weeks, not months), **VPS + SQLite next** (makes it multi-device), **Capacitor APK later** (when you want it on the home screen as a real app). React Native is the nuclear option — only worth it if you want Play Store distribution or this becomes a real product.
