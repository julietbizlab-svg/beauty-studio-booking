-- Migration: 0002_bookings
-- Branch: v2-d1
-- Purpose: Booking tables (bookings, booking_items) plus booking_status_logs
--          for status-change history. Naming follows schema draft: bookings /
--          booking_items (not appointments).
-- Source: bookings / booking_items extracted from
--         juliet-ai-os-d1-schema-v1.0.0.sql (draft, PRAGMA removed);
--         booking_status_logs added per V2-D1-SQL-DRAFT-REVIEW.md gap analysis.
-- Depends on: 0001_init_core.sql (tenants, locations, customers, staff,
--             services, schema_versions)
-- Time storage rule: UTC ISO-8601 text, e.g. 2026-07-17T14:30:00.000Z
-- Money storage rule: integer in New Taiwan dollars

-- 1. Bookings: appointment header
--    Cancellation support: status distinguishes cancelled_by_customer vs
--    cancelled_by_store; cancellation_reason_code / cancellation_note /
--    cancelled_at record why and when.
CREATE TABLE IF NOT EXISTS bookings (
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
            'pending', 'confirmed', 'checked_in', 'completed',
            'cancelled_by_customer', 'cancelled_by_store',
            'no_show', 'rescheduled'
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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, booking_no),
    CHECK (end_at > start_at),
    -- Consistency: customer cancellation must record cancelled_at
    CHECK (
        status <> 'cancelled_by_customer'
        OR cancelled_at IS NOT NULL
    ),
    -- Consistency: store cancellation must record cancelled_at and a
    -- non-blank cancellation_note (IS NOT NULL guard keeps the predicate
    -- boolean so a NULL note cannot slip through SQLite's
    -- "NULL CHECK passes" rule)
    CHECK (
        status <> 'cancelled_by_store'
        OR (
            cancelled_at IS NOT NULL
            AND cancellation_note IS NOT NULL
            AND trim(cancellation_note) <> ''
        )
    ),
    -- Consistency: completed bookings must record completed_at
    CHECK (
        status <> 'completed'
        OR completed_at IS NOT NULL
    ),
    -- Consistency: non-cancelled statuses must not carry cancellation data
    CHECK (
        status IN ('cancelled_by_customer', 'cancelled_by_store')
        OR (
            cancelled_at IS NULL
            AND cancellation_reason_code IS NULL
            AND cancellation_note IS NULL
        )
    ),
    -- Consistency: non-completed statuses must not carry completed_at
    CHECK (
        status = 'completed'
        OR completed_at IS NULL
    ),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);

-- 2. Booking items: one booking may contain multiple services.
--    service_name_snapshot / duration_minutes / unit_price_amount preserve
--    the service state at booking time even if the service changes later.
CREATE TABLE IF NOT EXISTS booking_items (
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
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
);

-- 3. Booking status logs: append-only status-change history.
--    changed_by_type identifies who triggered the change
--    (customer cancel vs store cancel vs system/ai automation).
CREATE TABLE IF NOT EXISTS booking_status_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    booking_id TEXT NOT NULL,
    from_status TEXT
        CHECK (from_status IS NULL OR from_status IN (
            'pending', 'confirmed', 'checked_in', 'completed',
            'cancelled_by_customer', 'cancelled_by_store',
            'no_show', 'rescheduled'
        )),
    to_status TEXT NOT NULL
        CHECK (to_status IN (
            'pending', 'confirmed', 'checked_in', 'completed',
            'cancelled_by_customer', 'cancelled_by_store',
            'no_show', 'rescheduled'
        )),
    reason_code TEXT,
    note TEXT,
    changed_by_type TEXT NOT NULL DEFAULT 'customer'
        CHECK (changed_by_type IN ('customer', 'staff', 'system', 'ai')),
    changed_by_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- Indexes for tenant isolation and frequent booking queries
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

CREATE INDEX IF NOT EXISTS idx_booking_items_booking
    ON booking_items (tenant_id, booking_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_booking_status_logs_booking_created
    ON booking_status_logs (tenant_id, booking_id, created_at DESC);

-- Schema metadata
INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0002_bookings',
    'Booking tables: bookings, booking_items, booking_status_logs',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
