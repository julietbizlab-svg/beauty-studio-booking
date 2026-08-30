UPDATE assessment_templates
SET name='光影臥蠶新客評估', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE code='under_eye_new_client' AND name<>'光影臥蠶新客評估';

INSERT OR IGNORE INTO schema_versions(version,description,applied_at)
VALUES ('0029_under_eye_display_name','Rename under-eye assessment display name to 光影臥蠶',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
