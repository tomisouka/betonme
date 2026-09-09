#!/usr/bin/env bash
# retire-savedata.sh
# Renames all savedata.json files to .retired so nothing can accidentally read them.
# Run from the project root.
# Safe to run multiple times — skips files already retired.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RENAMED=0
SKIPPED=0

rename_file() {
  local f="$1"
  local dest="${f}.retired"

  # Already retired
  if [[ "$f" == *.retired ]]; then
    return
  fi

  if [[ -f "$dest" ]]; then
    echo "  SKIP (dest exists): $f"
    ((SKIPPED++)) || true
    return
  fi

  mv "$f" "$dest"
  echo "  ✅ $f → $(basename "$dest")"
  ((RENAMED++)) || true
}

echo "=== Retiring savedata files in $ROOT ==="
echo ""

# Project root — all savedata*.json* files (but not already .retired)
while IFS= read -r -d '' f; do
  rename_file "$f"
done < <(find "$ROOT" -maxdepth 1 -name "savedata*.json*" ! -name "*.retired" -print0 | sort -z)

# savedata-backups/ directory
if [[ -d "$ROOT/savedata-backups" ]]; then
  echo ""
  echo "--- savedata-backups/ ---"
  while IFS= read -r -d '' f; do
    rename_file "$f"
  done < <(find "$ROOT/savedata-backups" -name "savedata*.json*" ! -name "*.retired" -print0 | sort -z)
fi

echo ""
echo "Done — $RENAMED renamed, $SKIPPED skipped."
echo "betonme.db (USE_DB=true) is now the sole source of truth."
