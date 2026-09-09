#!/bin/bash
# db/backup.sh
# Daily SQLite backup with 7-day rotation
# Cron: 0 2 * * * /path/to/betonme/db/backup.sh

DB_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$DB_DIR/backups"
DB_FILE="$DB_DIR/betonme.db"
STAMP=$(date +%Y-%m-%d)
DEST="$BACKUP_DIR/betonme.$STAMP.db"
MAX_BACKUPS=7
LOG="$DB_DIR/backup.log"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [WARN] betonme.db not found — skipping" >> "$LOG"
  exit 0
fi

if [ -f "$DEST" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [INFO] Backup already exists for $STAMP — skipping" >> "$LOG"
  exit 0
fi

cp "$DB_FILE" "$DEST"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [INFO] Backup written -> betonme.$STAMP.db" >> "$LOG"

# Rotate — keep only last 7
ls -1 "$BACKUP_DIR"/betonme.*.db 2>/dev/null | sort | head -n -$MAX_BACKUPS | while read f; do
  rm "$f"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [INFO] Pruned old backup: $(basename $f)" >> "$LOG"
done