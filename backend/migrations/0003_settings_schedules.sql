-- Migration: 0003_settings_schedules
-- Branch: v2-d1
-- Purpose: Store settings (tenant_settings), weekly/override business hours
--          (staff_schedules) and booking rules (booking_policies).
-- Source: schema-only design; column names aligned with the local import
--         draft per V2-D1-SQL-DRAFT-REVIEW.md gap analysis. No data values
--         are copied — the only INSERT below is the schema_versions record.
-- Depends on: 0001_init_core.sql (tenants, locations, staff, schema_versions)
-- Time storage rule: UTC ISO-8601 text for *_at columns;
--                    'HH:MM' local store time for schedule start/end;
--                    'YYYY-MM-DD' for dates.

-- 1. Tenant settings: key-value store per tenant.
--    Holds announcement text, cancellation policy text and deposit-transfer
--    display info (bank code/name/account/account name as display-only
--    strings; no payment processing).
CREATE TABLE IF NOT EXISTS tenant_settings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value TEXT,
    value_type TEXT NOT NULL DEFAULT 'string'
        CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, setting_key),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

-- 2. Staff schedules: weekly recurring hours plus date-specific overrides.
--    - schedule_type 'weekly': recurring segment, weekday required (0=Sunday
--      ... 6=Saturday), multiple rows per weekday allowed for split shifts.
--    - schedule_type 'date_override': specific_date required; is_available=0
--      marks a day off (times optional for whole-day off), is_available=1
--      with times marks special hours.
--    - effective_from / effective_to bound the validity period (NULL = open).
--    - is_active is the enable switch, independent of availability semantics.
CREATE TABLE IF NOT EXISTS staff_schedules (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    location_id TEXT,
    staff_id TEXT NOT NULL,
    schedule_type TEXT NOT NULL DEFAULT 'weekly'
        CHECK (schedule_type IN ('weekly', 'date_override')),
    weekday INTEGER
        CHECK (weekday IS NULL OR (weekday >= 0 AND weekday <= 6)),
    specific_date TEXT,
    start_time TEXT,
    end_time TEXT,
    is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
    effective_from TEXT,
    effective_to TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    -- weekly rows need a weekday and no specific date
    CHECK (
        schedule_type <> 'weekly'
        OR (weekday IS NOT NULL AND specific_date IS NULL)
    ),
    -- override rows need a specific date and no weekday
    CHECK (
        schedule_type <> 'date_override'
        OR (specific_date IS NOT NULL AND weekday IS NULL)
    ),
    -- times must come in pairs, and end must be after start
    CHECK (
        (start_time IS NULL AND end_time IS NULL)
        OR (
            start_time IS NOT NULL
            AND end_time IS NOT NULL
            AND end_time > start_time
        )
    ),
    -- an available segment must define its time range
    CHECK (
        is_available = 0
        OR (start_time IS NOT NULL AND end_time IS NOT NULL)
    ),
    -- validity range must not be inverted
    CHECK (
        effective_from IS NULL
        OR effective_to IS NULL
        OR effective_to >= effective_from
    ),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

-- 3. Booking policies: booking-window and cancellation rules.
--    Column names follow the import draft where applicable
--    (minimum_booking_notice_minutes, maximum_booking_days,
--    cancellation_deadline_minutes, is_active).
CREATE TABLE IF NOT EXISTS booking_policies (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    location_id TEXT,
    policy_name TEXT NOT NULL DEFAULT 'default',
    maximum_booking_days INTEGER NOT NULL DEFAULT 30
        CHECK (maximum_booking_days > 0),
    minimum_booking_notice_minutes INTEGER NOT NULL DEFAULT 0
        CHECK (minimum_booking_notice_minutes >= 0),
    cancellation_deadline_minutes INTEGER NOT NULL DEFAULT 0
        CHECK (cancellation_deadline_minutes >= 0),
    slot_interval_minutes INTEGER NOT NULL DEFAULT 30
        CHECK (slot_interval_minutes > 0),
    require_store_confirmation INTEGER NOT NULL DEFAULT 0
        CHECK (require_store_confirmation IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, location_id, policy_name),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);

-- Indexes for schedule lookup and policy resolution
CREATE INDEX IF NOT EXISTS idx_staff_schedules_staff_weekday
    ON staff_schedules (tenant_id, staff_id, schedule_type, weekday);

CREATE INDEX IF NOT EXISTS idx_staff_schedules_specific_date
    ON staff_schedules (tenant_id, specific_date);

CREATE INDEX IF NOT EXISTS idx_booking_policies_tenant_location_active
    ON booking_policies (tenant_id, location_id, is_active);

-- Integrity: the table-level UNIQUE (tenant_id, location_id, policy_name)
-- does not constrain rows with location_id NULL (SQLite treats NULLs as
-- distinct), so enforce at most one store-wide policy per tenant+name here.
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_policies_storewide
    ON booking_policies (tenant_id, policy_name)
    WHERE location_id IS NULL;

-- Integrity: prevent duplicate weekly segments. Nullable columns are
-- normalized with COALESCE so NULLs cannot slip past UNIQUE; weekday is
-- guaranteed NOT NULL for weekly rows by the table CHECK.
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_schedules_weekly
    ON staff_schedules (
        tenant_id,
        staff_id,
        COALESCE(location_id, ''),
        weekday,
        COALESCE(start_time, ''),
        COALESCE(end_time, ''),
        COALESCE(effective_from, ''),
        COALESCE(effective_to, '')
    )
    WHERE schedule_type = 'weekly';

-- Integrity: prevent duplicate date overrides. specific_date is guaranteed
-- NOT NULL for override rows by the table CHECK.
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_schedules_date_override
    ON staff_schedules (
        tenant_id,
        staff_id,
        COALESCE(location_id, ''),
        specific_date,
        COALESCE(start_time, ''),
        COALESCE(end_time, '')
    )
    WHERE schedule_type = 'date_override';

-- Schema metadata
INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0003_settings_schedules',
    'Settings and scheduling tables: tenant_settings, staff_schedules, booking_policies',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
