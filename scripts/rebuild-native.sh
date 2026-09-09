#!/bin/bash
# rebuild-native.sh
# Rebuilds the better-sqlite3 native binary for the current machine.
# Run this once on any new machine after cloning / pnpm install.
#
# Usage:
#   chmod +x rebuild-native.sh
#   ./rebuild-native.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  BetOnMe — native binary rebuild"
echo "  node $(node --version) | $(uname -s) $(uname -m)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. Make sure node_modules exist ──────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "→ node_modules not found — running pnpm install first..."
  pnpm install
  echo ""
fi

# ── 2. Find better-sqlite3 source dir ────────────────────────────────────────
BSQ_DIR=$(find node_modules/.pnpm -maxdepth 4 -type d -name "better-sqlite3" 2>/dev/null | grep "node_modules/better-sqlite3$" | head -1)

if [ -z "$BSQ_DIR" ]; then
  echo "✗ Could not find better-sqlite3 in node_modules/.pnpm"
  echo "  Try: pnpm install"
  exit 1
fi

echo "→ Found: $BSQ_DIR"
echo "→ Building native binary (this takes ~1-2 min)..."
echo ""

# ── 3. Build ──────────────────────────────────────────────────────────────────
cd "$BSQ_DIR"
npm run build-release

# ── 4. Verify ─────────────────────────────────────────────────────────────────
BINARY="$BSQ_DIR/build/Release/better_sqlite3.node"
if [ ! -f "$BINARY" ]; then
  echo ""
  echo "✗ Build finished but binary not found at:"
  echo "  $BINARY"
  exit 1
fi

echo ""
echo "✓ Binary built: $BINARY"

# ── 5. Quick smoke test ───────────────────────────────────────────────────────
cd "$SCRIPT_DIR"
echo ""
echo "→ Running smoke test against betonme.db..."

node --input-type=module << 'EOF'
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, 'db', 'betonme.db')

if (!fs.existsSync(dbPath)) {
  console.log('⚠  db/betonme.db not found — binary works but no DB to test against')
  console.log('   Run: node db/migrate.js  to create it from savedata.json')
  process.exit(0)
}

const db = new Database(dbPath, { readonly: true })
const picks   = db.prepare('SELECT COUNT(*) as c FROM picks').get()
const parlays = db.prepare('SELECT COUNT(*) as c FROM parlays').get()
const props   = db.prepare('SELECT COUNT(*) as c FROM props').get()
db.close()

console.log(`✓ DB OK — picks: ${picks.c} | parlays: ${parlays.c} | props: ${props.c}`)
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All done. Run ./startbetonme.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
