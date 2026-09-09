#!/bin/bash
TARGET="$HOME/projects/betonme-server/src/tabs/FavsTab.jsx"

echo "=== FILE EXISTS ==="
ls -lh "$TARGET" 2>/dev/null || echo "FILE NOT FOUND"

echo ""
echo "=== PICK FLOW VERSION ==="
if grep -q "step === 'side'" "$TARGET"; then
  echo "✓ NEW flow (Ride/Fade step)"
else
  echo "✗ OLD flow — step state missing"
fi

if grep -q "PICK.*SPREAD OR ML\|⭐ PICK" "$TARGET"; then
  echo "✗ OLD picker string still present"
else
  echo "✓ OLD picker string gone"
fi

if grep -q "resetFlow" "$TARGET"; then
  echo "✓ resetFlow present"
else
  echo "✗ resetFlow missing"
fi

if grep -q "oppML" "$TARGET"; then
  echo "✓ oppML present"
else
  echo "✗ oppML missing"
fi

if grep -q "favSide" "$TARGET"; then
  echo "✓ favSide present"
else
  echo "✗ favSide missing"
fi

echo ""
echo "=== BIAS/SHARPNESS METERS ==="
if grep -q "SliderMeter" "$TARGET"; then
  echo "✓ SliderMeter present"
else
  echo "✗ SliderMeter missing"
fi

if grep -q "SharpnessMeter" "$TARGET"; then
  echo "✓ SharpnessMeter present"
else
  echo "✗ SharpnessMeter missing"
fi

if grep -q "gutPct" "$TARGET"; then
  echo "✓ gutPct present"
else
  echo "✗ gutPct missing"
fi

echo ""
echo "=== ANALYTICS ==="
if grep -q "saveData.favPick" "$TARGET"; then
  echo "✓ favPick analytics source present"
else
  echo "✗ favPick analytics source missing"
fi

echo ""
echo "=== BUILD CHECK ==="
BUILD_DIR="$HOME/projects/betonme-server/dist"
if [ -d "$BUILD_DIR" ]; then
  echo "dist exists — last built: $(stat -c '%y' $BUILD_DIR)"
  BUILT_FILE=$(find "$BUILD_DIR" -name "*.js" | xargs grep -l "gutPct\|SliderMeter" 2>/dev/null | head -1)
  if [ -n "$BUILT_FILE" ]; then
    echo "✓ New meter code found in dist: $BUILT_FILE"
  else
    echo "✗ New meter code NOT in dist — needs rebuild"
  fi
else
  echo "no dist dir — dev server likely running"
fi

echo ""
echo "=== SERVER STATUS ==="
ps aux | grep -E "vite|node.*server" | grep -v grep | head -5

echo ""
echo "=== LAST 5 LINES OF TARGET ==="
tail -5 "$TARGET" 2>/dev/null
