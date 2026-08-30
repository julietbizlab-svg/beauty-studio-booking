-- Migration: 0019_flagship_trial
-- One 14-day flagship trial per tenant, starting only when the owner claims it.

ALTER TABLE tenant_subscriptions ADD COLUMN trial_used INTEGER NOT NULL DEFAULT 0
    CHECK (trial_used IN (0, 1));

CREATE TABLE IF NOT EXISTS tenant_trial_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('line_user', 'staff')),
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('started', 'extended', 'converted')),
    starts_on TEXT,
    ends_on TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_trial_events_tenant_created
    ON tenant_trial_events (tenant_id, created_at DESC);

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0019_flagship_trial',
    '14-day flagship trial starts at first owner claim and can only be extended by platform',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
