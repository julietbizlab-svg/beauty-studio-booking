INSERT OR IGNORE INTO assessment_templates (id,tenant_id,code,name,version,intro_text,status,created_at,updated_at)
SELECT 'assessment-template-brow-lightening-' || id,id,'brow_lightening_new_client','舊眉輕色管理｜新客評估',1,'舊色輕色管理的呈現會依原有留色、施作次數及個人狀態而有所不同，實際安排由老師看過資料與照片後評估。','active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM tenants;
INSERT OR IGNORE INTO assessment_templates (id,tenant_id,code,name,version,intro_text,status,created_at,updated_at)
SELECT 'assessment-template-lip-lightening-' || id,id,'lip_lightening_new_client','舊唇輕色管理｜新客評估',1,'舊色輕色管理的呈現會依原有留色、施作次數及個人狀態而有所不同，實際安排由老師看過資料與照片後評估。','active',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM tenants;

UPDATE assessment_questions SET active=0,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE template_id IN (SELECT id FROM assessment_templates WHERE code='under_eye_new_client')
AND question_key IN ('makeup_habit','style_preference','procedure_date','self_reported_concerns','health_risk','health_categories','pregnancy_status','adverse_reactions','important_event','important_event_date','left_45','right_45');

UPDATE assessment_sessions SET current_question_key=CASE
  WHEN current_question_key='procedure_date' THEN 'procedure_recovery'
  WHEN current_question_key IN ('makeup_habit','style_preference','self_reported_concerns') THEN 'current_skin_condition'
  WHEN current_question_key IN ('health_risk','health_categories','pregnancy_status','adverse_reactions','important_event','important_event_date') THEN 'health_data_consent'
  WHEN current_question_key IN ('left_45','right_45') THEN 'face_smile'
  ELSE current_question_key END,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE status='active' AND template_id IN (SELECT id FROM assessment_templates WHERE code='under_eye_new_client');
INSERT OR IGNORE INTO schema_versions(version,description,applied_at) VALUES ('0030_lightening_assessment_templates','Separate old brow and old lip color lightening assessment templates',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
