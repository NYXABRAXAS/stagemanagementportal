#!/usr/bin/env bash
# Backs up the portal database (pg_dump custom format) and keeps the newest $KEEP files.
# Usage: scripts/backup.sh [out_dir] [keep]      e.g. from cron: 0 2 * * * /opt/los-portal/scripts/backup.sh /var/backups/los-portal 30
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$DIR/backups}"
KEEP="${2:-30}"
URL="$(grep -E '^\s*DATABASE_URL\s*=' "$DIR/server/.env" | head -1 | sed -E 's/^\s*DATABASE_URL\s*=\s*//; s/^"//; s/"$//')"
DBURL="${URL%%\?*}"
DBNAME="${DBURL##*/}"
mkdir -p "$OUT"
FILE="$OUT/${DBNAME}_$(date +%Y%m%d_%H%M).dump"
pg_dump --format=custom --no-owner --file "$FILE" "$DBURL"
echo "Backup written: $FILE"
ls -1t "$OUT"/"${DBNAME}"_*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
