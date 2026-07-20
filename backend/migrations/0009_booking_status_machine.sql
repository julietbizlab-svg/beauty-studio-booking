-- Migration: 0009_booking_status_machine
-- Branch: v2-d1
-- Purpose: Expand bookings.status and booking_status_logs CHECK constraints
--          for Phase 1 state machine (draft, held, pending_review, etc.)
-- Depends on: 0001～0008
-- Note: SQLite cannot ALTER CHECK; rebuild tables preserving data.
-- FK strategy: PRAGMA defer_foreign_keys = ON (D1 migration runner owns the transaction).
-- _new child tables reference bookings_new until rename.

PRAGMA defer_foreign_keys = ON;

-- ── 1. Create all _new tables ───────────────────────────────────────

CREATE TABLE bookings_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    staff_id TEXT,
    booking_no TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'draft', 'held', 'pending_review', 'pending_customer_confirmation',
            'pending', 'confirmed', 'checked_in', 'completed',
            'cancelled_by_customer', 'cancelled_by_store',
            'expired', 'no_show', 'rescheduled'
        )),
    source TEXT NOT NULL DEFAULT 'line'
        CHECK (source IN ('line', 'admin', 'web', 'import', 'api')),
    customer_note TEXT,
    internal_note TEXT,
    cancellation_reason_code TEXT,
    cancellation_note TEXT,
    cancelled_at TEXT,
    completed_at TEXT,
    parent_booking_id TEXT,
    created_by_type TEXT NOT NULL DEFAULT 'customer'
        CHECK (created_by_type IN ('customer', 'staff', 'system', 'ai')),
    created_by_id TEXT,
    cancellation_notice_days_snapshot INTEGER
        CHECK (
            cancellation_notice_days_snapshot IS NULL
            OR (cancellation_notice_days_snapshot >= 0
                AND cancellation_notice_days_snapshot <= 30)
        ),
    cancellation_deadline_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, booking_no),
    CHECK (end_at > start_at),
    CHECK (
        status <> 'cancelled_by_customer'
        OR cancelled_at IS NOT NULL
    ),
    CHECK (
        status <> 'cancelled_by_store'
        OR (
            cancelled_at IS NOT NULL
            AND cancellation_note IS NOT NULL
            AND trim(cancellation_note) <> ''
        )
    ),
    CHECK (
        status <> 'completed'
        OR completed_at IS NOT NULL
    ),
    CHECK (
        status IN ('cancelled_by_customer', 'cancelled_by_store')
        OR (
            cancelled_at IS NULL
            AND cancellation_reason_code IS NULL
            AND cancellation_note IS NULL
        )
    ),
    CHECK (
        status = 'completed'
        OR completed_at IS NULL
    ),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_booking_id) REFERENCES bookings_new(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_bookings_new_tenant_id_id
    ON bookings_new (tenant_id, id);

CREATE TABLE booking_items_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    booking_id TEXT NOT NULL,
    service_id TEXT,
    service_name_snapshot TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_amount INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_amount >= 0),
    discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    final_amount INTEGER NOT NULL DEFAULT 0 CHECK (final_amount >= 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (booking_id) REFERENCES bookings_new(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
);

CREATE TABLE booking_status_logs_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    booking_id TEXT NOT NULL,
    from_status TEXT
        CHECK (from_status IS NULL OR from_status IN (
            'draft', 'held', 'pending_review', 'pending_customer_confirmation',
            'pending', 'confirmed', 'checked_in', 'completed',
            'cancelled_by_customer', 'cancelled_by_store',
            'expired', 'no_show', 'rescheduled'
        )),
    to_status TEXT NOT NULL
        CHECK (to_status IN (
            'draft', 'held', 'pending_review', 'pending_customer_confirmation',
            'pending', 'confirmed', 'checked_in', 'completed',
            'cancelled_by_customer', 'cancelled_by_store',
            'expired', 'no_show', 'rescheduled'
        )),
    reason_code TEXT,
    note TEXT,
    changed_by_type TEXT NOT NULL DEFAULT 'customer'
        CHECK (changed_by_type IN ('customer', 'staff', 'system', 'ai')),
    changed_by_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (booking_id) REFERENCES bookings_new(id) ON DELETE CASCADE
);

CREATE TABLE customer_photo_sets_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    booking_id TEXT,
    title TEXT,
    captured_at TEXT,
    created_by_staff_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, customer_id)
        REFERENCES customers(tenant_id, id)
        ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, booking_id)
        REFERENCES bookings_new(tenant_id, id)
        ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, created_by_staff_id)
        REFERENCES staff(tenant_id, id)
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uq_photo_sets_new_tenant_id_id
    ON customer_photo_sets_new (tenant_id, id);

CREATE TABLE customer_photos_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    photo_set_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    kind TEXT NOT NULL
        CHECK (kind IN ('before', 'after')),
    object_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL
        CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    byte_size INTEGER NOT NULL
        CHECK (byte_size > 0 AND byte_size <= 5242880),
    width INTEGER
        CHECK (width IS NULL OR (width > 0 AND width <= 10000)),
    height INTEGER
        CHECK (height IS NULL OR (height > 0 AND height <= 10000)),
    created_by_staff_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, photo_set_id)
        REFERENCES customer_photo_sets_new(tenant_id, id)
        ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, customer_id)
        REFERENCES customers(tenant_id, id)
        ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, created_by_staff_id)
        REFERENCES staff(tenant_id, id)
        ON DELETE RESTRICT
);

CREATE TABLE notifications_new (
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
    CHECK (
        status NOT IN ('sent', 'delivered')
        OR sent_at IS NOT NULL
    ),
    CHECK (
        status <> 'delivered'
        OR delivered_at IS NOT NULL
    ),
    CHECK (
        status <> 'failed'
        OR (
            failed_at IS NOT NULL
            AND (error_code IS NOT NULL OR error_message IS NOT NULL)
        )
    ),
    CHECK (
        status = 'failed'
        OR (failed_at IS NULL AND error_code IS NULL AND error_message IS NULL)
    ),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings_new(id) ON DELETE SET NULL
);

-- ── 2. Copy all data ────────────────────────────────────────────────

INSERT INTO bookings_new (
    id, tenant_id, location_id, customer_id, staff_id, booking_no,
    start_at, end_at, status, source, customer_note, internal_note,
    cancellation_reason_code, cancellation_note, cancelled_at, completed_at,
    parent_booking_id, created_by_type, created_by_id,
    cancellation_notice_days_snapshot, cancellation_deadline_at,
    created_at, updated_at
)
SELECT
    id, tenant_id, location_id, customer_id, staff_id, booking_no,
    start_at, end_at, status, source, customer_note, internal_note,
    cancellation_reason_code, cancellation_note, cancelled_at, completed_at,
    parent_booking_id, created_by_type, created_by_id,
    cancellation_notice_days_snapshot, cancellation_deadline_at,
    created_at, updated_at
FROM bookings;

INSERT INTO booking_items_new (
    id, tenant_id, booking_id, service_id, service_name_snapshot,
    duration_minutes, quantity, unit_price_amount, discount_amount,
    final_amount, sort_order, created_at
)
SELECT
    id, tenant_id, booking_id, service_id, service_name_snapshot,
    duration_minutes, quantity, unit_price_amount, discount_amount,
    final_amount, sort_order, created_at
FROM booking_items;

INSERT INTO booking_status_logs_new (
    id, tenant_id, booking_id, from_status, to_status,
    reason_code, note, changed_by_type, changed_by_id, created_at
)
SELECT
    id, tenant_id, booking_id, from_status, to_status,
    reason_code, note, changed_by_type, changed_by_id, created_at
FROM booking_status_logs;

INSERT INTO customer_photo_sets_new (
    id, tenant_id, customer_id, booking_id, title, captured_at,
    created_by_staff_id, created_at, updated_at, deleted_at
)
SELECT
    id, tenant_id, customer_id, booking_id, title, captured_at,
    created_by_staff_id, created_at, updated_at, deleted_at
FROM customer_photo_sets;

INSERT INTO customer_photos_new (
    id, tenant_id, photo_set_id, customer_id, kind, object_key, mime_type,
    byte_size, width, height, created_by_staff_id, created_at, deleted_at
)
SELECT
    id, tenant_id, photo_set_id, customer_id, kind, object_key, mime_type,
    byte_size, width, height, created_by_staff_id, created_at, deleted_at
FROM customer_photos;

INSERT INTO notifications_new (
    id, tenant_id, customer_id, booking_id, channel, template_code,
    recipient, subject, content_snapshot, status, scheduled_at,
    sent_at, delivered_at, failed_at, provider_message_id,
    error_code, error_message, created_at
)
SELECT
    id, tenant_id, customer_id, booking_id, channel, template_code,
    recipient, subject, content_snapshot, status, scheduled_at,
    sent_at, delivered_at, failed_at, provider_message_id,
    error_code, error_message, created_at
FROM notifications;

-- ── 3. Drop old child tables, then bookings ─────────────────────────
-- Deepest child first; notifications before bookings (ON DELETE SET NULL).

DROP TABLE customer_photos;
DROP TABLE customer_photo_sets;
DROP TABLE booking_items;
DROP TABLE booking_status_logs;
DROP TABLE notifications;
DROP TABLE bookings;

-- ── 4. Rename _new → formal names (parent → children) ───────────────

ALTER TABLE bookings_new RENAME TO bookings;
ALTER TABLE booking_items_new RENAME TO booking_items;
ALTER TABLE booking_status_logs_new RENAME TO booking_status_logs;
ALTER TABLE customer_photo_sets_new RENAME TO customer_photo_sets;
ALTER TABLE customer_photos_new RENAME TO customer_photos;
ALTER TABLE notifications_new RENAME TO notifications;

-- ── 5. Recreate indexes from 0002 / 0004 / 0007 ─────────────────────

CREATE INDEX IF NOT EXISTS idx_bookings_tenant_start
    ON bookings (tenant_id, start_at);

CREATE INDEX IF NOT EXISTS idx_bookings_tenant_location_start
    ON bookings (tenant_id, location_id, start_at);

CREATE INDEX IF NOT EXISTS idx_bookings_tenant_staff_start
    ON bookings (tenant_id, staff_id, start_at);

CREATE INDEX IF NOT EXISTS idx_bookings_tenant_customer_start
    ON bookings (tenant_id, customer_id, start_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_tenant_status_start
    ON bookings (tenant_id, status, start_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_tenant_id_id
    ON bookings (tenant_id, id);

CREATE INDEX IF NOT EXISTS idx_booking_items_booking
    ON booking_items (tenant_id, booking_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_booking_status_logs_booking_created
    ON booking_status_logs (tenant_id, booking_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_photo_sets_tenant_id_id
    ON customer_photo_sets (tenant_id, id);

CREATE INDEX IF NOT EXISTS idx_photo_sets_tenant_customer_created
    ON customer_photo_sets (tenant_id, customer_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_photos_active_kind
    ON customer_photos (tenant_id, photo_set_id, kind)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_photos_tenant_set
    ON customer_photos (tenant_id, photo_set_id);

CREATE INDEX IF NOT EXISTS idx_notifications_schedule_status
    ON notifications (tenant_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_notifications_booking
    ON notifications (tenant_id, booking_id);

CREATE INDEX IF NOT EXISTS idx_notifications_customer_created
    ON notifications (tenant_id, customer_id, created_at DESC);

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0009_booking_status_machine',
    'Expand booking status CHECK for Phase 1 state machine',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
