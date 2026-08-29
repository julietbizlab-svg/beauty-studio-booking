-- Booking review intake and customer-supplied review photos.

CREATE TABLE booking_review_intakes (
    booking_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    surgery_history TEXT NOT NULL DEFAULT '',
    disease_history TEXT NOT NULL DEFAULT '',
    last_treatment_at TEXT,
    customer_note TEXT NOT NULL DEFAULT '',
    photo_requested INTEGER NOT NULL DEFAULT 0 CHECK (photo_requested IN (0, 1)),
    photo_request_note TEXT NOT NULL DEFAULT '',
    submitted_at TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id, booking_id)
        REFERENCES bookings(tenant_id, id)
        ON DELETE CASCADE
);

CREATE TABLE booking_review_photos (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    booking_id TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (tenant_id, booking_id)
        REFERENCES bookings(tenant_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX idx_booking_review_photos_tenant_booking
    ON booking_review_photos (tenant_id, booking_id, created_at);

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0013_booking_review_intake',
    'Health intake and private customer review photos',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
