-- Migration: 0004_ops_tables
-- Branch: v2-d1
-- Purpose: Operational tables — consent_records (privacy consent history),
--          notifications (LINE-first delivery log) and audit_logs
--          (append-only operational trace).
-- Source: extracted from juliet-ai-os-d1-schema-v1.0.0.sql (draft, PRAGMA
--         removed) with added status-consistency CHECK constraints.
--         Schema only; the sole INSERT below is the schema_versions record.
--         No credentials are stored: LINE access tokens and other secrets
--         live only in .dev.vars / Cloudflare Secrets, never in D1.
-- Depends on: 0001_init_core.sql (tenants, customers, schema_versions),
--             0002_bookings.sql (bookings)
-- Time storage rule: UTC ISO-8601 text, e.g. 2026-07-17T14:30:00.000Z

-- 1. Consent records: privacy, marketing and future AI personalization.
--    Grant/revoke history; one row per consent event.
CREATE TABLE IF NOT EXISTS consent_records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    consent_type TEXT NOT NULL
        CHECK (consent_type IN (
            'privacy_policy', 'terms_of_service', 'marketing',
            'data_analysis', 'ai_personalization'
        )),
    status TEXT NOT NULL
        CHECK (status IN ('granted', 'denied', 'revoked')),
    policy_version TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'line'
        CHECK (source IN ('line', 'web', 'paper', 'staff', 'import')),
    ip_address TEXT,
    user_agent TEXT,
    granted_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    -- Consistency: a granted consent must record when it was granted
    CHECK (status <> 'granted' OR granted_at IS NOT NULL),
    -- Consistency: a revoked consent must record both the original grant
    -- time and the revocation time
    CHECK (
        status <> 'revoked'
        OR (granted_at IS NOT NULL AND revoked_at IS NOT NULL)
    ),
    -- Consistency: only revoked rows may carry revoked_at
    CHECK (status = 'revoked' OR revoked_at IS NULL),
    -- Consistency: a denied consent was never granted nor revoked
    CHECK (
        status <> 'denied'
        OR (granted_at IS NULL AND revoked_at IS NULL)
    ),
    -- Consistency: revocation cannot precede the grant
    CHECK (
        granted_at IS NULL
        OR revoked_at IS NULL
        OR revoked_at >= granted_at
    ),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

-- 2. Notification delivery log (LINE-first, other channels reserved).
--    template_code identifies the notification type; error_code /
--    error_message record failure reasons. No tokens or credentials here.
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT,
    booking_id TEXT,
    channel TEXT NOT NULL DEFAULT 'line'
        CHECK (channel IN ('line', 'email', 'sms', 'push', 'internal')),
    template_code TEXT,
    recipient TEXT,
    subject TEXT,
    content_snapshot TEXT,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'cancelled')),
    scheduled_at TEXT,
    sent_at TEXT,
    delivered_at TEXT,
    failed_at TEXT,
    provider_message_id TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    -- Consistency: sent/delivered notifications must record sent_at
    CHECK (
        status NOT IN ('sent', 'delivered')
        OR sent_at IS NOT NULL
    ),
    -- Consistency: delivered notifications must record delivered_at
    CHECK (status <> 'delivered' OR delivered_at IS NOT NULL),
    -- Consistency: failed notifications must record failed_at and a reason
    CHECK (
        status <> 'failed'
        OR (
            failed_at IS NOT NULL
            AND (error_code IS NOT NULL OR error_message IS NOT NULL)
        )
    ),
    -- Consistency: non-failed notifications must not carry failure data
    CHECK (
        status = 'failed'
        OR (failed_at IS NULL AND error_code IS NULL AND error_message IS NULL)
    ),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);

-- 3. Audit log: append-only operational trace. Application code must only
--    INSERT into this table (no UPDATE/DELETE); before_json / after_json /
--    metadata_json must never contain tokens, secrets or credentials.
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    actor_type TEXT NOT NULL
        CHECK (actor_type IN ('customer', 'staff', 'system', 'ai')),
    actor_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    request_id TEXT,
    source TEXT NOT NULL DEFAULT 'api'
        CHECK (source IN ('line', 'admin', 'api', 'migration', 'system')),
    before_json TEXT,
    after_json TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Indexes for consent lookup, notification scheduling and audit queries
CREATE INDEX IF NOT EXISTS idx_consent_customer_type_created
    ON consent_records (tenant_id, customer_id, consent_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_schedule_status
    ON notifications (tenant_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_notifications_booking
    ON notifications (tenant_id, booking_id);

CREATE INDEX IF NOT EXISTS idx_notifications_customer_created
    ON notifications (tenant_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_entity_created
    ON audit_logs (tenant_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_request
    ON audit_logs (request_id);

-- Schema metadata
INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0004_ops_tables',
    'Operational tables: consent_records, notifications, audit_logs',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
