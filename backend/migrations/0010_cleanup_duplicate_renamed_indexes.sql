-- Migration: 0010_cleanup_duplicate_renamed_indexes
-- Branch: v2-d1
-- Purpose: Remove duplicate _new-named unique indexes retained by SQLite
--          after ALTER TABLE … RENAME in 0009 (formal indexes already exist).
-- Depends on: 0009_booking_status_machine

DROP INDEX IF EXISTS uq_bookings_new_tenant_id_id;
DROP INDEX IF EXISTS uq_photo_sets_new_tenant_id_id;

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
    '0010_cleanup_duplicate_renamed_indexes',
    'Drop stale _new unique indexes retained after 0009 RENAME',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
