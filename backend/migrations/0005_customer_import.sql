-- Migration: 0005_customer_import
-- Branch: v2-d1
-- Purpose: customer_import_batches — one row per owner CSV import batch,
--          providing idempotency (UNIQUE tenant_id + content_hash) and an
--          audit anchor for spreadsheet imports. Batch metadata only.
-- Privacy: this table must NEVER store the raw CSV text, the canonical
--          serialization string, customer names / phones / birthdays /
--          notes, LINE user ids, tokens or secrets. content_hash stores
--          only the SHA-256 hex of the canonical serialization.
-- D1 batch limits (confirm before implementing the commit API in
-- Phase 3b-2): the official commit is provisionally capped at 100 rows
-- per batch; the Phase 3a parser may still PREVIEW up to 500 rows.
-- When a file exceeds the commit cap, the future API must ask the owner
-- to split the import into smaller batches.
-- Depends on: 0001_init_core.sql (tenants, staff, schema_versions)
-- Time storage rule: UTC ISO-8601 text, e.g. 2026-07-17T14:30:00.000Z

-- 1. Composite unique index on staff so the batches table can use a
--    tenant-scoped composite FK (prevents a tenant-A batch from
--    referencing a tenant-B staff member).
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_tenant_id_id
    ON staff (tenant_id, id);

-- 2. Customer import batches: idempotency + audit anchor per CSV import.
CREATE TABLE IF NOT EXISTS customer_import_batches (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    content_hash TEXT NOT NULL
        -- SHA-256 hex only: exactly 64 chars, lowercase 0-9a-f
        -- (GLOB is case-sensitive, so uppercase hex is rejected)
        CHECK (
            length(content_hash) = 64
            AND content_hash NOT GLOB '*[^0-9a-f]*'
        ),
    schema_version TEXT NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('processing', 'committed', 'failed')),
    total_rows INTEGER NOT NULL
        CHECK (total_rows >= 1 AND total_rows <= 500),
    created_count INTEGER NOT NULL CHECK (created_count >= 0),
    skipped_count INTEGER NOT NULL CHECK (skipped_count >= 0),
    conflict_count INTEGER NOT NULL CHECK (conflict_count >= 0),
    warning_count INTEGER NOT NULL CHECK (warning_count >= 0),
    created_by_staff_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    committed_at TEXT,
    UNIQUE (tenant_id, content_hash),
    -- Consistency: processed rows can never exceed the batch size
    CHECK (created_count + skipped_count + conflict_count <= total_rows),
    CHECK (warning_count <= total_rows),
    -- Consistency: a committed batch must account for every row
    CHECK (
        status <> 'committed'
        OR created_count + skipped_count + conflict_count = total_rows
    ),
    -- Consistency: committed batches must record committed_at;
    -- processing / failed batches must NOT carry committed_at
    CHECK (status <> 'committed' OR committed_at IS NOT NULL),
    CHECK (status = 'committed' OR committed_at IS NULL),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, created_by_staff_id)
        REFERENCES staff(tenant_id, id)
        ON DELETE RESTRICT
);

-- Indexes for the owner-facing batch history views
CREATE INDEX IF NOT EXISTS idx_import_batches_tenant_created
    ON customer_import_batches (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_batches_tenant_status_created
    ON customer_import_batches (tenant_id, status, created_at DESC);

-- Schema metadata
INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0005_customer_import',
    'Customer import batches: idempotency and audit anchor for CSV imports',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
