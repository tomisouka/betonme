#!/bin/bash
BETONME_HOST="${BETONME_HOST:?set BETONME_HOST, e.g. user@host.example.com}"
ssh "$BETONME_HOST" '
  if systemctl --user is-active --quiet betonme; then
    echo "✅ BetOnMe is running"
  else
    echo "⚠️  BetOnMe is down — starting..."
    systemctl --user start betonme
    sleep 3
    systemctl --user status betonme
  fi
'
# STEP MARKER: step 3/6 complete — all 5 files fixed (useSaveData.js, App.jsx,
# FavsTab.jsx, HateWatchTab.jsx, checkbetonme.sh). Next: step 4, .gitignore check.
