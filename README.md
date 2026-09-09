# BetOnMe

A local daily sports betting tracker — lock of the day, dogs, props, parlays, and results.

---

## Demo

<!-- Drop demo gifs/screenshots in docs/media/ and reference them below, e.g.: -->
<!-- ![Lock of the day tab](docs/media/lock-tab.gif) -->

| | |
|---|---|
| ![Games tab](docs/media/games.gif) | ![Parlays tab](docs/media/parlays.gif) |

---

## Stack

- **Frontend:** React 19 + Vite (port 5173)
- **Server:** Express (port 3001)
- **Database:** SQLite via better-sqlite3 (`db/betonme.db`)
- **Odds:** DraftKings odds integration (`dk_scraper.py`)
- **Results:** ESPN data integration (`results.py`)
- **Package manager:** pnpm

---

## Start

```bash
./startbetonme.sh
```

Kills port 3001, grades pending picks, starts scraper, starts server + vite.

---

## Tabs

| Tab | What it does |
|-----|-------------|
| 🎮 Games | Today's games with DK odds + ESPN live status |
| 🔒 Lock | Daily lock of the day — pick, bet coins, track streak |
| 🐕 Dogs | Daily underdog pick (+150 or better) |
| ⚡ Super Dog | Big dog of the day |
| ⭐ Favs | Favorite team tracker |
| 😤 HateWatch | Rival team fade tracker |
| 🎰 Parlays | Daily lay + predictions |
| 🎲 Props | Pitcher props from DK + batter props fallback |
| 📺 Media | Lineup cards + highlights (in progress) |
| ⚡ Live | Odds movement chart — 5min snapshots |
| 🏆 Wins | All-time wins leaderboard |
| 📋 Past Lays | Historical parlay results |

---

## Dev Panel

Shows full DB state, pick history, and manual controls. Password-gated locally — see `.env.example` for setup.

---

## Data

- **Picks, coins, streak:** `db/betonme.db`
- **Odds snapshot:** `dk_odds.json` (overwritten every 5 min)
- **Odds movement:** `odds_history.json` (2-day rolling window)
- **DB backups:** `db/backups/betonme.YYYY-MM-DD.db` (7-day rotation, cron at 2am)

---

## Useful Commands

```bash
# Check DB
sqlite3 db/betonme.db "SELECT coins, last_coin_date, json_array_length(streak) FROM app_state WHERE id=1;"

# Export data
curl http://localhost:3001/export -o betonme-export.json

<<<<<<< HEAD
=======
```

<<<<<<< HEAD
# Check scraper service
systemctl --user status dk-scraper
journalctl --user -u dk-scraper -f
>>>>>>> fd58fb7 (Fixed check bug)
```

=======
>>>>>>> 5bee667 (Fixed check bug)
---

## License

<<<<<<< HEAD
AGPL-3.0-only. See [LICENSE](LICENSE) for the full text.
=======
AGPL-3.0-only. See [LICENSE](LICENSE) for the full text.
>>>>>>> 5bee667 (Fixed check bug)
