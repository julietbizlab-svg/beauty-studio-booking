-- Customer deposit transfer report for manual owner verification.
ALTER TABLE bookings ADD COLUMN deposit_transfer_last5 TEXT
    CHECK (deposit_transfer_last5 IS NULL OR deposit_transfer_last5 GLOB '[0-9][0-9][0-9][0-9][0-9]');
ALTER TABLE bookings ADD COLUMN deposit_reported_at TEXT;

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0014_deposit_transfer_report',
    'Customer deposit transfer last-five report',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
