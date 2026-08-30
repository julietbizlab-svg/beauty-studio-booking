-- Owner acceptance starts the 24-hour deposit window.
ALTER TABLE bookings ADD COLUMN review_accepted_at TEXT;
ALTER TABLE bookings ADD COLUMN deposit_due_at TEXT;
ALTER TABLE bookings ADD COLUMN deposit_confirmed_at TEXT;

CREATE INDEX idx_bookings_tenant_pending_deposit_due
    ON bookings (tenant_id, status, deposit_due_at);

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0012_booking_review_deposit_deadline',
    'Owner review acceptance and 24-hour deposit deadline',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
