#!/bin/bash
# Docker MCP Web Manager - Backup Script
# Automated database and application data backup

set -euo pipefail

# Configuration
BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}

# Database configuration
DB_HOST=${DB_HOST:-db}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${POSTGRES_DB:-mcp_manager}
DB_USER=${POSTGRES_USER:-mcp_user}
DB_PASSWORD=${POSTGRES_PASSWORD:-secure_password_change_this}

# Logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Database backup
log "Starting database backup..."
if PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/db_backup_$TIMESTAMP.sql.gz"; then
    log "Database backup completed: db_backup_$TIMESTAMP.sql.gz"
else
    error "Database backup failed"
    exit 1
fi

# Application data backup (if exists)
if [ -d "/app/data" ]; then
    log "Starting application data backup..."
    if tar -czf "$BACKUP_DIR/data_backup_$TIMESTAMP.tar.gz" -C /app data; then
        log "Application data backup completed: data_backup_$TIMESTAMP.tar.gz"
    else
        error "Application data backup failed"
        exit 1
    fi
fi

# Configuration backup
if [ -f "/app/.env.production" ]; then
    log "Starting configuration backup..."
    if cp "/app/.env.production" "$BACKUP_DIR/env_backup_$TIMESTAMP"; then
        log "Configuration backup completed: env_backup_$TIMESTAMP"
    else
        error "Configuration backup failed"
        exit 1
    fi
fi

# Clean up old backups
log "Cleaning up old backups (retention: $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "*backup*" -type f -mtime +$RETENTION_DAYS -delete

# Calculate backup sizes
DB_SIZE=$(du -sh "$BACKUP_DIR/db_backup_$TIMESTAMP.sql.gz" 2>/dev/null | cut -f1 || echo "N/A")
DATA_SIZE=$(du -sh "$BACKUP_DIR/data_backup_$TIMESTAMP.tar.gz" 2>/dev/null | cut -f1 || echo "N/A")
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "*backup*" -type f | wc -l)

log "Backup completed successfully!"
log "Database backup size: $DB_SIZE"
log "Application data backup size: $DATA_SIZE"
log "Total backups retained: $TOTAL_BACKUPS"

# Optional: Send notification (if webhook URL is configured)
if [ -n "${BACKUP_WEBHOOK_URL:-}" ]; then
    curl -X POST "$BACKUP_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"text\": \"Docker MCP Web Manager backup completed\",
            \"timestamp\": \"$TIMESTAMP\",
            \"database_size\": \"$DB_SIZE\",
            \"data_size\": \"$DATA_SIZE\",
            \"total_backups\": $TOTAL_BACKUPS
        }" || log "Failed to send backup notification"
fi

exit 0