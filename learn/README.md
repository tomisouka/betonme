# BetOnMe — Learn Directory

This folder documents the real skills used to build and maintain this project.
Each file covers one concept — what it is, why it matters here, and how it shows up in the code.

## Index

| File | Concept | Where it shows up |
|------|---------|-------------------|
| `01-async-await.md` | Async/await & Promises | Every load/save function |
| `02-race-conditions.md` | Race conditions & write queues | `useSaveData.js` queue fix |
| `03-cors.md` | CORS — what it is and why it blocks | `server.js` origin config |
| `04-react-useeffect.md` | useEffect & component lifecycle | `LockTab` init pattern |
| `05-express-server.md` | Express server basics | `server.js` |
| `06-state-vs-server.md` | Local state vs server state | `appState` vs `savedata.json` |
| `07-json-persistence.md` | JSON as a database | `savedata.json` structure |

## How to use this

Read these when something breaks and you want to understand *why*, not just fix it.
Each doc is short — concept first, then how it applies to this exact project.
