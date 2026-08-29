-- Migration: 0016_ai_inquiry_owner_replies
-- Purpose: Store owner-authored replies to customer AI inquiries and their
--          LINE delivery result without exposing LINE user ids to the UI.

CREATE TABLE IF NOT EXISTS ai_inquiry_owner_replies (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    inquiry_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    client_request_id TEXT NOT NULL,
    reply_text TEXT NOT NULL
        CHECK (length(reply_text) BETWEEN 1 AND 1000),
    status TEXT NOT NULL DEFAULT 'sending'
        CHECK (status IN ('sending', 'sent', 'failed')),
    created_at TEXT NOT NULL,
    sent_at TEXT,
    failed_at TEXT,
    error_code TEXT,
    CHECK (
      (status = 'sending' AND sent_at IS NULL AND failed_at IS NULL AND error_code IS NULL) OR
      (status = 'sent' AND sent_at IS NOT NULL AND failed_at IS NULL AND error_code IS NULL) OR
      (status = 'failed' AND sent_at IS NULL AND failed_at IS NOT NULL AND error_code IS NOT NULL)
    ),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (inquiry_id) REFERENCES ai_customer_inquiries(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_inquiry_replies_tenant_request
    ON ai_inquiry_owner_replies (tenant_id, client_request_id);

CREATE INDEX IF NOT EXISTS idx_ai_inquiry_replies_inquiry_created
    ON ai_inquiry_owner_replies (tenant_id, inquiry_id, created_at DESC);

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0016_ai_inquiry_owner_replies',
    'Owner replies to AI inquiries with LINE delivery status and idempotency',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
