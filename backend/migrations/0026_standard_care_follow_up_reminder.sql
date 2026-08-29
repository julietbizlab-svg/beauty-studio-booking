-- Standard-plan services receive one care follow-up reminder 21 days after
-- the completed service. Keep one reminder per booking.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_standard_care_follow_up
ON notifications (tenant_id, booking_id, template_code)
WHERE template_code = 'standard_care_follow_up_21d';

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES (
  '0026_standard_care_follow_up_reminder',
  'Standard-plan 21-day customer care follow-up reminder',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
