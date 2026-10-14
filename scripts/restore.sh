#!/usr/bin/env bash
# Restores a pg_dump custom-format backup into the portal database. Stop the portal first.
# Usage: scripts/restore.sh backups/los_stage_portal_20261015_0200.dump
set -euo pipefail
FILE="${1:?Usage: restore.sh <backup.dump>}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
URL="$(grep -E '^\s*DATABASE_URL\s*=' "$DIR/server/.env" | head -1 | sed -E 's/^\s*DATABASE_URL\s*=\s*//; s/^"//; s/"$//')"
DBURL="${URL%%\?*}"
read -r -p "This will REPLACE the data in ${DBURL##*@} with $FILE. Type YES to continue: " ANSWER
[ "$ANSWER" = "YES" ] || { echo "Cancelled."; exit 1; }
pg_restore --clean --if-exists --no-owner --single-transaction --dbname "$DBURL" "$FILE"
echo "Restore complete."
