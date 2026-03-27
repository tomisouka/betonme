# BetOnMe — APK / Mobile Planning

> Last updated: March 2026

---

## The Problem

BetOnMe is not a static app. The React frontend talks to a live Express server
(`server.js` on `localhost:3001`) to load and save all pick data. You can't just
bundle it into an APK the way Coogs Hub was done — the data layer lives outside
the app entirely.

---

## Two Paths

### Path A — Quick (WiFi only)
Bundle the frontend into a Capacitor APK. Swap the `localhost:3001` fetch calls
to point at your desktop's local IP (e.g. `192.168.1.x:3001`). Run `pnpm dev`
on your desktop, phone hits the server over home WiFi.

| | |
|--|--|
| ✅ | Fast to set up, no architecture changes |
| ✅ | Works for home use (picks are done at home anyway) |
| ❌ | Desktop must be on and running `pnpm dev` |
| ❌ | Only works on home WiFi |
| ❌ | Not truly standalone |

### Path B — Proper (works anywhere)
Move `server.js` to a Raspberry Pi or cheap VPS. HTTPS via Caddy. Auth token on
all endpoints. Capacitor APK points at the real URL.

| | |
|--|--|
| ✅ | Fully standalone, works from anywhere |
| ✅ | Already planned in SERVER.md Phase 2 |
| ✅ | Unlocks PWA + push notifications later |
| ❌ | More setup (~a few hours) |
| ❌ | Small monthly cost if using VPS (~$5/mo Hetzner) |

---

## Recommendation
Do **Path A** when you want it on your phone fast.
Do **Path B** when you're ready for Phase 2 per the roadmap — it's already planned.

---

## When Ready — Path A Steps
1. Find your desktop's local IP: `ip addr | grep 192.168`
2. In `server.js` change listen address from `127.0.0.1` → `0.0.0.0`
3. In the React app, replace all `localhost:3001` fetch URLs with your local IP
4. `pnpm build`
5. `npx cap init / npx cap add android` (same as Coogs Hub)
6. `npx cap copy android && cd android && ./gradlew assembleDebug`
7. Send APK via LocalSend, install on Samsung

## When Ready — Path B Steps
See `SERVER.md` Phase 2 section for full detail.
Short version: VPS/Pi → Caddy HTTPS → auth token → update fetch URLs → APK.

---

## Notes
- `savedata.json` and `savedata.backup.json` are already in `.gitignore` ✅
- Capacitor + Android SDK already set up on this machine from Coogs Hub work
- Build tools at: `~/android-sdk/`
- Reference the Coogs Hub `dev-log/apk.md` for the full build command sequence