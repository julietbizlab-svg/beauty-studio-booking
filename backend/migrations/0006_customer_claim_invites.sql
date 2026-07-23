-- Migration: 0006_customer_claim_invites
-- Branch: v2-d1
-- Purpose: customer_claim_invites — one-time invite tokens that let an
--          imported / unlinked customer claim their record with LINE.
--          The owner generates an invite (link + QR); the customer opens
--          it in LINE and, after LIFF ID-token verification, the backend
--          links line_accounts to the customer and marks the invite used.
-- Privacy / security rules:
--          * NEVER store the raw invite token — token_hash keeps only the
--            SHA-256 hex of the token.
--          * NEVER store LINE user ids here; claimed_line_account_id
--            references line_accounts(id) (an opaque uuid) for audit.
--          * No customer names / phones / birthdays / notes / secrets.
-- Depends on: 0001_init_core.sql (tenants, customers, line_accounts,
--             staff, schema_versions), 0005_customer_import.sql
--             (uq_staff_tenant_id_id for the tenant-scoped staff FK)
-- Time storage rule: UTC ISO-8601 text, e.g. 2026-07-19T14:30:00.000Z

-- 1. Composite unique index on customers so invites can use a
--    tenant-scoped composite FK (prevents a tenant-A invite from
--    referencing a tenant-B customer).
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_id_id
    ON customers (tenant_id, id);

-- 2. One-time claim invites.
CREATE TABLE IF NOT EXISTS customer_claim_invites (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    token_hash TEXT NOT NULL
        -- SHA-256 hex only: exactly 64 chars, lowercase 0-9a-f
        -- (GLOB is case-sensitive, so uppercase hex is rejected)
        CHECK (
            length(token_hash) = 64
            AND token_hash NOT GLOB '*[^0-9a-f]*'
        ),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'claimed', 'revoked', 'expired')),
    expires_at TEXT NOT NULL,
    created_by_staff_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    claimed_at TEXT,
    -- Audit reference to the created line_accounts row (opaque uuid);
    -- deliberately NOT the LINE user id.
    claimed_line_account_id TEXT,
    revoked_at TEXT,
    -- token_hash must be unique per tenant (claim lookup key)
    UNIQUE (tenant_id, token_hash),
    -- Consistency: claimed invites carry claimed_at + line account ref;
    -- all other states must not.
    CHECK (status <> 'claimed' OR claimed_at IS NOT NULL),
    CHECK (status = 'claimed' OR claimed_at IS NULL),
    CHECK (status <> 'claimed' OR claimed_line_account_id IS NOT NULL),
    CHECK (status = 'claimed' OR claimed_line_account_id IS NULL),
    -- Consistency: revoked invites carry revoked_at; others must not.
    CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
    CHECK (status = 'revoked' OR revoked_at IS NULL),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, customer_id)
        REFERENCES customers(tenant_id, id)
        ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, created_by_staff_id)
        REFERENCES staff(tenant_id, id)
        ON DELETE RESTRICT,
    FOREIGN KEY (claimed_line_account_id) REFERENCES line_accounts(id)
        ON DELETE SET NULL
);

-- 3. A customer may only have ONE active invite at a time
--    (SQLite partial unique index; supported by D1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_claim_invites_one_active
    ON customer_claim_invites (tenant_id, customer_id)
    WHERE status = 'active';

-- 4. Owner-facing lookup: latest invite per customer.
CREATE INDEX IF NOT EXISTS idx_claim_invites_tenant_customer_created
    ON customer_claim_invites (tenant_id, customer_id, created_at DESC);

-- Schema metadata
INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0006_customer_claim_invites',
    'One-time LINE claim invites for imported / unlinked customers (token hash only)',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
