#!/usr/bin/env bash
set -euo pipefail

backup_dir="${CRYOBOX_BACKUP_DIR:-/var/backups/cryobox}"
retention_days="${CRYOBOX_BACKUP_RETENTION_DAYS:-30}"
mkdir -p "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$backup_dir/cryobox-$timestamp.sql.gz"

docker compose exec -T db pg_dump --clean --if-exists -U "${POSTGRES_USER:-cryobox}" "${POSTGRES_DB:-cryobox}" | gzip -9 > "$file"
find "$backup_dir" -type f -name 'cryobox-*.sql.gz' -mtime "+$retention_days" -delete
echo "created $file"

# If OSS backup is configured, set CRYOBOX_OSS_URI and install ossutil separately.
if [[ -n "${CRYOBOX_OSS_URI:-}" ]]; then
  command -v ossutil >/dev/null 2>&1 || { echo "CRYOBOX_OSS_URI is set but ossutil is not installed" >&2; exit 1; }
  ossutil cp "$file" "$CRYOBOX_OSS_URI/"
fi
