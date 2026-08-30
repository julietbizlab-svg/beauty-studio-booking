ALTER TABLE brow_intake_sessions ADD COLUMN photo_requested INTEGER NOT NULL DEFAULT 0
    CHECK (photo_requested IN (0,1));
ALTER TABLE brow_intake_sessions ADD COLUMN photo_request_note TEXT NOT NULL DEFAULT '';

CREATE TABLE brow_intake_photos (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('front','left','right')),
    object_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    created_at TEXT NOT NULL,
    UNIQUE (tenant_id, session_id, kind),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (session_id) REFERENCES brow_intake_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_brow_intake_photos_session
ON brow_intake_photos (tenant_id, session_id, created_at);

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES ('0022_brow_intake_photos', 'Private pre-booking brow intake photo requests and uploads',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
