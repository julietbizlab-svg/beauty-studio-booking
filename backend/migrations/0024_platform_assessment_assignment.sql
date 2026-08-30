INSERT OR IGNORE INTO tenant_settings
(id, tenant_id, setting_key, setting_value, value_type, created_at, updated_at)
SELECT 'assessment-template-setting-' || id, id, 'assessment_template_code',
       'brow_new_client', 'string',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM tenants;

INSERT OR IGNORE INTO schema_versions (version,description,applied_at)
VALUES ('0024_platform_assessment_assignment',
        'Platform assigns one customer assessment template per studio',
        strftime('%Y-%m-%dT%H:%M:%fZ','now'));
