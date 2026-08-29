-- Extend the existing brow reminder mechanism to lip-blush services without
-- changing or deleting any previously scheduled brow notifications.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_pigment_follow_up
ON notifications (tenant_id, booking_id, template_code)
WHERE template_code IN (
  'brow_complimentary_touchup_28d',
  'brow_paid_maintenance_11m',
  'lip_touchup_28d',
  'lip_paid_maintenance_11m'
);

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
  '0025_pigment_follow_up_reminders',
  'Brow and lip 28-day touch-up and 11-month paid maintenance reminders',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
