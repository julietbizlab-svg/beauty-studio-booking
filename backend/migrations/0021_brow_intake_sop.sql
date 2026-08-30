CREATE TABLE brow_intake_sessions (
    id TEXT NOT NULL UNIQUE,
    tenant_id TEXT NOT NULL,
    line_user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','paused','pending_human_review','approved','need_more_information','temporarily_unavailable','contact_manually')),
    current_step TEXT NOT NULL,
    answers_json TEXT NOT NULL DEFAULT '{}',
    manual_review_required INTEGER NOT NULL DEFAULT 0 CHECK (manual_review_required IN (0,1)),
    booking_route TEXT NOT NULL DEFAULT '一般人工審核'
        CHECK (booking_route IN ('一般人工審核','優先人工審核','暫停預約')),
    health_consent_at TEXT,
    submitted_at TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, line_user_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

CREATE INDEX idx_brow_intake_review_queue
ON brow_intake_sessions (tenant_id, status, updated_at DESC);

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES ('0021_brow_intake_sop', 'Stateful brow new-customer assessment SOP',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
