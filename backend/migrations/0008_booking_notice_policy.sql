-- Migration: 0008_booking_notice_policy
-- Branch: v2-d1
-- Purpose: owner-configurable booking/cancellation notice (days × 24h),
--          plus per-booking cancellation policy snapshot on create.
-- Depends on: 0001_init_core.sql (tenants),
--             0002_bookings.sql (bookings),
--             0003_settings_schedules.sql (tenant_settings)
-- Time storage rule: UTC ISO-8601 text for *_at columns

-- 1. Per-booking cancellation policy snapshot (set only at create time).
--    cancellation_deadline_at = start_at - (snapshot days × 24h).
--    Existing rows stay NULL; application fallback = 1 day (see tests).
ALTER TABLE bookings ADD COLUMN cancellation_notice_days_snapshot INTEGER
    CHECK (
        cancellation_notice_days_snapshot IS NULL
        OR (cancellation_notice_days_snapshot >= 0
            AND cancellation_notice_days_snapshot <= 30)
    );

ALTER TABLE bookings ADD COLUMN cancellation_deadline_at TEXT;

-- 2. Tenant settings keys (defaults inserted for all tenants).
--    booking_min_notice_days: customer must book at least N×24h ahead.
--    cancellation_min_notice_days: applies only to NEW bookings after save.
INSERT OR IGNORE INTO tenant_settings
    (id, tenant_id, setting_key, setting_value, value_type, description,
     created_at, updated_at)
SELECT
    lower(hex(randomblob(16))),
    t.id,
    'booking_min_notice_days',
    '1',
    'number',
    '客戶至少需提前幾天建立預約（0～30）',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM tenants t;

INSERT OR IGNORE INTO tenant_settings
    (id, tenant_id, setting_key, setting_value, value_type, description,
     created_at, updated_at)
SELECT
    lower(hex(randomblob(16))),
    t.id,
    'cancellation_min_notice_days',
    '1',
    'number',
    '客戶至少需提前幾天取消預約（0～30；僅套用新建立的預約）',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM tenants t;

-- Schema metadata
INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0008_booking_notice_policy',
    'Configurable booking/cancellation notice days and per-booking cancel snapshot',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
