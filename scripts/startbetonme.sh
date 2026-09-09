#!/bin/bash
cd "$(dirname "$0")"

# Kill all processes on Ctrl+C
trap 'kill 0' EXIT

# Clear port 3001 if something is already using it
echo "[startapp] Clearing port 3001..."
fuser -k 3001/tcp 2>/dev/null || true
sleep 1  # give the OS time to fully release the port

# Grade any pending picks from yesterday/today before the app loads
echo "[startapp] Checking for unresolved pick results..."
python3 results.py

echo "[startapp] Starting dk_scraper in watch mode..."
python3 dk_scraper.py --watch &

echo "[startapp] Starting server..."
USE_DB=true DB_FILE=betonme.db node server.js &

# Wait for server to be ready before starting vite
echo "[startapp] Waiting for server on port 3001..."
for i in $(seq 1 15); do
  if curl -s http://127.0.0.1:3001/ping > /dev/null 2>&1; then
    echo "[startapp] Server ready."
    break
  fi
  sleep 0.5
done

echo "[startapp] Starting vite..."
pnpm exec vite &

wait
