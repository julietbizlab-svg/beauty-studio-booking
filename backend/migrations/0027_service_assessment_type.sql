ALTER TABLE services ADD COLUMN assessment_template_code TEXT NOT NULL DEFAULT 'none'
  CHECK (assessment_template_code IN (
    'none','brow_new_client','lip_blush_new_client',
    'eyeliner_new_client','under_eye_new_client'
  ));

UPDATE services
SET assessment_template_code = COALESCE((
  SELECT CASE
    WHEN ts.setting_value IN ('brow_new_client','lip_blush_new_client') THEN ts.setting_value
    ELSE 'none'
  END
  FROM tenant_settings ts
  WHERE ts.tenant_id = services.tenant_id
    AND ts.setting_key = 'assessment_template_code'
), 'none')
WHERE EXISTS (
  SELECT 1 FROM tenant_features tf
  WHERE tf.tenant_id = services.tenant_id AND tf.plan_code = 'flagship'
);

CREATE INDEX idx_services_tenant_assessment
ON services (tenant_id, assessment_template_code, status);

INSERT OR IGNORE INTO schema_versions (version,description,applied_at)
VALUES ('0027_service_assessment_type',
        'Assign one assessment type to each service; unsupported draft types stay unavailable',
        strftime('%Y-%m-%dT%H:%M:%fZ','now'));
