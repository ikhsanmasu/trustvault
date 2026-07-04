# InTrustVault — Database Backup & Recovery Runbook

## 1. Overview

Supabase provides automatic daily backups for Pro/Team plans. This runbook documents how to verify, restore, and manually trigger backups for disaster recovery.

### RPO (Recovery Point Objective)
- **Supabase Pro**: 24 hours (daily automated backups, point-in-time recovery)
- **Manual backup**: On-demand (recommended before major migrations)

### RTO (Recovery Time Objective)
- **Restore from Supabase backup**: ~30 minutes
- **Restore from manual pg_dump**: ~15 minutes

---

## 2. Automated Backups (Supabase Managed)

### 2a. Verification

```bash
# List available backups (requires Supabase CLI + access token)
supabase db backups list --project-ref $SUPABASE_PROJECT_REF
```

**Expected**: At least one backup within the last 24 hours.

### 2b. Restore from Supabase Backup

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → Project → Database → Backups
2. Select the desired backup
3. Click "Restore" → confirm

**⚠️ Warning**: Restoring overwrites the current database. All data since the backup will be lost.

---

## 3. Manual Backup (Pre-Migration Safety)

Run before applying new migrations in production:

```bash
# 1. Set environment variables
export SUPABASE_PROJECT_REF="your-project-ref"
export SUPABASE_DB_PASSWORD="your-db-password"

# 2. Dump the entire database
pg_dump \
  "postgresql://postgres.${SUPABASE_PROJECT_REF}:${SUPABASE_DB_PASSWORD}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" \
  --format=custom \
  --file="trustvault-backup-$(date +%Y%m%d-%H%M%S).dump" \
  --verbose

# 3. Verify the dump is valid
pg_restore --list "trustvault-backup-*.dump" | head -20
```

---

## 4. Backup Verification Script

Save as `scripts/verify-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file.dump>"
  exit 1
fi

echo "==> Verifying backup: $BACKUP_FILE"

# Check file exists and is non-empty
if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: File not found: $BACKUP_FILE"
  exit 1
fi

SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
if [ "$SIZE" -lt 1024 ]; then
  echo "ERROR: Backup file is too small ($SIZE bytes) — likely corrupt"
  exit 1
fi

# Check it's a valid pg_dump custom format
if ! pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1; then
  echo "ERROR: Not a valid pg_dump custom format"
  exit 1
fi

# List contained tables for audit
echo "Tables in backup:"
pg_restore --list "$BACKUP_FILE" | grep "TABLE DATA" | wc -l
echo "tables with data found"

echo "==> Backup verified successfully"
```

---

## 5. Critical Tables (Prioritized Restore)

If partial restore is needed, these tables are critical (ordered by business impact):

| Priority | Table | Contains |
|---|---|---|
| P0 | `tenants` | All tenant accounts |
| P0 | `profiles` | User-tenant links + RBAC roles |
| P0 | `documents` | Document metadata + hashes |
| P1 | `document_chunks` | RAG embeddings (recoverable via re-ingestion) |
| P1 | `shared_links` | Active share links |
| P2 | `chat_sessions` + `chat_messages` | Chat history |
| P2 | `agent_sessions` + `agent_messages` | Agent chat history |
| P2 | `agents` + `agent_documents` + `agent_channels` | Custom AI agents |
| P3 | `invitations` | Pending invitations |
| P3 | `llm_usage_log` | Usage audit trail |
| P3 | `labels` | Document labels |
| P3 | `document_labels` | Label assignments |

---

## 6. Storage Bucket Backup

Documents in `pdf-uploads` bucket are stored in Supabase Storage (S3-compatible).

```bash
# Sync storage bucket to local filesystem
supabase storage cp --recursive pdf-uploads ./storage-backup/ \
  --project-ref $SUPABASE_PROJECT_REF
```

---

## 7. Recovery Test Schedule

| Frequency | Action |
|---|---|
| **Monthly** | Restore latest Supabase backup to a fresh DB, run `vitest run` to verify integrity |
| **Pre-migration** | Manual pg_dump before applying new migrations |
| **Quarterly** | Full disaster recovery drill: restore DB + storage, verify API health endpoint |

---

## 8. Emergency Contacts

| Role | Contact |
|---|---|
| Database admin | [Fill in] |
| Supabase support | https://supabase.com/support |
| On-call engineer | [Fill in] |
