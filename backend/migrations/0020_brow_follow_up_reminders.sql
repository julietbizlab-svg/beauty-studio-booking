-- Prevent duplicate 28-day complimentary touch-up and 11-month paid
-- maintenance reminders for the same completed brow booking.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_brow_follow_up
ON notifications (tenant_id, booking_id, template_code)
WHERE template_code IN ('brow_complimentary_touchup_28d', 'brow_paid_maintenance_11m');

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
  '0020_brow_follow_up_reminders',
  'Brow 28-day complimentary touch-up and 11-month paid maintenance reminders',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
