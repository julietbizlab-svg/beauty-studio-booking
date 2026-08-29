-- Migration: 0018_subscription_management
-- Platform-only subscription lifecycle. Plan prices are intentionally not stored
-- here because commercial pricing must come from the signed contract or quote.

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    tenant_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'unconfigured'
        CHECK (status IN ('unconfigured', 'trial', 'active', 'expired')),
    starts_on TEXT,
    ends_on TEXT,
    pending_plan_code TEXT
        CHECK (pending_plan_code IS NULL OR pending_plan_code IN ('standard', 'flagship')),
    pending_effective_on TEXT,
    updated_at TEXT NOT NULL,
    CHECK (
        (pending_plan_code IS NULL AND pending_effective_on IS NULL)
        OR (pending_plan_code IS NOT NULL AND pending_effective_on IS NOT NULL)
    ),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS tenant_subscription_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    actor_staff_id TEXT NOT NULL,
    action TEXT NOT NULL
        CHECK (action IN ('upgrade', 'renewal', 'downgrade_scheduled')),
    from_plan_code TEXT NOT NULL CHECK (from_plan_code IN ('standard', 'flagship')),
    to_plan_code TEXT NOT NULL CHECK (to_plan_code IN ('standard', 'flagship')),
    effective_on TEXT NOT NULL,
    new_ends_on TEXT,
    payment_confirmed INTEGER NOT NULL CHECK (payment_confirmed IN (0, 1)),
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_tenant_created
    ON tenant_subscription_events (tenant_id, created_at DESC);

INSERT OR IGNORE INTO tenant_subscriptions (tenant_id, status, updated_at)
SELECT id, CASE WHEN status IN ('trial', 'active') THEN status ELSE 'unconfigured' END,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM tenants;

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0018_subscription_management',
    'Platform-only upgrades, renewals and end-of-term downgrades',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
