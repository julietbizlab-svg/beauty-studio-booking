import {
  BROW_INTAKE_QUESTIONS, BROW_INTAKE_INTRO, nextBrowQuestion,
  evaluateBrowCase, buildBrowOwnerSummary
} from "./brow-intake-template.js";
import {
  LIP_INTAKE_QUESTIONS, LIP_INTAKE_INTRO, nextLipQuestion,
  evaluateLipCase, buildLipOwnerSummary, validateLipAnswer
} from "./lip-intake-template.js";
import { sniffImageType, MAX_PHOTO_BYTES } from "./d1-customer-photos.js";
import {
  dispatchLineNotificationById,
  enqueueAssessmentReviewNotification
} from "./d1-notifications.js";
import {
  EYELINER_INTAKE_QUESTIONS, EYELINER_INTAKE_INTRO, nextEyelinerQuestion,
  evaluateEyelinerCase, buildEyelinerOwnerSummary, validateEyelinerAnswer,
  UNDEREYE_INTAKE_QUESTIONS, UNDEREYE_INTAKE_INTRO, nextUnderEyeQuestion,
  evaluateUnderEyeCase, buildUnderEyeOwnerSummary, validateUnderEyeAnswer
} from "./eye-assessment-templates.js";
import {
  BROW_LIGHTENING_QUESTIONS, BROW_LIGHTENING_INTRO, nextBrowLighteningQuestion,
  evaluateBrowLighteningCase, buildBrowLighteningOwnerSummary, validateBrowLighteningAnswer,
  LIP_LIGHTENING_QUESTIONS, LIP_LIGHTENING_INTRO, nextLipLighteningQuestion,
  evaluateLipLighteningCase, buildLipLighteningOwnerSummary, validateLipLighteningAnswer
} from "./lightening-assessment-templates.js";

const DEFINITIONS = {
  brow_new_client: {
    intro: BROW_INTAKE_INTRO, questions: BROW_INTAKE_QUESTIONS,
    next: nextBrowQuestion, evaluate: evaluateBrowCase, summary: buildBrowOwnerSummary
  },
  lip_blush_new_client: {
    intro: LIP_INTAKE_INTRO, questions: LIP_INTAKE_QUESTIONS,
    next: nextLipQuestion, evaluate: evaluateLipCase, summary: buildLipOwnerSummary
  },
  eyeliner_new_client: {
    intro: EYELINER_INTAKE_INTRO, questions: EYELINER_INTAKE_QUESTIONS,
    next: nextEyelinerQuestion, evaluate: evaluateEyelinerCase, summary: buildEyelinerOwnerSummary
  },
  under_eye_new_client: {
    intro: UNDEREYE_INTAKE_INTRO, questions: UNDEREYE_INTAKE_QUESTIONS,
    next: nextUnderEyeQuestion, evaluate: evaluateUnderEyeCase, summary: buildUnderEyeOwnerSummary
  },
  brow_lightening_new_client: { intro: BROW_LIGHTENING_INTRO, questions: BROW_LIGHTENING_QUESTIONS, next: nextBrowLighteningQuestion, evaluate: evaluateBrowLighteningCase, summary: buildBrowLighteningOwnerSummary },
  lip_lightening_new_client: { intro: LIP_LIGHTENING_INTRO, questions: LIP_LIGHTENING_QUESTIONS, next: nextLipLighteningQuestion, evaluate: evaluateLipLighteningCase, summary: buildLipLighteningOwnerSummary }
};

function fail(message, status) { var error = new Error(message); error.status = status || 400; throw error; }
function definition(code) { var result = DEFINITIONS[String(code || "")]; if (!result) fail("不支援的評估服務", 400); return result; }
function parse(value, fallback) { try { return JSON.parse(value); } catch (ignore) { return fallback; } }

const ASSESSMENT_NAMES = {
  brow_new_client: "霧眉新客評估",
  lip_blush_new_client: "霧唇新客評估",
  eyeliner_new_client: "眼線／美瞳線新客評估",
  under_eye_new_client: "光影臥蠶新客評估",
  brow_lightening_new_client: "舊眉輕色管理｜新客評估",
  lip_lightening_new_client: "舊唇輕色管理｜新客評估"
};

export function supportedOwnerAssessmentTemplateCodes(rows) {
  return Array.from(new Set((rows || []).map(function (row) {
    return String(row && row.code || "").trim();
  }).filter(function (code) {
    return Boolean(code && code !== "none" && DEFINITIONS[code]);
  })));
}

export function configuredOwnerAssessmentTemplateCodes(rows, settingValue) {
  var settingCode = String(settingValue || "").trim();
  if (settingCode === "all_supported") return Object.keys(DEFINITIONS);
  return supportedOwnerAssessmentTemplateCodes(
    (rows || []).concat(settingCode ? [{ code: settingCode }] : [])
  );
}

export async function getConfiguredAssessmentTemplate(env, tenantId, serviceId) {
  var scopedTenantId = String(tenantId || env.TENANT_ID || "");
  if (serviceId) {
    var service = await env.DB.prepare(
      "SELECT s.name,COALESCE(NULLIF(json_extract(s.settings_json,'$.assessmentTemplateCode'),''),s.assessment_template_code) AS assessment_template_code,COALESCE(tf.plan_code,'standard') AS plan_code " +
      "FROM services s LEFT JOIN tenant_features tf ON tf.tenant_id=s.tenant_id " +
      "WHERE s.tenant_id=?1 AND s.id=?2 AND s.status='active'"
    ).bind(scopedTenantId, String(serviceId)).first();
    if (!service) fail("找不到可預約的服務項目", 404);
    var skipsAssessment = /美甲|美睫|睫毛/.test(String(service.name || ""));
    var serviceCode = service.plan_code === "flagship" && !skipsAssessment
      ? String(service.assessment_template_code || "none") : "none";
    if (serviceCode === "none") {
      return { ok: true, code: "", name: "", intro: "", required: false, ready: true };
    }
    if (!DEFINITIONS[serviceCode]) {
      return { ok: true, code: serviceCode, name: ASSESSMENT_NAMES[serviceCode] || "新客評估",
        intro: "", required: true, ready: false,
        message: "此服務的評估範本準備中，暫未開放新客預約" };
    }
    var serviceSpec = definition(serviceCode);
    return { ok: true, code: serviceCode, name: ASSESSMENT_NAMES[serviceCode],
      intro: serviceSpec.intro, required: true, ready: true };
  }
  var row = await env.DB.prepare(
    "SELECT ts.setting_value,COALESCE(tf.plan_code,'standard') AS plan_code FROM tenants t " +
    "LEFT JOIN tenant_settings ts ON ts.tenant_id=t.id AND ts.setting_key='assessment_template_code' " +
    "LEFT JOIN tenant_features tf ON tf.tenant_id=t.id WHERE t.id=?1"
  )
    .bind(scopedTenantId).first();
  if (!row || (row.plan_code && row.plan_code !== "flagship")) {
    return { ok: true, code: "", name: "", intro: "", required: false };
  }
  if (row.setting_value === "all_supported") {
    return { ok: true, code: "", name: "依服務項目套用評估", intro: "",
      required: false, ready: true, routingMode: "service" };
  }
  var code = row && DEFINITIONS[row.setting_value] ? row.setting_value : "brow_new_client";
  var spec = definition(code);
  return { ok: true, code: code, name: ASSESSMENT_NAMES[code],
    intro: spec.intro, required: true, ready: true };
}

async function hasCompletedService(env, lineUserId, serviceId) {
  if (!serviceId) return false;
  var row = await env.DB.prepare(
    "SELECT 1 AS found FROM bookings b " +
    "JOIN booking_items bi ON bi.tenant_id=b.tenant_id AND bi.booking_id=b.id " +
    "JOIN line_accounts la ON la.tenant_id=b.tenant_id AND la.customer_id=b.customer_id " +
    "WHERE b.tenant_id=?1 AND la.line_user_id=?2 AND bi.service_id=?3 " +
    "AND b.status='completed' LIMIT 1"
  ).bind(env.TENANT_ID, String(lineUserId || ""), String(serviceId)).first();
  return Boolean(row);
}

export async function getCustomerConfiguredAssessmentTemplate(env, lineUserId, serviceId) {
  var configured = await getConfiguredAssessmentTemplate(env, null, serviceId);
  if (configured.required && await hasCompletedService(env, lineUserId, serviceId)) {
    return {
      ok: true, code: "", name: "", intro: "", required: false, ready: true,
      status: "not_required", reason: "completed_same_service"
    };
  }
  if (configured.required && configured.code) {
    var session = await env.DB.prepare(
      "SELECT s.id,s.status,s.submitted_at,s.reviewed_at FROM assessment_sessions s " +
      "JOIN assessment_templates t ON t.tenant_id=s.tenant_id AND t.id=s.template_id " +
      "WHERE s.tenant_id=?1 AND s.line_user_id=?2 AND t.code=?3 " +
      "ORDER BY s.updated_at DESC LIMIT 1"
    ).bind(env.TENANT_ID, String(lineUserId || ""), configured.code).first();
    if (!session) return Object.assign({}, configured, { status: "not_started" });
    var answerResult = await env.DB.prepare(
      "SELECT a.question_key,a.answer_json,COALESCE(q.prompt,a.question_key) AS prompt " +
      "FROM assessment_answers a LEFT JOIN assessment_questions q " +
      "ON q.tenant_id=a.tenant_id AND q.template_id=(SELECT template_id FROM assessment_sessions WHERE tenant_id=a.tenant_id AND id=a.session_id) " +
      "AND q.question_key=a.question_key WHERE a.tenant_id=?1 AND a.session_id=?2 " +
      "ORDER BY COALESCE(q.step_order,999),a.created_at"
    ).bind(env.TENANT_ID, session.id).all();
    var photoRow = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM assessment_photos WHERE tenant_id=?1 AND session_id=?2"
    ).bind(env.TENANT_ID, session.id).first();
    return Object.assign({}, configured, {
      status: String(session.status || ""),
      assessment: {
        status: String(session.status || ""),
        submittedAt: session.submitted_at || "",
        reviewedAt: session.reviewed_at || "",
        answers: (answerResult.results || []).map(function (row) {
          return { key: row.question_key, prompt: row.prompt, value: parse(row.answer_json, "") };
        }),
        photoCount: Number(photoRow && photoRow.count || 0)
      }
    });
  }
  return configured;
}

async function assertConfiguredTemplate(env, code, serviceId) {
  var configured = await getConfiguredAssessmentTemplate(env, null, serviceId);
  if (!configured.ready) fail(configured.message || "此服務的評估範本尚未開放", 409);
  if (configured.code !== String(code || "")) fail("此服務未啟用這份評估問卷", 403);
  return configured;
}

export async function assertCustomerAssessmentApproved(env, lineUserId, serviceId) {
  var configured = await getConfiguredAssessmentTemplate(env, null, serviceId);
  if (!configured.ready) fail(configured.message || "此服務的評估範本尚未開放", 409);
  if (!configured.code) return { ok: true, status: "not_required", templateCode: "" };
  if (await hasCompletedService(env, lineUserId, serviceId)) {
    return { ok: true, status: "not_required", templateCode: configured.code,
      reason: "completed_same_service" };
  }
  var row = await env.DB.prepare(
    "SELECT s.status FROM assessment_sessions s " +
    "JOIN assessment_templates t ON t.tenant_id=s.tenant_id AND t.id=s.template_id " +
    "WHERE s.tenant_id=?1 AND s.line_user_id=?2 AND t.code=?3 LIMIT 1"
  ).bind(env.TENANT_ID, String(lineUserId || ""), configured.code).first();
  if (!row || row.status !== "approved") {
    fail("請先完成新客評估並等待老師審核通過，通過後才會開放服務與預約時段", 403);
  }
  return { ok: true, status: "approved", templateCode: configured.code };
}

export async function isReturningCustomer(env, lineUserId) {
  var row = await env.DB.prepare(
    "SELECT 1 AS found FROM bookings b " +
    "JOIN line_accounts la ON la.tenant_id=b.tenant_id AND la.customer_id=b.customer_id " +
    "WHERE b.tenant_id=?1 AND la.line_user_id=?2 AND b.status='completed' LIMIT 1"
  ).bind(env.TENANT_ID, String(lineUserId || "")).first();
  return Boolean(row);
}

export async function completeMissingCustomerBirthday(env, lineUserId, birthday) {
  var value = String(birthday || "").trim();
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) fail("請填寫生日", 400);
  var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 ||
      date.getUTCDate() !== Number(match[3])) fail("生日格式錯誤", 400);
  await env.DB.prepare(
    "UPDATE customers SET birthday=?1,updated_at=?2 WHERE tenant_id=?3 AND birthday IS NULL " +
    "AND id=(SELECT customer_id FROM line_accounts WHERE tenant_id=?3 AND line_user_id=?4)"
  ).bind(value, new Date().toISOString(), env.TENANT_ID, String(lineUserId || "")).run();
  return value;
}
function validateAnswer(question, answer, code) {
  if (code === "lip_blush_new_client") {
    var checked = validateLipAnswer(question.key, answer);
    if (!checked.valid) fail(checked.reason, 400);
    return;
  }
  if (code === "eyeliner_new_client") {
    var eyelinerChecked = validateEyelinerAnswer(question.key, answer);
    if (!eyelinerChecked.valid) fail(eyelinerChecked.reason, 400);
    return;
  }
  if (code === "under_eye_new_client") {
    var underEyeChecked = validateUnderEyeAnswer(question.key, answer);
    if (!underEyeChecked.valid) fail(underEyeChecked.reason, 400);
    return;
  }
  if (code === "brow_lightening_new_client") {
    var browLighteningChecked = validateBrowLighteningAnswer(question.key, answer);
    if (!browLighteningChecked.valid) fail(browLighteningChecked.reason, 400);
    return;
  }
  if (code === "lip_lightening_new_client") {
    var lipLighteningChecked = validateLipLighteningAnswer(question.key, answer);
    if (!lipLighteningChecked.valid) fail(lipLighteningChecked.reason, 400);
    return;
  }
  if (question.type === "multiple") {
    if (!Array.isArray(answer) || !answer.length || answer.some(function (item) { return question.options.indexOf(item) === -1; })) fail("請選擇有效選項", 400);
    if (answer.indexOf("沒有") !== -1 && answer.length > 1) fail("沒有不可與其他選項同時選擇", 400);
  } else if (question.type === "single" && question.options.indexOf(answer) === -1) fail("請選擇有效選項", 400);
  else if (question.type === "date" && answer !== "不記得" && !/^\d{4}-\d{2}-\d{2}$/.test(String(answer || ""))) fail("請選擇日期", 400);
  else if (question.type === "text" && (!String(answer || "").trim() || String(answer).length > 100)) fail("請填寫有效內容", 400);
}

async function templateRow(env, code) {
  var row = await env.DB.prepare("SELECT id,code,name,version,intro_text,status FROM assessment_templates WHERE tenant_id=?1 AND code=?2 AND status='active'")
    .bind(env.TENANT_ID, code).first();
  if (!row) fail("評估服務尚未啟用", 404);
  return row;
}

export async function seedAssessmentQuestions(env, code) {
  var spec = definition(code); var template = await templateRow(env, code); var now = new Date().toISOString();
  var statements = spec.questions.map(function (question, index) {
    return env.DB.prepare("INSERT OR IGNORE INTO assessment_questions (id,tenant_id,template_id,question_key,step_order,question_type,prompt,options_json,branch_rules_json,required,system_locked,active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'{}',?9,?10,1,?11,?11)")
      .bind(crypto.randomUUID(), env.TENANT_ID, template.id, question.key, index + 1, question.type,
        question.prompt, JSON.stringify(question.options), question.required ? 1 : 0,
        question.systemLocked ? 1 : 0, now);
  });
  if (code === "brow_new_client") {
    statements.push(env.DB.prepare(
      "UPDATE assessment_questions SET active=0,updated_at=?1 WHERE tenant_id=?2 AND template_id=?3 AND question_key IN ('store_touchup_artist','store_touchup_date')"
    ).bind(now, env.TENANT_ID, template.id));
  }
  if (statements.length) await env.DB.batch(statements);
  return template;
}

export async function startCustomerAssessment(env, lineUserId, code, serviceId) {
  await assertConfiguredTemplate(env, code, serviceId);
  var profile = await env.DB.prepare(
    "SELECT c.display_name,c.mobile,c.birthday FROM line_accounts la " +
    "JOIN customers c ON c.tenant_id=la.tenant_id AND c.id=la.customer_id " +
    "WHERE la.tenant_id=?1 AND la.line_user_id=?2"
  ).bind(env.TENANT_ID, String(lineUserId || "")).first();
  if (!profile || !String(profile.display_name || "").trim() || !String(profile.mobile || "").trim() ||
      !String(profile.birthday || "").trim()) {
    fail("請先填寫並儲存基本資料", 409);
  }
  var spec = definition(code); var template = await seedAssessmentQuestions(env, code); var now = new Date().toISOString();
  var existing = await env.DB.prepare("SELECT id,status,current_question_key FROM assessment_sessions WHERE tenant_id=?1 AND template_id=?2 AND line_user_id=?3")
    .bind(env.TENANT_ID, template.id, String(lineUserId || "")).first();
  if (!existing) {
    var id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO assessment_sessions (id,tenant_id,template_id,line_user_id,status,current_question_key,booking_route,created_at,updated_at) VALUES (?1,?2,?3,?4,'active',?5,'待補資料',?6,?6)")
      .bind(id, env.TENANT_ID, template.id, String(lineUserId || ""), spec.questions[0].key, now).run();
    existing = { id: id, status: "active", current_question_key: spec.questions[0].key };
  }
  if (code === "brow_new_client" && ["store_touchup_artist", "store_touchup_date"].includes(existing.current_question_key)) {
    await env.DB.prepare("UPDATE assessment_sessions SET current_question_key='old_brow_status',updated_at=?1 WHERE tenant_id=?2 AND id=?3 AND status='active'")
      .bind(now, env.TENANT_ID, existing.id).run();
    existing.current_question_key = "old_brow_status";
  }
  return { ok: true, sessionId: existing.id, status: existing.status, intro: template.intro_text || spec.intro,
    question: existing.status === "active"
      ? (spec.questions.find(function (item) { return item.key === existing.current_question_key; }) || null)
      : null };
}

export async function answerCustomerAssessment(env, lineUserId, code, input, serviceId) {
  await assertConfiguredTemplate(env, code, serviceId);
  var spec = definition(code); var template = await templateRow(env, code);
  var session = await env.DB.prepare("SELECT id,status,current_question_key FROM assessment_sessions WHERE tenant_id=?1 AND template_id=?2 AND line_user_id=?3")
    .bind(env.TENANT_ID, template.id, String(lineUserId || "")).first();
  if (!session || session.status !== "active") fail("目前沒有可作答的評估", 409);
  var question = spec.questions.find(function (item) { return item.key === session.current_question_key; });
  if (!question || question.type === "photo") fail("目前步驟需要上傳照片", 409);
  var answer = input && input.answer; validateAnswer(question, answer, code);
  var now = new Date().toISOString(); var next = spec.next(question.key, answer);
  var answerId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO assessment_answers (id,tenant_id,session_id,question_key,answer_json,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6) ON CONFLICT(tenant_id,session_id,question_key) DO UPDATE SET answer_json=excluded.answer_json,updated_at=excluded.updated_at")
      .bind(answerId, env.TENANT_ID, session.id, question.key, JSON.stringify(answer), now),
    env.DB.prepare("UPDATE assessment_sessions SET current_question_key=?1,updated_at=?2 WHERE tenant_id=?3 AND id=?4 AND status='active'")
      .bind(next || "", now, env.TENANT_ID, session.id)
  ]);
  return { ok: true, completedQuestions: true, nextQuestion: next ? spec.questions.find(function (item) { return item.key === next; }) : null };
}

export async function uploadCustomerAssessmentPhoto(env, lineUserId, code, kind, bytes, declaredMime, serviceId) {
  await assertConfiguredTemplate(env, code, serviceId);
  var spec = definition(code); var template = await templateRow(env, code);
  if (!env.PHOTO_BUCKET) fail("照片儲存空間尚未設定", 500);
  var session = await env.DB.prepare("SELECT id,status,current_question_key FROM assessment_sessions WHERE tenant_id=?1 AND template_id=?2 AND line_user_id=?3")
    .bind(env.TENANT_ID, template.id, String(lineUserId || "")).first();
  if (!session || session.status !== "active") fail("目前沒有可上傳照片的評估", 409);
  var question = spec.questions.find(function (item) { return item.key === String(kind || ""); });
  if (!question || question.type !== "photo" || session.current_question_key !== question.key) fail("照片步驟不符", 409);
  var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!data.length || data.length > MAX_PHOTO_BYTES) fail("照片大小不符合限制", 400);
  var mime = sniffImageType(data);
  if (!mime || (declaredMime && declaredMime !== mime)) fail("照片格式不支援", 400);
  var id = crypto.randomUUID(); var now = new Date().toISOString();
  var objectKey = "assessment-photos/" + env.TENANT_ID + "/" + session.id + "/" + crypto.randomUUID();
  await env.PHOTO_BUCKET.put(objectKey, data, { httpMetadata: { contentType: mime } });
  var next = spec.next(question.key, "uploaded");
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO assessment_photos (id,tenant_id,session_id,kind,object_key,mime_type,byte_size,quality_status,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'PENDING',?8,?8) ON CONFLICT(tenant_id,session_id,kind) DO UPDATE SET object_key=excluded.object_key,mime_type=excluded.mime_type,byte_size=excluded.byte_size,quality_status='PENDING',updated_at=excluded.updated_at")
        .bind(id, env.TENANT_ID, session.id, question.key, objectKey, mime, data.length, now),
      env.DB.prepare("UPDATE assessment_sessions SET current_question_key=?1,updated_at=?2 WHERE tenant_id=?3 AND id=?4 AND status='active'")
        .bind(next || "", now, env.TENANT_ID, session.id)
    ]);
  } catch (error) { try { await env.PHOTO_BUCKET.delete(objectKey); } catch (ignore) {} throw error; }
  if (!next) {
    var answerRows = await env.DB.prepare("SELECT question_key,answer_json FROM assessment_answers WHERE tenant_id=?1 AND session_id=?2").bind(env.TENANT_ID, session.id).all();
    var photoRows = await env.DB.prepare("SELECT kind FROM assessment_photos WHERE tenant_id=?1 AND session_id=?2").bind(env.TENANT_ID, session.id).all();
    var answers = {}; (answerRows.results || []).forEach(function (row) { answers[row.question_key] = parse(row.answer_json, null); });
    var photoKinds = (photoRows.results || []).map(function (row) { return row.kind; });
    var result = spec.evaluate(answers, photoKinds); var summary = spec.summary(answers, photoKinds, result);
    var submittedStatus = result.caseTags.some(function (tag) { return /待人工聯絡/.test(tag); })
      ? "contact_manually" : result.bookingRoute;
    await env.DB.prepare("UPDATE assessment_sessions SET status=?1,booking_route=?2,case_tags_json=?3,missing_fields_json=?4,owner_summary=?5,submitted_at=?6,updated_at=?6 WHERE tenant_id=?7 AND id=?8 AND status='active'")
      .bind(submittedStatus, result.bookingRoute, JSON.stringify(result.caseTags), JSON.stringify(result.missingFields), summary, now, env.TENANT_ID, session.id).run();
  }
  return { ok: true, kind: question.key, nextQuestion: next ? spec.questions.find(function (item) { return item.key === next; }) : null, submitted: !next };
}

export async function updateOwnerAssessmentQuestion(env, code, questionKey, input) {
  var template = await seedAssessmentQuestions(env, code);
  var row = await env.DB.prepare("SELECT id,system_locked FROM assessment_questions WHERE tenant_id=?1 AND template_id=?2 AND question_key=?3")
    .bind(env.TENANT_ID, template.id, String(questionKey || "")).first();
  if (!row) fail("找不到評估題目", 404);
  if (Number(row.system_locked) === 1) fail("健康與安全題不可修改", 403);
  var prompt = String(input && input.prompt || "").trim(); var options = input && input.options;
  if (!prompt || prompt.length > 300) fail("題目內容格式錯誤", 400);
  if (!Array.isArray(options) || options.length < 2 || options.length > 20 || options.some(function (item) { return !String(item || "").trim() || String(item).length > 100; })) fail("選項格式錯誤", 400);
  var now = new Date().toISOString();
  await env.DB.prepare("UPDATE assessment_questions SET prompt=?1,options_json=?2,updated_at=?3 WHERE tenant_id=?4 AND id=?5 AND system_locked=0")
    .bind(prompt, JSON.stringify(options.map(function (item) { return String(item).trim(); })), now, env.TENANT_ID, row.id).run();
  return { ok: true, questionKey: String(questionKey), prompt: prompt, options: options };
}

export async function listOwnerAssessmentTemplates(env) {
  var assigned = await env.DB.prepare(
    "SELECT DISTINCT COALESCE(NULLIF(json_extract(settings_json,'$.assessmentTemplateCode'),''),assessment_template_code) AS code FROM services " +
    "WHERE tenant_id=?1"
  ).bind(env.TENANT_ID).all();
  var tenantSetting = await env.DB.prepare(
    "SELECT setting_value FROM tenant_settings " +
    "WHERE tenant_id=?1 AND setting_key='assessment_template_code'"
  ).bind(env.TENANT_ID).first();
  var configuredCodes = configuredOwnerAssessmentTemplateCodes(
    assigned.results,
    tenantSetting && tenantSetting.setting_value
  );
  for (var index = 0; index < configuredCodes.length; index += 1) {
    await seedAssessmentQuestions(env, configuredCodes[index]);
  }
  var result = await env.DB.prepare("SELECT t.code,t.name,t.version,t.status,q.question_key,q.step_order,q.question_type,q.prompt,q.options_json,q.required,q.system_locked,q.active FROM assessment_templates t JOIN assessment_questions q ON q.tenant_id=t.tenant_id AND q.template_id=t.id WHERE t.tenant_id=?1 AND q.active=1 ORDER BY t.code,q.step_order")
    .bind(env.TENANT_ID).all();
  var grouped = {};
  (result.results || []).forEach(function (row) {
    if (!grouped[row.code]) grouped[row.code] = { code: row.code, name: row.name, version: row.version, status: row.status, questions: [] };
    grouped[row.code].questions.push({ key: row.question_key, type: row.question_type, prompt: row.prompt,
      options: parse(row.options_json, []), required: Boolean(row.required), systemLocked: Boolean(row.system_locked), active: Boolean(row.active) });
  });
  return { ok: true, configuredTemplateCodes: configuredCodes,
    templates: Object.values(grouped).filter(function (item) { return configuredCodes.includes(item.code); }) };
}

export async function listOwnerAssessments(env) {
  var result = await env.DB.prepare(
    "SELECT s.id,s.status,s.current_question_key,s.booking_route,s.case_tags_json,s.missing_fields_json," +
    "s.owner_summary,s.submitted_at,s.reviewed_at,s.updated_at,t.code AS template_code,t.name AS template_name," +
    "COALESCE(c.display_name,la.display_name,'LINE 客人') AS customer_name " +
    "FROM assessment_sessions s JOIN assessment_templates t ON t.tenant_id=s.tenant_id AND t.id=s.template_id " +
    "LEFT JOIN line_accounts la ON la.tenant_id=s.tenant_id AND la.line_user_id=s.line_user_id " +
    "LEFT JOIN customers c ON c.tenant_id=s.tenant_id AND c.id=la.customer_id " +
    "WHERE s.tenant_id=?1 AND s.status NOT IN ('active','paused') " +
    "ORDER BY CASE s.status WHEN '優先待審核' THEN 0 WHEN '暫不開放排程' THEN 1 WHEN '待補資料' THEN 2 WHEN '一般待審核' THEN 3 ELSE 4 END,s.updated_at DESC LIMIT 100"
  ).bind(env.TENANT_ID).all();
  return Promise.all((result.results || []).map(async function (row) {
    var answers = await env.DB.prepare("SELECT question_key,answer_json FROM assessment_answers WHERE tenant_id=?1 AND session_id=?2 ORDER BY created_at")
      .bind(env.TENANT_ID, row.id).all();
    var photos = await env.DB.prepare("SELECT id,kind,mime_type,byte_size,quality_status,quality_notes,created_at FROM assessment_photos WHERE tenant_id=?1 AND session_id=?2 ORDER BY created_at")
      .bind(env.TENANT_ID, row.id).all();
    var answerObject = {}; (answers.results || []).forEach(function (answer) { answerObject[answer.question_key] = parse(answer.answer_json, null); });
    return { id: row.id, status: row.status, currentQuestionKey: row.current_question_key,
      bookingRoute: row.booking_route, caseTags: parse(row.case_tags_json, []),
      missingFields: parse(row.missing_fields_json, []), ownerSummary: row.owner_summary || "",
      submittedAt: row.submitted_at || null, reviewedAt: row.reviewed_at || null, updatedAt: row.updated_at,
      templateCode: row.template_code, templateName: row.template_name, customerName: row.customer_name,
      answers: answerObject, photos: (photos.results || []).map(function (photo) {
        return { photoId: photo.id, kind: photo.kind, mimeType: photo.mime_type,
          byteSize: Number(photo.byte_size) || 0, qualityStatus: photo.quality_status,
          qualityNotes: photo.quality_notes || "", createdAt: photo.created_at };
      }) };
  }));
}

export async function reviewOwnerAssessment(env, sessionId, input) {
  var reviewStatus = String(input && input.status || "");
  var sessionStatus = ({ approved: "approved", need_more_information: "待補資料",
    temporarily_unavailable: "暫不開放排程", contact_manually: "contact_manually" })[reviewStatus];
  if (!sessionStatus) fail("不支援的審核狀態", 400);
  var message = String(input && input.message || "").trim();
  if (message.length > 1000) fail("說明不可超過 1000 字", 400);
  if (reviewStatus === "need_more_information" && !message) fail("請填寫需要補充的資料", 400);
  if (!env.STAFF_ID) fail("業主身分設定不完整", 500);
  var now = new Date().toISOString(); var reviewId = crypto.randomUUID();
  var update = env.DB.prepare("UPDATE assessment_sessions SET status=?1,booking_route=CASE WHEN ?1='待補資料' THEN '待補資料' WHEN ?1='暫不開放排程' THEN '暫不開放排程' ELSE booking_route END,reviewed_at=?2,updated_at=?2 WHERE tenant_id=?3 AND id=?4 AND status NOT IN ('active','paused')")
    .bind(sessionStatus, now, env.TENANT_ID, String(sessionId || ""));
  var insert = env.DB.prepare("INSERT INTO assessment_reviews (id,tenant_id,session_id,status,owner_id,customer_message,created_at) SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE EXISTS (SELECT 1 FROM assessment_sessions WHERE tenant_id=?2 AND id=?3 AND status NOT IN ('active','paused'))")
    .bind(reviewId, env.TENANT_ID, String(sessionId || ""), reviewStatus, env.STAFF_ID, message, now);
  var results = await env.DB.batch([update, insert]);
  if (!results[0].meta || Number(results[0].meta.changes) !== 1) fail("找不到評估案件", 404);
  var notification = await enqueueAssessmentReviewNotification(
    env, String(sessionId), reviewStatus, message
  );
  if (notification.queued && notification.notificationId) {
    await dispatchLineNotificationById(env, notification.notificationId);
  }
  return { ok: true, id: String(sessionId), status: sessionStatus, reviewedAt: now,
    notification: notification };
}

export async function getOwnerAssessmentPhotoContent(env, sessionId, photoId) {
  if (!env.PHOTO_BUCKET) fail("照片儲存空間尚未設定", 500);
  var row = await env.DB.prepare("SELECT object_key,mime_type FROM assessment_photos WHERE tenant_id=?1 AND session_id=?2 AND id=?3")
    .bind(env.TENANT_ID, String(sessionId || ""), String(photoId || "")).first();
  if (!row) fail("找不到照片", 404);
  var object = await env.PHOTO_BUCKET.get(row.object_key); if (!object) fail("照片檔案不存在", 404);
  return { body: object.body, mimeType: row.mime_type };
}
