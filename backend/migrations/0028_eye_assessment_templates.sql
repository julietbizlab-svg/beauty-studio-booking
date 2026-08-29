INSERT OR IGNORE INTO assessment_templates
(id,tenant_id,code,name,version,intro_text,status,created_at,updated_at)
SELECT 'assessment-template-eyeliner-' || id,id,'eyeliner_new_client','眼線／美瞳線新客評估',1,
       '資料將交由老師人工審核；提交不代表可以施作或預約成立。','active',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM tenants;

INSERT OR IGNORE INTO assessment_templates
(id,tenant_id,code,name,version,intro_text,status,created_at,updated_at)
SELECT 'assessment-template-under-eye-' || id,id,'under_eye_new_client','光影臥蠶新客評估',1,
       '本題庫僅適用微色素定妝類服務；資料將交由老師人工審核。','active',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM tenants;

INSERT OR IGNORE INTO schema_versions(version,description,applied_at)
VALUES ('0028_eye_assessment_templates','Eyeliner, lash-line enhancement and under-eye permanent makeup assessment templates',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
