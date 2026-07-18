-- Migration: 0001_init_core
-- Branch: v2-d1
-- Purpose: Core multi-tenant tables (tenants, locations, customers,
--          line_accounts, staff, services) plus schema_versions metadata.
-- Source: extracted from juliet-ai-os-d1-schema-v1.0.0.sql (draft),
--         PRAGMA removed for Cloudflare D1 migration compatibility.
-- Time storage rule: UTC ISO-8601 text, e.g. 2026-07-17T14:30:00.000Z
-- Money storage rule: integer in New Taiwan dollars

-- 1. Tenants: one business/customer organization
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    business_type TEXT NOT NULL DEFAULT 'beauty_studio',
    timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
    currency TEXT NOT NULL DEFAULT 'TWD',
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('trial', 'active', 'suspended', 'closed')),
    owner_name TEXT,
    owner_phone TEXT,
    owner_email TEXT,
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 2. Locations: branches or service locations
CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, code),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

-- 3. Customers: tenant-specific customer profile
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_no TEXT,
    display_name TEXT NOT NULL,
    legal_name TEXT,
    mobile TEXT,
    email TEXT,
    birthday TEXT,
    gender TEXT
        CHECK (gender IS NULL OR gender IN ('female', 'male', 'nonbinary', 'undisclosed')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'blocked', 'deleted')),
    source TEXT NOT NULL DEFAULT 'line'
        CHECK (source IN ('line', 'manual', 'import', 'web', 'other')),
    notes TEXT,
    preferences_json TEXT NOT NULL DEFAULT '{}',
    first_visit_at TEXT,
    last_visit_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    UNIQUE (tenant_id, customer_no),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

-- 4. LINE account mapping
CREATE TABLE IF NOT EXISTS line_accounts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    line_user_id TEXT NOT NULL,
    display_name TEXT,
    picture_url TEXT,
    language TEXT,
    friendship_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (friendship_status IN ('friend', 'blocked', 'unknown')),
    linked_at TEXT NOT NULL,
    last_seen_at TEXT,
    profile_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE (tenant_id, line_user_id),
    UNIQUE (tenant_id, customer_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- 5. Staff
CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    location_id TEXT,
    code TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff'
        CHECK (role IN ('owner', 'manager', 'staff', 'assistant')),
    mobile TEXT,
    email TEXT,
    line_user_id TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'leave')),
    booking_enabled INTEGER NOT NULL DEFAULT 1 CHECK (booking_enabled IN (0, 1)),
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, code),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);

-- 6. Services
CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    description TEXT,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    buffer_before_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0),
    buffer_after_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0),
    price_amount INTEGER NOT NULL DEFAULT 0 CHECK (price_amount >= 0),
    deposit_amount INTEGER NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'archived')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, code),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

-- Core indexes for tenant isolation and frequent queries
CREATE INDEX IF NOT EXISTS idx_locations_tenant_status
    ON locations (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_mobile
    ON customers (tenant_id, mobile);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_status
    ON customers (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_line_accounts_customer
    ON line_accounts (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_staff_tenant_location_status
    ON staff (tenant_id, location_id, status);

CREATE INDEX IF NOT EXISTS idx_services_tenant_status_sort
    ON services (tenant_id, status, sort_order);

-- Schema metadata
CREATE TABLE IF NOT EXISTS schema_versions (
    version TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0001_init_core',
    'Core multi-tenant tables: tenants, locations, customers, line_accounts, staff, services',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
