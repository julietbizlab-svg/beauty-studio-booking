-- Migration: 0017_owner_hub
-- Purpose: multi-tenant owner hub identity, plan capabilities and one-time
--          staff invitations. Raw invite tokens and LINE channel secrets are
--          never stored in D1.

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_tenant_id_id
    ON staff (tenant_id, id);

CREATE TABLE IF NOT EXISTS staff_line_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    staff_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    line_user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked')),
    linked_at TEXT NOT NULL,
    last_seen_at TEXT,
    UNIQUE (tenant_id, staff_id),
    UNIQUE (tenant_id, provider_id, line_user_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, staff_id)
        REFERENCES staff(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_staff_line_identity
    ON staff_line_accounts (provider_id, line_user_id, status);

CREATE TABLE IF NOT EXISTS tenant_features (
    tenant_id TEXT PRIMARY KEY,
    plan_code TEXT NOT NULL DEFAULT 'standard'
        CHECK (plan_code IN ('standard', 'flagship')),
    customer_import_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (customer_import_enabled IN (0, 1)),
    customer_export_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (customer_export_enabled IN (0, 1)),
    customer_ai_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (customer_ai_enabled IN (0, 1)),
    owner_ai_enabled INTEGER NOT NULL DEFAULT 0
        CHECK (owner_ai_enabled IN (0, 1)),
    updated_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO tenant_features (
    tenant_id, plan_code, customer_import_enabled,
    customer_export_enabled, customer_ai_enabled, owner_ai_enabled, updated_at
)
SELECT id, 'standard', 0, 0, 0, 0,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM tenants;

CREATE TABLE IF NOT EXISTS owner_access_invites (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    staff_id TEXT NOT NULL,
    token_hash TEXT NOT NULL
        CHECK (
            length(token_hash) = 64
            AND token_hash NOT GLOB '*[^0-9a-f]*'
        ),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'claimed', 'revoked', 'expired')),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    claimed_at TEXT,
    revoked_at TEXT,
    UNIQUE (token_hash),
    CHECK (status <> 'claimed' OR claimed_at IS NOT NULL),
    CHECK (status = 'claimed' OR claimed_at IS NULL),
    CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
    CHECK (status = 'revoked' OR revoked_at IS NULL),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, staff_id)
        REFERENCES staff(tenant_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_invite_one_active
    ON owner_access_invites (tenant_id, staff_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_owner_invites_expiry
    ON owner_access_invites (status, expires_at);

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0017_owner_hub',
    'Owner hub LINE identities, tenant plans and one-time staff invitations',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
