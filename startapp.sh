#!/bin/bash

# Kill all processes on Ctrl+C
trap 'kill 0' EXIT

# Clear port 3001 if something is already using it
echo "[startapp] Clearing port 3001..."
fuser -k 3001/tcp 2>/dev/null || true

# Grade any pending picks from yesterday/today before the app loads
echo "[startapp] Checking for unresolved pick results..."
python3 results.py

echo "[startapp] Starting dk_scraper in watch mode (every 30 min)..."
python3 dk_scraper.py --watch &

echo "[startapp] Starting server + vite..."
pnpm dev &

wait
