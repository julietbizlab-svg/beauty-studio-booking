import { createOwnerAccessInvite } from "./owner-hub.js";
import { BROW_INTAKE_INTRO } from "./brow-intake-template.js";
import { LIP_INTAKE_INTRO } from "./lip-intake-template.js";
import {
  EYELINER_INTAKE_INTRO,
  UNDEREYE_INTAKE_INTRO
} from "./eye-assessment-templates.js";
import {
  BROW_LIGHTENING_INTRO,
  LIP_LIGHTENING_INTRO
} from "./lightening-assessment-templates.js";
import {
  lineCustomerLiffIdForTenant,
  tenantLineChannelReadiness
} from "./line-channel-routing.js";

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

function requiredText(value, label, maxLength) {
  var text = String(value || "").trim();
  if (!text || text.length > maxLength) {
    throw makeError("請輸入有效的" + label, 400);
  }
  return text;
}

async function sha256Hex(value) {
  var bytes = new TextEncoder().encode(String(value || ""));
  var digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(function (byte) {
    return byte.toString(16).padStart(2, "0");
  }).join("");
}

function randomToken() {
  var bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(function (byte) {
    return byte.toString(16).padStart(2, "0");
  }).join("");
}

export function assertPlatformOperator(env, selected) {
  if (!env || !selected ||
      selected.tenantId !== env.TENANT_ID ||
      selected.staffId !== env.STAFF_ID ||
      selected.role !== "owner") {
    throw makeError("只有平台本人可以開通業主帳號", 403);
  }
}

function acceptanceIds(platformTenantId, plan) {
  var safe = String(platformTenantId || "platform")
    .replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
  var suffix = plan === "flagship" ? "mauve" : "beige";
  return {
    tenantId: "acceptance-" + safe + "-" + suffix,
    locationId: "acceptance-location-" + safe + "-" + suffix,
    staffId: "acceptance-owner-" + safe + "-" + suffix
  };
}

/**
 * 建立平台本人專用的兩個驗收工作室。這些空間使用獨立 tenant，
 * 不改任何真實業主方案；重複執行只會確認固定的驗收權限設定。
 */
export async function ensurePlatformAcceptanceStudios(env, selected, lineUserId) {
  if (!env || !env.DB || !env.LINE_PROVIDER_ID) {
    throw makeError("平台驗收環境設定不完整", 500);
  }
  assertPlatformOperator(env, selected);
  var identity = requiredText(lineUserId, "平台登入身分", 200);
  var now = new Date().toISOString();
  var plans = ["standard", "flagship"];
  var studios = [];

  for (var index = 0; index < plans.length; index += 1) {
    var plan = plans[index];
    var ids = acceptanceIds(env.TENANT_ID, plan);
    var flagship = plan === "flagship" ? 1 : 0;
    var name = plan === "flagship" ? "藕粉版驗收工作室" : "米色版驗收工作室";
    var assessment = plan === "flagship" ? "brow_new_client" : "none";
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO tenants " +
        "(id,code,name,status,owner_name,created_at,updated_at) " +
        "VALUES (?1,?2,?3,'active','平台驗收',?4,?4)"
      ).bind(ids.tenantId, ids.tenantId, name, now),
      env.DB.prepare(
        "INSERT OR IGNORE INTO locations " +
        "(id,tenant_id,code,name,is_default,status,created_at,updated_at) " +
        "VALUES (?1,?2,'main',?3,1,'active',?4,?4)"
      ).bind(ids.locationId, ids.tenantId, name, now),
      env.DB.prepare(
        "INSERT OR IGNORE INTO staff " +
        "(id,tenant_id,location_id,code,display_name,role,status,booking_enabled,settings_json,created_at,updated_at) " +
        "VALUES (?1,?2,?3,'owner','平台驗收','owner','active',1,'{}',?4,?4)"
      ).bind(ids.staffId, ids.tenantId, ids.locationId, now),
      env.DB.prepare(
        "INSERT INTO tenant_features " +
        "(tenant_id,plan_code,customer_import_enabled,customer_export_enabled,customer_ai_enabled,owner_ai_enabled,updated_at) " +
        "VALUES (?1,?2,?3,0,?3,?3,?4) ON CONFLICT(tenant_id) DO UPDATE SET " +
        "plan_code=excluded.plan_code,customer_import_enabled=excluded.customer_import_enabled," +
        "customer_ai_enabled=excluded.customer_ai_enabled,owner_ai_enabled=excluded.owner_ai_enabled,updated_at=excluded.updated_at"
      ).bind(ids.tenantId, plan, flagship, now),
      env.DB.prepare(
        "INSERT INTO tenant_subscriptions (tenant_id,status,starts_on,updated_at) " +
        "VALUES (?1,'active',date('now','+8 hours'),?2) ON CONFLICT(tenant_id) DO UPDATE SET " +
        "status='active',pending_plan_code=NULL,pending_effective_on=NULL,updated_at=excluded.updated_at"
      ).bind(ids.tenantId, now),
      env.DB.prepare(
        "INSERT INTO tenant_settings (id,tenant_id,setting_key,setting_value,value_type,created_at,updated_at) " +
        "VALUES (?1,?2,'assessment_template_code',?3,'string',?4,?4) " +
        "ON CONFLICT(tenant_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at"
      ).bind(crypto.randomUUID(), ids.tenantId, assessment, now),
      env.DB.prepare(
        "INSERT INTO tenant_settings (id,tenant_id,setting_key,setting_value,value_type,created_at,updated_at) " +
        "VALUES (?1,?2,'platform_acceptance_mode','true','boolean',?3,?3) ON CONFLICT(tenant_id,setting_key) DO NOTHING"
      ).bind(crypto.randomUUID(), ids.tenantId, now),
      env.DB.prepare(
        "INSERT OR IGNORE INTO assessment_templates " +
        "(id,tenant_id,code,name,version,intro_text,status,created_at,updated_at) " +
        "VALUES (?1,?2,'brow_new_client','霧眉新客評估',1,'為了讓老師先了解您的眉部狀況及需求，接下來會進行簡短的新客評估。','active',?3,?3)"
      ).bind("assessment-template-brow-" + ids.tenantId, ids.tenantId, now),
      env.DB.prepare(
        "INSERT OR IGNORE INTO assessment_templates " +
        "(id,tenant_id,code,name,version,intro_text,status,created_at,updated_at) " +
        "VALUES (?1,?2,'lip_blush_new_client','霧唇新客評估',1,'為了讓老師先了解您的原生唇色、舊唇色、唇部狀況及需求，接下來會進行簡短的霧唇新客評估。','active',?3,?3)"
      ).bind("assessment-template-lip-" + ids.tenantId, ids.tenantId, now),
      env.DB.prepare(
        "INSERT INTO staff_line_accounts " +
        "(id,tenant_id,staff_id,provider_id,line_user_id,status,linked_at,last_seen_at) " +
        "VALUES (?1,?2,?3,?4,?5,'active',?6,?6) ON CONFLICT(tenant_id,staff_id) DO UPDATE SET " +
        "provider_id=excluded.provider_id,line_user_id=excluded.line_user_id,status='active',last_seen_at=excluded.last_seen_at"
      ).bind(crypto.randomUUID(), ids.tenantId, ids.staffId,
        env.LINE_PROVIDER_ID, identity, now),
      env.DB.prepare(
        "INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,action,entity_type,entity_id,source,metadata_json,created_at) " +
        "VALUES (?1,?2,'staff',?3,'platform_acceptance_workspace_ensured','tenant',?2,'admin',?4,?5)"
      ).bind(crypto.randomUUID(), ids.tenantId, selected.staffId,
        JSON.stringify({ plan: plan, isolated: true }), now)
    ]);
    studios.push({ tenantId: ids.tenantId, plan: plan, studioName: name });
  }
  return { ok: true, studios: studios };
}

function dateText(value, label, required) {
  var text = String(value || "").trim();
  if (!text && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
      new Date(text + "T00:00:00.000Z").toISOString().slice(0, 10) !== text) {
    throw makeError("請輸入有效的" + label, 400);
  }
  return text;
}

function planFeatures(plan) {
  var enabled = plan === "flagship" ? 1 : 0;
  return [enabled, enabled, enabled];
}

function assessmentTemplateCode(value) {
  var code = String(value || "").trim();
  if (["all_supported", "brow_new_client", "lip_blush_new_client"].indexOf(code) === -1) {
    throw makeError("請選擇全方位、霧眉或霧唇新客評估", 400);
  }
  return code;
}

function assessmentForPlan(plan, value) {
  if (plan === "standard") return "none";
  return assessmentTemplateCode(value);
}

export async function provisionOwnerStudio(env, selected, params) {
  if (!env || !env.DB) throw makeError("平台資料庫設定不完整", 500);
  assertPlatformOperator(env, selected);
  var input = params || {};
  var requestedPlan = String(input.plan || "");
  var isTrial = requestedPlan === "trial" || requestedPlan === "standard_trial";
  var plan = (requestedPlan === "flagship" || requestedPlan === "trial") ? "flagship" : "standard";
  var selectedAssessmentTemplate = assessmentForPlan(plan, input.assessmentTemplateCode);
  var studioName = "待業主首次設定";
  var ownerName = "待業主首次設定";

  var tenantId = crypto.randomUUID();
  var locationId = crypto.randomUUID();
  var staffId = crypto.randomUUID();
  var inviteId = crypto.randomUUID();
  var auditId = crypto.randomUUID();
  var suffix = tenantId.replace(/-/g, "").slice(0, 12);
  var token = randomToken();
  var customerEntryKey = randomToken();
  var tokenHash = await sha256Hex(token);
  var now = new Date();
  var createdAt = now.toISOString();
  var expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  var flagship = plan === "flagship" ? 1 : 0;
  var tenantStatus = isTrial ? "trial" : "active";

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO tenants " +
      "(id, code, name, status, owner_name, created_at, updated_at) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)"
    ).bind(tenantId, "studio-" + suffix, studioName, tenantStatus, ownerName, createdAt),
    env.DB.prepare(
      "INSERT INTO locations " +
      "(id, tenant_id, code, name, is_default, status, created_at, updated_at) " +
      "VALUES (?1, ?2, 'main', ?3, 1, 'active', ?4, ?4)"
    ).bind(locationId, tenantId, studioName, createdAt),
    env.DB.prepare(
      "INSERT INTO staff " +
      "(id, tenant_id, location_id, code, display_name, role, status, " +
      "booking_enabled, settings_json, created_at, updated_at) " +
      "VALUES (?1, ?2, ?3, 'owner', ?4, 'owner', 'active', 1, '{}', ?5, ?5)"
    ).bind(staffId, tenantId, locationId, ownerName, createdAt),
    env.DB.prepare(
      "INSERT INTO tenant_features " +
      "(tenant_id, plan_code, customer_import_enabled, customer_export_enabled, " +
      "customer_ai_enabled, owner_ai_enabled, updated_at) " +
      "VALUES (?1, ?2, ?3, 0, ?3, ?3, ?4)"
    ).bind(tenantId, plan, flagship, createdAt),
    env.DB.prepare(
      "INSERT INTO tenant_subscriptions (tenant_id, status, updated_at) " +
      "VALUES (?1, ?2, ?3)"
    ).bind(tenantId, isTrial ? "trial" : "active", createdAt),
    env.DB.prepare(
      "INSERT INTO tenant_settings " +
      "(id, tenant_id, setting_key, setting_value, value_type, created_at, updated_at) " +
      "VALUES (?1, ?2, 'booking_min_notice_days', '1', 'number', ?3, ?3)"
    ).bind(crypto.randomUUID(), tenantId, createdAt),
    env.DB.prepare(
      "INSERT INTO tenant_settings " +
      "(id, tenant_id, setting_key, setting_value, value_type, created_at, updated_at) " +
      "VALUES (?1, ?2, 'assessment_template_code', ?3, 'string', ?4, ?4)"
    ).bind(crypto.randomUUID(), tenantId, selectedAssessmentTemplate, createdAt),
    env.DB.prepare(
      "INSERT INTO assessment_templates " +
      "(id,tenant_id,code,name,version,intro_text,status,created_at,updated_at) " +
      "VALUES (?1,?2,'brow_new_client','霧眉新客評估',1,?3,'active',?4,?4)"
    ).bind(crypto.randomUUID(), tenantId, BROW_INTAKE_INTRO, createdAt),
    env.DB.prepare(
      "INSERT INTO assessment_templates " +
      "(id,tenant_id,code,name,version,intro_text,status,created_at,updated_at) " +
      "VALUES (?1,?2,'lip_blush_new_client','霧唇新客評估',1,?3,'active',?4,?4)"
    ).bind(crypto.randomUUID(), tenantId, LIP_INTAKE_INTRO, createdAt),
    env.DB.prepare(
      "INSERT INTO assessment_templates " +
      "(id,tenant_id,code,name,version,intro_text,status,created_at,updated_at) " +
      "VALUES (?1,?2,'eyeliner_new_client','眼線／美瞳線新客評估',1,?3,'active',?4,?4)"
    ).bind(crypto.randomUUID(), tenantId, EYELINER_INTAKE_INTRO, createdAt),
    env.DB.prepare(
      "INSERT INTO assessment_templates " +
      "(id,tenant_id,code,name,version,intro_text,status,created_at,updated_at) " +
      "VALUES (?1,?2,'under_eye_new_client','光影臥蠶新客評估',1,?3,'active',?4,?4)"
    ).bind(crypto.randomUUID(), tenantId, UNDEREYE_INTAKE_INTRO, createdAt),
    env.DB.prepare(
      "INSERT INTO assessment_templates " +
      "(id,tenant_id,code,name,version,intro_text,status,created_at,updated_at) " +
      "VALUES (?1,?2,'brow_lightening_new_client','舊眉輕色管理｜新客評估',1,?3,'active',?4,?4)"
    ).bind(crypto.randomUUID(), tenantId, BROW_LIGHTENING_INTRO, createdAt),
    env.DB.prepare(
      "INSERT INTO assessment_templates " +
      "(id,tenant_id,code,name,version,intro_text,status,created_at,updated_at) " +
      "VALUES (?1,?2,'lip_lightening_new_client','舊唇輕色管理｜新客評估',1,?3,'active',?4,?4)"
    ).bind(crypto.randomUUID(), tenantId, LIP_LIGHTENING_INTRO, createdAt),
    env.DB.prepare(
      "INSERT INTO tenant_settings " +
      "(id, tenant_id, setting_key, setting_value, value_type, created_at, updated_at) " +
      "VALUES (?1, ?2, 'cancellation_min_notice_days', '1', 'number', ?3, ?3)"
    ).bind(crypto.randomUUID(), tenantId, createdAt),
    env.DB.prepare(
      "INSERT INTO tenant_settings " +
      "(id, tenant_id, setting_key, setting_value, value_type, created_at, updated_at) " +
      "VALUES (?1, ?2, 'customer_entry_key', ?3, 'string', ?4, ?4)"
    ).bind(crypto.randomUUID(), tenantId, customerEntryKey, createdAt),
    env.DB.prepare(
      "INSERT INTO owner_access_invites " +
      "(id, tenant_id, staff_id, token_hash, status, expires_at, created_at) " +
      "VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6)"
    ).bind(inviteId, tenantId, staffId, tokenHash, expiresAt, createdAt),
    env.DB.prepare(
      "INSERT INTO audit_logs " +
      "(id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, " +
      "source, metadata_json, created_at) " +
      "VALUES (?1, ?2, 'staff', ?3, 'platform_owner_studio_created', " +
      "'tenant', ?2, 'admin', ?4, ?5)"
    ).bind(
      auditId,
      tenantId,
      selected.staffId,
      JSON.stringify({ plan: plan, trial: isTrial, trialDays: isTrial ? 14 : null,
        assessmentTemplateCode: selectedAssessmentTemplate }),
      createdAt
    )
  ]);

  return {
    ok: true,
    tenantId: tenantId,
    plan: plan,
    assessmentTemplateCode: selectedAssessmentTemplate,
    trial: isTrial,
    inviteToken: token,
    customerEntryKey: customerEntryKey,
    expiresAt: expiresAt
  };
}

export async function listPlatformStudios(env, selected) {
  if (!env || !env.DB) throw makeError("平台資料庫設定不完整", 500);
  assertPlatformOperator(env, selected);
  var result = await env.DB.prepare(
    "SELECT t.id AS tenant_id, t.name AS studio_name, t.owner_name, t.status, " +
    "CASE WHEN sub.pending_effective_on<=date('now','+8 hours') THEN sub.pending_plan_code " +
    "ELSE tf.plan_code END AS plan_code, " +
    "CASE WHEN sub.ends_on<date('now','+8 hours') THEN 'expired' ELSE sub.status END AS subscription_status, " +
    "sub.starts_on, sub.ends_on, " +
    "CASE WHEN sub.pending_effective_on>date('now','+8 hours') THEN sub.pending_plan_code END AS pending_plan_code, " +
    "CASE WHEN sub.pending_effective_on>date('now','+8 hours') THEN sub.pending_effective_on END AS pending_effective_on, " +
    "i.status AS invite_status, i.expires_at AS invite_expires_at, i.claimed_at AS invite_claimed_at, " +
    "CASE WHEN sla.id IS NULL THEN 0 ELSE 1 END AS identity_bound, " +
    "CASE WHEN COALESCE(tf.plan_code,'standard')='standard' THEN 'none' " +
    "WHEN ats.setting_value='all_supported' THEN 'all_supported' " +
    "WHEN ats.setting_value='lip_blush_new_client' THEN 'lip_blush_new_client' " +
    "ELSE 'brow_new_client' END AS assessment_template_code, " +
    "entry.setting_value AS customer_entry_key " +
    "FROM tenants t " +
    "LEFT JOIN tenant_features tf ON tf.tenant_id=t.id " +
    "LEFT JOIN tenant_subscriptions sub ON sub.tenant_id=t.id " +
    "LEFT JOIN staff s ON s.id=(" +
    "SELECT s2.id FROM staff s2 WHERE s2.tenant_id=t.id AND s2.role='owner' " +
    "AND s2.status='active' ORDER BY s2.created_at ASC LIMIT 1) " +
    "LEFT JOIN staff_line_accounts sla ON sla.tenant_id=t.id " +
    "AND sla.staff_id=s.id AND sla.status='active' " +
    "LEFT JOIN owner_access_invites i ON i.id=(" +
    "SELECT oi.id FROM owner_access_invites oi " +
    "WHERE oi.tenant_id=t.id AND oi.staff_id=s.id " +
    "ORDER BY oi.created_at DESC LIMIT 1) " +
    "LEFT JOIN tenant_settings ats ON ats.tenant_id=t.id AND ats.setting_key='assessment_template_code' " +
    "LEFT JOIN tenant_settings entry ON entry.tenant_id=t.id AND entry.setting_key='customer_entry_key' " +
    "LEFT JOIN tenant_settings pam ON pam.tenant_id=t.id AND pam.setting_key='platform_acceptance_mode' " +
    "WHERE COALESCE(pam.setting_value,'false')<>'true' " +
    "ORDER BY CASE WHEN t.id=?1 THEN 0 ELSE 1 END, t.created_at DESC"
  ).bind(env.TENANT_ID).all();
  return {
    ok: true,
    studios: (result.results || []).map(function (row) {
      var lineReadiness = tenantLineChannelReadiness(env, row.tenant_id);
      return {
        tenantId: row.tenant_id,
        studioName: row.studio_name,
        ownerName: row.owner_name,
        status: row.status,
        plan: row.plan_code === "flagship" ? "flagship" : "standard",
        subscriptionStatus: row.subscription_status || "unconfigured",
        startsOn: row.starts_on || "",
        endsOn: row.ends_on || "",
        pendingPlan: row.pending_plan_code || "",
        pendingEffectiveOn: row.pending_effective_on || "",
        inviteStatus: row.invite_status || "",
        inviteExpiresAt: row.invite_expires_at || "",
        inviteClaimedAt: row.invite_claimed_at || "",
        identityBound: Boolean(row.identity_bound),
        assessmentTemplateCode: row.assessment_template_code === "none" ? "none" :
          (row.assessment_template_code === "all_supported" ? "all_supported" :
            (row.assessment_template_code === "lip_blush_new_client" ?
              "lip_blush_new_client" : "brow_new_client")),
        customerEntryKey: row.customer_entry_key || "",
        customerLiffId: lineCustomerLiffIdForTenant(env, row.tenant_id),
        lineConfigured: lineReadiness.configured,
        lineReady: lineReadiness.ready,
        lineMissing: lineReadiness.missing,
        isPlatformStudio: row.tenant_id === env.TENANT_ID
      };
    })
  };
}

export async function ensurePlatformStudioCustomerEntry(env, selected, tenantId) {
  if (!env || !env.DB) throw makeError("平台資料庫設定不完整", 500);
  assertPlatformOperator(env, selected);
  var targetTenantId = String(tenantId || "").trim();
  if (!targetTenantId || targetTenantId === env.TENANT_ID) {
    throw makeError("請選擇一般業主工作室", 400);
  }

  var target = await env.DB.prepare(
    "SELECT id FROM tenants WHERE id=?1 AND status IN ('active','trial')"
  ).bind(targetTenantId).first();
  if (!target) throw makeError("找不到可使用的工作室", 404);

  var existing = await env.DB.prepare(
    "SELECT setting_value FROM tenant_settings " +
    "WHERE tenant_id=?1 AND setting_key='customer_entry_key' LIMIT 1"
  ).bind(targetTenantId).first();
  if (existing && existing.setting_value) {
    return { ok: true, customerEntryKey: existing.setting_value, created: false };
  }

  var key = randomToken();
  var now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO tenant_settings " +
      "(id,tenant_id,setting_key,setting_value,value_type,created_at,updated_at) " +
      "VALUES (?1,?2,'customer_entry_key',?3,'string',?4,?4) " +
      "ON CONFLICT(tenant_id,setting_key) DO NOTHING"
    ).bind(crypto.randomUUID(), targetTenantId, key, now),
    env.DB.prepare(
      "INSERT INTO audit_logs " +
      "(id,tenant_id,actor_type,actor_id,action,entity_type,entity_id,source,metadata_json,created_at) " +
      "VALUES (?1,?2,'staff',?3,'platform_customer_entry_created','tenant',?2,'admin','{}',?4)"
    ).bind(crypto.randomUUID(), targetTenantId, selected.staffId, now)
  ]);
  var saved = await env.DB.prepare(
    "SELECT setting_value FROM tenant_settings " +
    "WHERE tenant_id=?1 AND setting_key='customer_entry_key' LIMIT 1"
  ).bind(targetTenantId).first();
  return { ok: true, customerEntryKey: saved.setting_value, created: true };
}

export async function getStudioCustomerEntryKey(env) {
  if (!env || !env.DB || !env.TENANT_ID) {
    throw makeError("工作室客戶入口設定不完整", 500);
  }
  var row = await env.DB.prepare(
    "SELECT entry.setting_value AS customer_entry_key FROM tenants t " +
    "LEFT JOIN tenant_settings entry ON entry.tenant_id=t.id " +
    "AND entry.setting_key='customer_entry_key' " +
    "WHERE t.id=?1 AND t.status IN ('active','trial') LIMIT 1"
  ).bind(env.TENANT_ID).first();
  return row && /^[a-f0-9]{64}$/i.test(String(row.customer_entry_key || ""))
    ? String(row.customer_entry_key).toLowerCase() : "";
}

/**
 * 對尚未綁定 LINE 的原 tenant／owner staff 重發 24 小時一次性邀請。
 * 只撤銷舊 active 邀請並建立新邀請；不重建 tenant、location、staff 或方案。
 */
export async function reissuePlatformOwnerInvite(env, selected, tenantId) {
  if (!env || !env.DB) throw makeError("平台資料庫設定不完整", 500);
  assertPlatformOperator(env, selected);
  var targetTenantId = String(tenantId || "").trim();
  if (!targetTenantId) throw makeError("缺少工作室識別", 400);
  if (targetTenantId === env.TENANT_ID) {
    throw makeError("平台自己的工作室不需重發業主邀請", 409);
  }

  var target = await env.DB.prepare(
    "SELECT t.id AS tenant_id, s.id AS staff_id, " +
    "CASE WHEN sla.id IS NULL THEN 0 ELSE 1 END AS identity_bound " +
    "FROM tenants t " +
    "LEFT JOIN staff s ON s.tenant_id=t.id AND s.role='owner' AND s.status='active' " +
    "LEFT JOIN staff_line_accounts sla ON sla.tenant_id=t.id " +
    "AND sla.staff_id=s.id AND sla.status='active' " +
    "WHERE t.id=?1"
  ).bind(targetTenantId).first();
  if (!target || !target.tenant_id) throw makeError("找不到指定工作室", 404);
  if (Number(target.identity_bound) === 1) {
    throw makeError("已綁定 LINE 的工作室不可重發邀請", 409);
  }
  if (!target.staff_id) throw makeError("找不到可邀請的業主人員", 404);

  var invite = await createOwnerAccessInvite(env, target.tenant_id, target.staff_id);
  var now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO audit_logs " +
      "(id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, " +
      "source, metadata_json, created_at) VALUES " +
      "(?1, ?2, 'staff', ?3, 'platform_owner_invite_reissued', " +
      "'tenant', ?2, 'admin', ?4, ?5)"
    ).bind(
      crypto.randomUUID(),
      target.tenant_id,
      selected.staffId,
      JSON.stringify({ staffId: target.staff_id, expiresAt: invite.expiresAt }),
      now
    )
  ]);

  return {
    ok: true,
    tenantId: target.tenant_id,
    inviteToken: invite.inviteToken,
    expiresAt: invite.expiresAt
  };
}

export async function updatePlatformStudioAssessmentTemplate(env, selected, tenantId, params) {
  if (!env || !env.DB) throw makeError("平台資料庫設定不完整", 500);
  assertPlatformOperator(env, selected);
  var targetTenantId = String(tenantId || "").trim();
  var target = await env.DB.prepare(
    "SELECT t.id,COALESCE(tf.plan_code,'standard') AS plan_code FROM tenants t " +
    "LEFT JOIN tenant_features tf ON tf.tenant_id=t.id WHERE t.id=?1"
  ).bind(targetTenantId).first();
  if (!target) throw makeError("找不到指定工作室", 404);
  var code = assessmentForPlan(target.plan_code === "flagship" ? "flagship" : "standard",
    params && params.assessmentTemplateCode);
  var now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenant_settings (id,tenant_id,setting_key,setting_value,value_type,created_at,updated_at) VALUES (?1,?2,'assessment_template_code',?3,'string',?4,?4) ON CONFLICT(tenant_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at")
      .bind(crypto.randomUUID(), targetTenantId, code, now),
    env.DB.prepare("UPDATE assessment_sessions SET status='paused',updated_at=?1 WHERE tenant_id=?2 AND status='active' AND ?3<>'all_supported' AND template_id IN (SELECT id FROM assessment_templates WHERE tenant_id=?2 AND code<>?3)")
      .bind(now, targetTenantId, code),
    env.DB.prepare("INSERT INTO audit_logs (id,tenant_id,actor_type,actor_id,action,entity_type,entity_id,source,metadata_json,created_at) VALUES (?1,?2,'staff',?3,'platform_assessment_template_assigned','tenant',?2,'admin',?4,?5)")
      .bind(crypto.randomUUID(), targetTenantId, selected.staffId,
        JSON.stringify({ assessmentTemplateCode: code }), now)
  ]);
  return { ok: true, tenantId: targetTenantId, assessmentTemplateCode: code };
}

export async function managePlatformStudioSubscription(env, selected, tenantId, params) {
  if (!env || !env.DB) throw makeError("平台資料庫設定不完整", 500);
  assertPlatformOperator(env, selected);
  var targetTenantId = String(tenantId || "").trim();
  if (!targetTenantId || targetTenantId === env.TENANT_ID) {
    throw makeError("不可修改平台本身的方案", 403);
  }
  var input = params || {};
  var action = String(input.action || "").trim();
  if (["upgrade", "renewal", "downgrade", "activate", "extend_trial"].indexOf(action) === -1) {
    throw makeError("不支援的方案操作", 400);
  }
  var effectiveOn = dateText(input.effectiveOn, "生效日",
    action !== "renewal" && action !== "extend_trial");
  var newEndsOn = dateText(input.newEndsOn, "新到期日",
    action !== "downgrade" && action !== "extend_trial");
  if ((action === "upgrade" || action === "renewal" || action === "activate") &&
      input.paymentConfirmed !== true) {
    throw makeError("必須確認已收款", 400);
  }
  var target = await env.DB.prepare(
    "SELECT t.id, COALESCE(tf.plan_code, 'standard') AS plan_code, " +
    "sub.status AS subscription_status, sub.starts_on, sub.ends_on " +
    "FROM tenants t LEFT JOIN tenant_features tf ON tf.tenant_id=t.id " +
    "LEFT JOIN tenant_subscriptions sub ON sub.tenant_id=t.id WHERE t.id=?1"
  ).bind(targetTenantId).first();
  if (!target) throw makeError("找不到指定工作室", 404);
  var currentPlan = target.plan_code === "flagship" ? "flagship" : "standard";
  if (action === "extend_trial") {
    if (target.subscription_status !== "trial" || !target.ends_on) {
      throw makeError("只有已開始的試用可以延長", 409);
    }
    var extended = new Date(target.ends_on + "T00:00:00.000Z");
    extended.setUTCDate(extended.getUTCDate() + 14);
    var extendedEndsOn = extended.toISOString().slice(0, 10);
    var extendedNow = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE tenant_subscriptions SET ends_on=?1, updated_at=?2 " +
        "WHERE tenant_id=?3 AND status='trial' AND trial_used=1"
      ).bind(extendedEndsOn, extendedNow, targetTenantId),
      env.DB.prepare(
        "INSERT INTO tenant_trial_events " +
        "(id, tenant_id, actor_type, actor_id, action, starts_on, ends_on, metadata_json, created_at) " +
        "VALUES (?1, ?2, 'staff', ?3, 'extended', ?4, ?5, ?6, ?7)"
      ).bind(crypto.randomUUID(), targetTenantId, selected.staffId, target.starts_on,
        extendedEndsOn, JSON.stringify({ extensionDays: 14 }), extendedNow),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, tenant_id, actor_type, actor_id, action, entity_type, " +
        "entity_id, source, metadata_json, created_at) VALUES " +
        "(?1, ?2, 'staff', ?3, 'platform_trial_extended', 'tenant_subscription', ?2, " +
        "'admin', ?4, ?5)"
      ).bind(crypto.randomUUID(), targetTenantId, selected.staffId,
        JSON.stringify({ previousEndsOn: target.ends_on, newEndsOn: extendedEndsOn,
          extensionDays: 14 }), extendedNow)
    ]);
    return { ok: true, tenantId: targetTenantId, plan: "flagship",
      subscriptionStatus: "trial", endsOn: extendedEndsOn };
  }
  var toPlan = currentPlan;
  if (action === "activate") {
    if (target.subscription_status !== "trial") throw makeError("只有試用工作室可以轉正式方案", 409);
    toPlan = input.targetPlan === "flagship" ? "flagship" : "standard";
    effectiveOn = effectiveOn || new Date().toISOString().slice(0, 10);
  } else if (action === "upgrade") {
    if (currentPlan !== "standard") throw makeError("只有標準版可以升級為旗艦版", 409);
    toPlan = "flagship";
  } else if (action === "downgrade") {
    if (currentPlan !== "flagship") throw makeError("只有旗艦版可以排程降級", 409);
    if (!target.ends_on) throw makeError("必須先設定目前租期到期日", 409);
    effectiveOn = target.ends_on;
    toPlan = "standard";
  }
  if (newEndsOn && effectiveOn && newEndsOn < effectiveOn) {
    throw makeError("新到期日不可早於生效日", 400);
  }
  var today = new Date().toISOString().slice(0, 10);
  if (action === "activate" && effectiveOn !== today) {
    throw makeError("試用轉正式方案必須在生效當日操作", 400);
  }
  var applyNow = (action === "upgrade" || action === "activate") && effectiveOn <= today;
  var eventAction = action === "downgrade" ? "downgrade_scheduled" :
    (action === "activate" ? (toPlan === "flagship" ? "upgrade" : "renewal") : action);
  var now = new Date().toISOString();
  var statements = [];
  if (applyNow) {
    var flags = planFeatures(toPlan);
    statements.push(env.DB.prepare(
      "UPDATE tenant_features SET plan_code=?1, customer_import_enabled=?2, " +
      "customer_ai_enabled=?3, owner_ai_enabled=?4, updated_at=?5 WHERE tenant_id=?6"
    ).bind(toPlan, flags[0], flags[1], flags[2], now, targetTenantId));
    if (toPlan === "standard" || currentPlan === "standard") {
      statements.push(env.DB.prepare(
        "INSERT INTO tenant_settings " +
        "(id,tenant_id,setting_key,setting_value,value_type,created_at,updated_at) " +
        "VALUES (?1,?2,'assessment_template_code',?3,'string',?4,?4) " +
        "ON CONFLICT(tenant_id,setting_key) DO UPDATE SET " +
        "setting_value=excluded.setting_value,updated_at=excluded.updated_at"
      ).bind(crypto.randomUUID(), targetTenantId,
        toPlan === "flagship" ? "brow_new_client" : "none", now));
    }
  }
  var pendingPlan = (action === "downgrade" || (action === "upgrade" && !applyNow)) ? toPlan : null;
  var pendingDate = pendingPlan ? effectiveOn : null;
  statements.push(env.DB.prepare(
    "INSERT INTO tenant_subscriptions " +
    "(tenant_id, status, starts_on, ends_on, pending_plan_code, pending_effective_on, updated_at) " +
    "VALUES (?1, 'active', ?2, ?3, ?4, ?5, ?6) ON CONFLICT(tenant_id) DO UPDATE SET " +
    "status='active', starts_on=COALESCE(tenant_subscriptions.starts_on, excluded.starts_on), " +
    "ends_on=COALESCE(excluded.ends_on, tenant_subscriptions.ends_on), " +
    "pending_plan_code=excluded.pending_plan_code, pending_effective_on=excluded.pending_effective_on, " +
    "updated_at=excluded.updated_at"
  ).bind(targetTenantId, effectiveOn || target.starts_on || today, newEndsOn, pendingPlan, pendingDate, now));
  if (action === "activate") {
    statements.push(env.DB.prepare(
      "UPDATE tenant_subscriptions SET starts_on=?1, updated_at=?2 WHERE tenant_id=?3"
    ).bind(effectiveOn, now, targetTenantId));
    statements.push(env.DB.prepare(
      "UPDATE tenants SET status='active', updated_at=?1 WHERE id=?2"
    ).bind(now, targetTenantId));
    statements.push(env.DB.prepare(
      "INSERT INTO tenant_trial_events " +
      "(id, tenant_id, actor_type, actor_id, action, starts_on, ends_on, metadata_json, created_at) " +
      "VALUES (?1, ?2, 'staff', ?3, 'converted', ?4, ?5, ?6, ?7)"
    ).bind(crypto.randomUUID(), targetTenantId, selected.staffId, target.starts_on,
      newEndsOn, JSON.stringify({ targetPlan: toPlan, paymentConfirmed: true }), now));
  }
  statements.push(env.DB.prepare(
    "INSERT INTO tenant_subscription_events " +
    "(id, tenant_id, actor_staff_id, action, from_plan_code, to_plan_code, " +
    "effective_on, new_ends_on, payment_confirmed, metadata_json, created_at) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '{}', ?10)"
  ).bind(crypto.randomUUID(), targetTenantId, selected.staffId, eventAction,
    currentPlan, toPlan, effectiveOn || today, newEndsOn, input.paymentConfirmed === true ? 1 : 0, now));
  statements.push(env.DB.prepare(
    "INSERT INTO audit_logs (id, tenant_id, actor_type, actor_id, action, entity_type, " +
    "entity_id, source, metadata_json, created_at) VALUES " +
    "(?1, ?2, 'staff', ?3, 'platform_subscription_' || ?4, 'tenant_subscription', ?2, " +
    "'admin', ?5, ?6)"
  ).bind(crypto.randomUUID(), targetTenantId, selected.staffId, eventAction,
    JSON.stringify({ fromPlan: currentPlan, toPlan: toPlan, effectiveOn: effectiveOn,
      newEndsOn: newEndsOn, paymentConfirmed: input.paymentConfirmed === true }), now));
  await env.DB.batch(statements);
  return { ok: true, tenantId: targetTenantId, plan: applyNow ? toPlan : currentPlan,
    pendingPlan: pendingPlan, pendingEffectiveOn: pendingDate, endsOn: newEndsOn || target.ends_on || "" };
}

export async function updatePlatformStudioIdentity(env, selected, tenantId, params) {
  if (!env || !env.DB) throw makeError("平台資料庫設定不完整", 500);
  assertPlatformOperator(env, selected);
  var targetTenantId = String(tenantId || "").trim();
  if (!targetTenantId) throw makeError("找不到指定工作室", 404);
  var input = params || {};
  var studioName = requiredText(input.studioName, "工作室名稱", 100);
  var ownerName = requiredText(input.ownerName, "業主名稱", 80);
  var target = await env.DB.prepare(
    "SELECT t.id, s.id AS staff_id FROM tenants t " +
    "JOIN staff s ON s.tenant_id=t.id AND s.role='owner' " +
    "WHERE t.id=?1"
  ).bind(targetTenantId).first();
  if (!target) throw makeError("找不到指定工作室", 404);
  var now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE tenants SET name=?1, owner_name=?2, updated_at=?3 WHERE id=?4"
    ).bind(studioName, ownerName, now, targetTenantId),
    env.DB.prepare(
      "UPDATE locations SET name=?1, updated_at=?2 WHERE tenant_id=?3 AND is_default=1"
    ).bind(studioName, now, targetTenantId),
    env.DB.prepare(
      "UPDATE staff SET display_name=?1, updated_at=?2 WHERE tenant_id=?3 AND id=?4"
    ).bind(ownerName, now, targetTenantId, target.staff_id),
    env.DB.prepare(
      "INSERT INTO tenant_settings " +
      "(id, tenant_id, setting_key, setting_value, value_type, created_at, updated_at) " +
      "VALUES (?1, ?2, 'brand_name', ?3, 'string', ?4, ?4) " +
      "ON CONFLICT(tenant_id, setting_key) DO UPDATE SET " +
      "setting_value=excluded.setting_value, updated_at=excluded.updated_at"
    ).bind(crypto.randomUUID(), targetTenantId, studioName, now),
    env.DB.prepare(
      "INSERT INTO audit_logs " +
      "(id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, " +
      "source, metadata_json, created_at) VALUES " +
      "(?1, ?2, 'staff', ?3, 'platform_studio_identity_updated', " +
      "'tenant', ?2, 'admin', ?4, ?5)"
    ).bind(
      crypto.randomUUID(), targetTenantId, selected.staffId,
      JSON.stringify({ studioName: studioName, ownerName: ownerName }), now
    )
  ]);
  return { ok: true, tenantId: targetTenantId, studioName: studioName, ownerName: ownerName };
}
