-- Migration: 0007_customer_comparison_photos
-- Branch: v2-d1
-- Purpose: customer_photo_sets / customer_photos — owner-only before/after
--          comparison photo metadata. Image binaries live in a PRIVATE
--          Cloudflare R2 bucket (suggested: beauty-studio-photos-v2,
--          binding PHOTO_BUCKET); D1 keeps safe metadata only.
-- Privacy / security rules:
--          * NEVER store image binaries, base64, public URLs, original
--            filenames, customer names / phones / birthdays / notes,
--            LINE user ids, tokens or R2 credentials in these tables.
--          * object_key is an unguessable UUID-based key
--            (customer-photos/<tenant>/<uuid>) with no personal data.
--          * Photos are streamed exclusively through the Worker after
--            owner auth; R2 stays private (no public access).
-- Depends on: 0001_init_core.sql (tenants, customers, staff),
--             0002_bookings.sql (bookings),
--             0005_customer_import.sql (uq_staff_tenant_id_id),
--             0006_customer_claim_invites.sql (uq_customers_tenant_id_id)
-- Time storage rule: UTC ISO-8601 text, e.g. 2026-07-19T14:30:00.000Z

-- 1. Composite unique index on bookings so photo sets can use a
--    tenant-scoped composite FK (prevents a tenant-A set from
--    referencing a tenant-B booking).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_tenant_id_id
    ON bookings (tenant_id, id);

-- 2. Photo sets: one before/after comparison group per treatment.
--    All FKs use ON DELETE RESTRICT:
--    * Composite-FK SET NULL is unsafe in SQLite (it would try to null
--      the NOT NULL tenant_id as well), so bookings are RESTRICT.
--    * customer -> photo set is RESTRICT (not CASCADE) so a hard delete
--      can never silently drop photo metadata and leave untrackable
--      R2 objects behind. Real deletion goes through the application
--      layer soft delete + R2 cleanup.
CREATE TABLE IF NOT EXISTS customer_photo_sets (
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
        REFERENCES bookings(tenant_id, id)
        ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, created_by_staff_id)
        REFERENCES staff(tenant_id, id)
        ON DELETE RESTRICT
);

-- 3. Composite unique index on photo sets for tenant-scoped photo FK.
CREATE UNIQUE INDEX IF NOT EXISTS uq_photo_sets_tenant_id_id
    ON customer_photo_sets (tenant_id, id);

-- 4. Photos: metadata only; binary lives in private R2.
--    All FKs use ON DELETE RESTRICT: cascading a hard delete would
--    remove the object_key rows that are the only pointer to the R2
--    objects, creating untrackable orphans. Deletion is handled by the
--    application layer (soft delete + R2 cleanup with retry).
CREATE TABLE IF NOT EXISTS customer_photos (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    photo_set_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    kind TEXT NOT NULL
        CHECK (kind IN ('before', 'after')),
    -- Unguessable key, no personal data, globally unique so an R2
    -- object can never be referenced by two rows.
    object_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL
        CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    -- Hard cap 5 MB (owner UI re-encodes to well below this).
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
        REFERENCES customer_photo_sets(tenant_id, id)
        ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, customer_id)
        REFERENCES customers(tenant_id, id)
        ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, created_by_staff_id)
        REFERENCES staff(tenant_id, id)
        ON DELETE RESTRICT
);

-- 5. One ACTIVE photo per set + kind (soft delete keeps history rows;
--    the partial unique index only constrains non-deleted photos).
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_photos_active_kind
    ON customer_photos (tenant_id, photo_set_id, kind)
    WHERE deleted_at IS NULL;

-- 6. Lookup indexes.
CREATE INDEX IF NOT EXISTS idx_photo_sets_tenant_customer_created
    ON customer_photo_sets (tenant_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_photos_tenant_set
    ON customer_photos (tenant_id, photo_set_id);

-- Schema metadata
INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0007_customer_comparison_photos',
    'Before/after comparison photo metadata (binaries in private R2, key-only in D1)',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
