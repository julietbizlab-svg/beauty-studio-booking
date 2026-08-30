CREATE TABLE assessment_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    intro_text TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, code),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
);

CREATE TABLE assessment_questions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    question_key TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    question_type TEXT NOT NULL CHECK (question_type IN ('single','multiple','date','text','photo')),
    prompt TEXT NOT NULL,
    options_json TEXT NOT NULL DEFAULT '[]',
    branch_rules_json TEXT NOT NULL DEFAULT '{}',
    required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
    system_locked INTEGER NOT NULL DEFAULT 0 CHECK (system_locked IN (0,1)),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, template_id, question_key),
    UNIQUE (tenant_id, template_id, step_order),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (template_id) REFERENCES assessment_templates(id) ON DELETE CASCADE
);

CREATE TABLE assessment_sessions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    line_user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN
      ('active','paused','一般待審核','優先待審核','待補資料','暫不開放排程','approved','contact_manually')),
    current_question_key TEXT NOT NULL DEFAULT '',
    booking_route TEXT NOT NULL DEFAULT '一般待審核' CHECK (booking_route IN
      ('一般待審核','優先待審核','待補資料','暫不開放排程')),
    case_tags_json TEXT NOT NULL DEFAULT '[]',
    missing_fields_json TEXT NOT NULL DEFAULT '[]',
    owner_summary TEXT NOT NULL DEFAULT '',
    internal_notes TEXT NOT NULL DEFAULT '',
    health_consent_at TEXT,
    submitted_at TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, template_id, line_user_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (template_id) REFERENCES assessment_templates(id) ON DELETE RESTRICT
);

CREATE TABLE assessment_answers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    question_key TEXT NOT NULL,
    answer_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, session_id, question_key),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (session_id) REFERENCES assessment_sessions(id) ON DELETE CASCADE
);

CREATE TABLE assessment_photos (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    quality_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (quality_status IN ('PENDING','ACCEPTED','REUPLOAD_REQUIRED','OPTIONAL')),
    quality_notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, session_id, kind),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (session_id) REFERENCES assessment_sessions(id) ON DELETE CASCADE
);

CREATE TABLE assessment_reviews (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('approved','need_more_information','temporarily_unavailable','contact_manually')),
    owner_id TEXT NOT NULL,
    customer_message TEXT NOT NULL DEFAULT '',
    internal_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    FOREIGN KEY (session_id) REFERENCES assessment_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_assessment_sessions_owner_queue
ON assessment_sessions (tenant_id, status, updated_at DESC);
CREATE INDEX idx_assessment_answers_session
ON assessment_answers (tenant_id, session_id, question_key);
CREATE INDEX idx_assessment_reviews_session
ON assessment_reviews (tenant_id, session_id, created_at DESC);

INSERT INTO assessment_templates
(id,tenant_id,code,name,version,intro_text,status,created_at,updated_at)
SELECT 'assessment-template-brow-' || id,id,'brow_new_client','霧眉新客評估',1,
       '為了讓老師先了解您的眉部狀況及需求，接下來會進行簡短的新客評估。','active',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM tenants;

INSERT INTO assessment_templates
(id,tenant_id,code,name,version,intro_text,status,created_at,updated_at)
SELECT 'assessment-template-lip-' || id,id,'lip_blush_new_client','霧唇新客評估',1,
       '為了讓老師先了解您的原生唇色、舊唇色、唇部狀況及需求，接下來會進行簡短的霧唇新客評估。','active',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM tenants;

INSERT INTO assessment_sessions
(id,tenant_id,template_id,line_user_id,status,current_question_key,booking_route,
 case_tags_json,missing_fields_json,health_consent_at,submitted_at,reviewed_at,created_at,updated_at)
SELECT bi.id,bi.tenant_id,'assessment-template-brow-' || bi.tenant_id,bi.line_user_id,
  CASE bi.status WHEN 'pending_human_review' THEN
    CASE bi.booking_route WHEN '優先人工審核' THEN '優先待審核' WHEN '暫停預約' THEN '暫不開放排程' ELSE '一般待審核' END
    WHEN 'need_more_information' THEN '待補資料' WHEN 'temporarily_unavailable' THEN '暫不開放排程'
    ELSE bi.status END,
  bi.current_step,
  CASE bi.booking_route WHEN '優先人工審核' THEN '優先待審核' WHEN '暫停預約' THEN '暫不開放排程' ELSE '一般待審核' END,
  CASE WHEN bi.manual_review_required=1 THEN '["既有霧眉案件需人工確認"]' ELSE '[]' END,
  '[]',bi.health_consent_at,bi.submitted_at,bi.reviewed_at,bi.created_at,bi.updated_at
FROM brow_intake_sessions bi;

INSERT INTO assessment_answers
(id,tenant_id,session_id,question_key,answer_json,created_at,updated_at)
SELECT 'assessment-answer-' || bi.id || '-' || lower(hex(randomblob(8))),bi.tenant_id,bi.id,j.key,
       CASE j.type
         WHEN 'text' THEN json_quote(j.value)
         WHEN 'null' THEN 'null'
         ELSE json(j.value)
       END,
       bi.created_at,bi.updated_at
FROM brow_intake_sessions bi,json_each(bi.answers_json) j
WHERE substr(j.key,1,1) <> '_';

INSERT INTO assessment_photos
(id,tenant_id,session_id,kind,object_key,mime_type,byte_size,quality_status,created_at,updated_at)
SELECT id,tenant_id,session_id,kind,object_key,mime_type,byte_size,'PENDING',created_at,created_at
FROM brow_intake_photos;

INSERT OR IGNORE INTO schema_versions (version,description,applied_at)
VALUES ('0023_generic_assessment_engine','Generic service assessment templates, sessions, answers, photos and reviews',
        strftime('%Y-%m-%dT%H:%M:%fZ','now'));
