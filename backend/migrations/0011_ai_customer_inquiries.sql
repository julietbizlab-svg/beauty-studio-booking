-- Migration: 0011_ai_customer_inquiries
-- Purpose: Persist v2-test customer AI inquiries so the owner AI secretary
--          can report new questions and track follow-up status.
-- Privacy: tenant scoped; raw messages expire after 90 days by application policy.

CREATE TABLE IF NOT EXISTS ai_customer_inquiries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT,
    line_user_id TEXT NOT NULL,
    customer_message TEXT NOT NULL
        CHECK (length(customer_message) BETWEEN 1 AND 300),
    ai_reply TEXT NOT NULL
        CHECK (length(ai_reply) BETWEEN 1 AND 500),
    owner_summary TEXT NOT NULL
        CHECK (length(owner_summary) BETWEEN 1 AND 240),
    needs_owner_follow_up INTEGER NOT NULL DEFAULT 1
        CHECK (needs_owner_follow_up IN (0, 1)),
    recommended_service_id TEXT,
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'reviewed', 'resolved')),
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    resolved_at TEXT,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (recommended_service_id) REFERENCES services(id) ON DELETE SET NULL,
    CHECK (
      (status = 'new' AND reviewed_at IS NULL AND resolved_at IS NULL) OR
      (status = 'reviewed' AND reviewed_at IS NOT NULL AND resolved_at IS NULL) OR
      (status = 'resolved' AND reviewed_at IS NOT NULL AND resolved_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_ai_inquiries_tenant_status_created
    ON ai_customer_inquiries (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_inquiries_tenant_customer_created
    ON ai_customer_inquiries (tenant_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_inquiries_tenant_expires
    ON ai_customer_inquiries (tenant_id, expires_at);

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0011_ai_customer_inquiries',
    'Customer AI inquiry reports for owner secretary workflow',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
