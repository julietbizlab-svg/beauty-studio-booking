import {
  extractIdTokenFromRequest,
  idTokenAudience,
  verifyLineIdToken
} from "./liff-verify.js";
import { parseOwnerUserIds } from "./owner-auth.js";
import {
  tenantIdForLiffClientId,
  tenantLineChannel
} from "./line-channel-routing.js";

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

function requiredText(value, label, maxLength) {
  var text = String(value || "").trim();
  if (!text || Array.from(text).length > maxLength) {
    throw makeError("請輸入有效的" + label, 400);
  }
  return text;
}

function ensureEnv(env) {
  if (!env || !env.DB) throw makeError("業主管理中心資料庫設定不完整", 500);
  if (!env.LINE_PROVIDER_ID) {
    throw makeError("業主管理中心 LINE Provider 尚未設定", 503);
  }
}

function taipeiDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

function addCalendarDays(dateText, days) {
  var date = new Date(dateText + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function featureDto(row) {
  var plan = row && row.plan_code === "flagship" ? "flagship" : "standard";
  return {
    plan: plan,
    customerImport: Boolean(row && row.customer_import_enabled),
    customerExport: Boolean(row && row.customer_export_enabled),
    customerAi: Boolean(row && row.customer_ai_enabled),
    ownerAi: Boolean(row && row.owner_ai_enabled)
  };
}

export async function listOwnerMemberships(env, lineUserId) {
  ensureEnv(env);
  var result = await env.DB.prepare(
    "SELECT sla.tenant_id, sla.staff_id, s.location_id, " +
    "s.display_name AS staff_name, " +
    "s.role, t.name AS tenant_name, t.status AS tenant_status, " +
    "CASE WHEN sub.pending_effective_on<=date('now','+8 hours') THEN sub.pending_plan_code " +
    "ELSE tf.plan_code END AS plan_code, " +
    "CASE WHEN sub.pending_effective_on<=date('now','+8 hours') AND sub.pending_plan_code='flagship' " +
    "THEN 1 WHEN sub.pending_effective_on<=date('now','+8 hours') THEN 0 ELSE tf.customer_import_enabled END " +
    "AS customer_import_enabled, tf.customer_export_enabled, " +
    "CASE WHEN sub.pending_effective_on<=date('now','+8 hours') AND sub.pending_plan_code='flagship' " +
    "THEN 1 WHEN sub.pending_effective_on<=date('now','+8 hours') THEN 0 ELSE tf.customer_ai_enabled END " +
    "AS customer_ai_enabled, " +
    "CASE WHEN sub.pending_effective_on<=date('now','+8 hours') AND sub.pending_plan_code='flagship' " +
    "THEN 1 WHEN sub.pending_effective_on<=date('now','+8 hours') THEN 0 ELSE tf.owner_ai_enabled END " +
    "AS owner_ai_enabled, sub.status AS subscription_status, sub.starts_on, sub.ends_on, " +
    "CASE WHEN sub.status='trial' AND sub.ends_on<date('now','+8 hours') THEN 1 ELSE 0 END " +
    "AS subscription_read_only, " +
    "CASE WHEN pam.setting_value='true' THEN 1 ELSE 0 END AS platform_acceptance_mode " +
    "FROM staff_line_accounts sla " +
    "JOIN staff s ON s.tenant_id = sla.tenant_id AND s.id = sla.staff_id " +
    "JOIN tenants t ON t.id = sla.tenant_id " +
    "LEFT JOIN tenant_features tf ON tf.tenant_id = sla.tenant_id " +
    "LEFT JOIN tenant_subscriptions sub ON sub.tenant_id = sla.tenant_id " +
    "LEFT JOIN tenant_settings pam ON pam.tenant_id = sla.tenant_id " +
    "AND pam.setting_key = 'platform_acceptance_mode' " +
    "WHERE sla.provider_id = ?1 AND sla.line_user_id = ?2 " +
    "AND sla.status = 'active' AND s.status = 'active' " +
    "AND t.status IN ('trial', 'active') " +
    "ORDER BY t.name ASC, sla.tenant_id ASC"
  ).bind(env.LINE_PROVIDER_ID, lineUserId).all();

  return (result.results || []).map(function (row) {
    return {
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      staffId: row.staff_id,
      locationId: row.location_id,
      staffName: row.staff_name,
      role: row.role,
      isPlatformStudio: row.tenant_id === env.TENANT_ID,
      isShowcaseStudio: row.tenant_id === env.STANDARD_SHOWCASE_TENANT_ID ||
        row.tenant_id === env.FLAGSHIP_SHOWCASE_TENANT_ID,
      isPlatformAcceptance: Boolean(row.platform_acceptance_mode),
      features: featureDto(row),
      subscription: {
        status: row.subscription_status || "unconfigured",
        startsOn: row.starts_on || "",
        endsOn: row.ends_on || "",
        readOnly: Boolean(row.subscription_read_only)
      }
    };
  });
}

export function legacyOwnerContext(env, lineUserId) {
  var allowed = parseOwnerUserIds(env && env.OWNER_LINE_USER_IDS);
  if (!lineUserId || allowed.indexOf(lineUserId) === -1 ||
      !env.TENANT_ID || !env.STAFF_ID) return null;
  return {
    tenantId: env.TENANT_ID,
    tenantName: env.STUDIO_NAME || "工作室",
    staffId: env.STAFF_ID,
    locationId: env.LOCATION_ID,
    staffName: "",
    role: "owner",
    features: {
      plan: String(env.OWNER_AI_ENABLED || "").toLowerCase() === "true"
        ? "flagship" : "standard",
      customerImport:
        String(env.CUSTOMER_IMPORT_ENABLED || "").toLowerCase() === "true",
      customerExport:
        String(env.PAID_CUSTOMER_EXPORT_ENABLED || "").toLowerCase() === "true",
      customerAi:
        String(env.CUSTOMER_AI_ENABLED || "").toLowerCase() === "true",
      ownerAi:
        String(env.OWNER_AI_ENABLED || "").toLowerCase() === "true"
    },
    legacy: true
  };
}

export async function resolveOwnerContext(env, lineUserId, requestedTenantId) {
  var memberships = [];
  if (env && env.DB && env.LINE_PROVIDER_ID) {
    memberships = await listOwnerMemberships(env, lineUserId);
  }
  if (!memberships.length) {
    var legacy = legacyOwnerContext(env, lineUserId);
    if (legacy) memberships = [legacy];
  }
  if (!memberships.length) throw makeError("無業主管理權限", 403);

  var requested = String(requestedTenantId || "").trim();
  var hasPlatformStudio = memberships.some(function (item) {
    return item.isPlatformStudio === true;
  });
  var ownerPortalMemberships = memberships.filter(function (item) {
    return item.isPlatformAcceptance !== true && item.isPlatformStudio !== true;
  });
  if (hasPlatformStudio && ownerPortalMemberships.some(function (item) {
    return item.isShowcaseStudio === true;
  })) {
    ownerPortalMemberships = ownerPortalMemberships.filter(function (item) {
      return item.isShowcaseStudio === true;
    });
  }
  var selected = requested
    ? memberships.find(function (item) { return item.tenantId === requested; })
    : (ownerPortalMemberships.length === 1 ? ownerPortalMemberships[0] : null);
  if (requested && !selected) throw makeError("無法存取指定工作室", 403);
  if (!requested && !ownerPortalMemberships.length) {
    throw makeError("請由平台管理中心進入驗收工作室", 403);
  }

  return {
    memberships: requested ? memberships : ownerPortalMemberships,
    selected: selected,
    requiresSelection: !selected
  };
}

export async function requireOwnerHubSession(request, env) {
  var idToken = extractIdTokenFromRequest(request);
  var requestedTenantId = request.headers.get("X-Owner-Tenant-Id") || "";
  if (!requestedTenantId && new URL(request.url).pathname.indexOf("/api/platform/") === 0) {
    requestedTenantId = env && env.TENANT_ID ? env.TENANT_ID : "";
  }
  var audienceTenantId = tenantIdForLiffClientId(env, idTokenAudience(idToken));
  var verificationTenantId = requestedTenantId || audienceTenantId;
  var verificationEnv = env;
  if (verificationTenantId) {
    var tenantChannel = tenantLineChannel(env, verificationTenantId);
    if (tenantChannel) {
      verificationEnv = Object.assign({}, env, {
        TENANT_ID: verificationTenantId,
        LINE_PROVIDER_ID: tenantChannel.providerId || env.LINE_PROVIDER_ID
      });
    }
  }
  var verified = await verifyLineIdToken(idToken, verificationEnv);
  var context = await resolveOwnerContext(
    verificationEnv,
    verified.userId,
    requestedTenantId || audienceTenantId
  );
  return {
    userId: verified.userId,
    displayName: verified.name || "",
    memberships: context.memberships,
    selected: context.selected,
    requiresSelection: context.requiresSelection
  };
}

export function scopedOwnerEnv(env, selected) {
  if (!selected || !selected.tenantId || !selected.staffId ||
      !selected.locationId) {
    throw makeError("請先選擇工作室", 409);
  }
  return Object.assign({}, env, {
    TENANT_ID: selected.tenantId,
    STAFF_ID: selected.staffId,
    LOCATION_ID: selected.locationId,
    CUSTOMER_IMPORT_ENABLED: selected.features.customerImport ? "true" : "false",
    PAID_CUSTOMER_EXPORT_ENABLED: selected.features.customerExport ? "true" : "false",
    CUSTOMER_AI_ENABLED: selected.features.customerAi ? "true" : "false",
    OWNER_AI_ENABLED: selected.features.ownerAi ? "true" : "false",
    OWNER_TRIAL_END_DATE: selected.subscription && selected.subscription.status === "trial"
      ? selected.subscription.endsOn : "",
    OWNER_SUBSCRIPTION_END_DATE: selected.subscription && selected.subscription.status === "active"
      ? selected.subscription.endsOn : "",
    OWNER_SUBSCRIPTION_READ_ONLY: selected.subscription && selected.subscription.readOnly
      ? "true" : "false"
  });
}

export function assertOwnerSubscriptionWritable(env, method) {
  var verb = String(method || "GET").toUpperCase();
  if (env && env.OWNER_SUBSCRIPTION_READ_ONLY === "true" &&
      verb !== "GET" && verb !== "HEAD") {
    throw makeError("14 天免費試用已到期，目前僅能查看資料；請聯絡平台選擇正式方案", 403);
  }
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

export async function resolveOwnerAccessInviteTenant(env, inviteToken) {
  if (!env || !env.DB) throw makeError("業主管理中心資料庫設定不完整", 500);
  var token = String(inviteToken || "").trim();
  if (!/^[0-9a-f]{64}$/.test(token)) {
    throw makeError("邀請無效或已過期", 404);
  }
  var tokenHash = await sha256Hex(token);
  var invite = await env.DB.prepare(
    "SELECT tenant_id FROM owner_access_invites " +
    "WHERE token_hash=?1 AND status='active' AND expires_at>?2 LIMIT 1"
  ).bind(tokenHash, new Date().toISOString()).first();
  if (!invite || !invite.tenant_id) {
    throw makeError("邀請無效或已過期", 404);
  }
  return String(invite.tenant_id);
}

export async function createOwnerAccessInvite(env, tenantId, staffId) {
  ensureEnv(env);
  var tenant = String(tenantId || "").trim();
  var staff = String(staffId || "").trim();
  if (!tenant || !staff) throw makeError("缺少工作室或人員識別", 400);
  var target = await env.DB.prepare(
    "SELECT s.id FROM staff s JOIN tenants t ON t.id = s.tenant_id " +
    "WHERE s.tenant_id = ?1 AND s.id = ?2 AND s.status = 'active' " +
    "AND s.role IN ('owner', 'manager') AND t.status IN ('trial', 'active')"
  ).bind(tenant, staff).first();
  if (!target) throw makeError("找不到可邀請的業主人員", 404);

  var token = randomToken();
  var tokenHash = await sha256Hex(token);
  var now = new Date();
  var expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  var inviteId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE owner_access_invites SET status='revoked', revoked_at=?1 " +
      "WHERE tenant_id=?2 AND staff_id=?3 AND status='active'"
    ).bind(now.toISOString(), tenant, staff),
    env.DB.prepare(
      "INSERT INTO owner_access_invites " +
      "(id, tenant_id, staff_id, token_hash, status, expires_at, created_at) " +
      "VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?6)"
    ).bind(inviteId, tenant, staff, tokenHash, expiresAt, now.toISOString())
  ]);
  return {
    inviteToken: token,
    expiresAt: expiresAt
  };
}

export async function claimOwnerAccessInvite(env, params) {
  ensureEnv(env);
  var input = params || {};
  var token = String(input.inviteToken || "").trim();
  var lineUserId = String(input.lineUserId || "").trim();
  var studioName = requiredText(input.studioName, "工作室名稱", 100);
  var ownerName = requiredText(input.ownerName, "業主名稱", 80);
  if (input.accountBindingAccepted !== true || input.termsAccepted !== true ||
      input.termsVersion !== "2026-08-06") {
    throw makeError("請先同意帳號綁定、使用規範與隱私權說明", 400);
  }
  if (!/^[0-9a-f]{64}$/.test(token) || !lineUserId) {
    throw makeError("邀請無效或已過期", 404);
  }
  var tokenHash = await sha256Hex(token);
  var now = new Date().toISOString();
  var invite = await env.DB.prepare(
    "SELECT i.id, i.tenant_id, i.staff_id, i.status, i.expires_at, " +
    "s.display_name AS staff_name, t.name AS tenant_name, " +
    "sub.status AS subscription_status, sub.trial_used, " +
    "COALESCE(tf.plan_code, 'standard') AS plan_code " +
    "FROM owner_access_invites i " +
    "JOIN staff s ON s.tenant_id=i.tenant_id AND s.id=i.staff_id " +
    "AND s.status='active' AND s.role IN ('owner', 'manager') " +
    "JOIN tenants t ON t.id=i.tenant_id AND t.status IN ('trial', 'active') " +
    "LEFT JOIN tenant_subscriptions sub ON sub.tenant_id=i.tenant_id " +
    "LEFT JOIN tenant_features tf ON tf.tenant_id=i.tenant_id " +
    "WHERE i.token_hash=?1"
  ).bind(tokenHash).first();
  if (!invite || invite.status !== "active" || invite.expires_at <= now) {
    throw makeError("邀請無效或已過期", 404);
  }

  var existing = await env.DB.prepare(
    "SELECT staff_id FROM staff_line_accounts " +
    "WHERE tenant_id=?1 AND provider_id=?2 AND line_user_id=?3 " +
    "AND status='active'"
  ).bind(invite.tenant_id, env.LINE_PROVIDER_ID, lineUserId).first();
  if (existing && existing.staff_id !== invite.staff_id) {
    throw makeError("此 LINE 帳號已綁定該工作室的其他人員", 409);
  }
  var existingStaff = await env.DB.prepare(
    "SELECT id, line_user_id FROM staff_line_accounts " +
    "WHERE tenant_id=?1 AND staff_id=?2 AND status='active'"
  ).bind(invite.tenant_id, invite.staff_id).first();
  if (existingStaff && /^owner-provider-migrate:/.test(String(invite.id || ""))) {
    try {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE staff_line_accounts SET line_user_id=?1,provider_id=?2,last_seen_at=?3 " +
          "WHERE tenant_id=?4 AND id=?5 AND staff_id=?6 AND status='active' " +
          "AND EXISTS (SELECT 1 FROM owner_access_invites WHERE id=?7 " +
          "AND tenant_id=?4 AND staff_id=?6 AND status='active' AND expires_at>?3)"
        ).bind(lineUserId, env.LINE_PROVIDER_ID, now, invite.tenant_id,
          existingStaff.id, invite.staff_id, invite.id),
        env.DB.prepare(
          "UPDATE owner_access_invites SET status='claimed',claimed_at=?1 " +
          "WHERE id=?2 AND tenant_id=?3 AND staff_id=?4 AND status='active' " +
          "AND EXISTS (SELECT 1 FROM staff_line_accounts WHERE tenant_id=?3 " +
          "AND id=?5 AND staff_id=?4 AND line_user_id=?6 AND provider_id=?7 " +
          "AND status='active')"
        ).bind(now, invite.id, invite.tenant_id, invite.staff_id,
          existingStaff.id, lineUserId, env.LINE_PROVIDER_ID),
        env.DB.prepare(
          "INSERT INTO audit_logs " +
          "(id,tenant_id,actor_type,actor_id,action,entity_type,entity_id," +
          "source,metadata_json,created_at) " +
          "SELECT ?1,?2,'staff',?3,'owner.line_provider_migrated'," +
          "'owner_access_invite',?4,'line',?5,?6 " +
          "WHERE EXISTS (SELECT 1 FROM owner_access_invites WHERE id=?4 " +
          "AND tenant_id=?2 AND status='claimed')"
        ).bind(
          crypto.randomUUID(),
          invite.tenant_id,
          invite.staff_id,
          invite.id,
          JSON.stringify({
            inviteId: invite.id,
            staffId: invite.staff_id,
            staffLineAccountId: existingStaff.id,
            providerMigration: true
          }),
          now
        )
      ]);
    } catch (error) {
      if (/UNIQUE|constraint/i.test(String(error && error.message))) {
        throw makeError("此 LINE 帳號已綁定該工作室的其他人員", 409);
      }
      throw error;
    }
    var migratedStaff = await env.DB.prepare(
      "SELECT id FROM staff_line_accounts WHERE tenant_id=?1 AND id=?2 " +
      "AND staff_id=?3 AND line_user_id=?4 AND provider_id=?5 AND status='active'"
    ).bind(invite.tenant_id, existingStaff.id, invite.staff_id,
      lineUserId, env.LINE_PROVIDER_ID).first();
    if (!migratedStaff) throw makeError("LINE 身分遷移未完成，請重新產生邀請", 409);
    return { ok: true, claimed: true, migrated: true };
  }
  if (existingStaff) {
    throw makeError("此業主人員已綁定 LINE，請勿重複使用邀請", 409);
  }

  var accountId = crypto.randomUUID();
  var trialStartsOn = taipeiDate();
  var trialEndsOn = addCalendarDays(trialStartsOn, 13);
  var trialPlan = invite.plan_code === "flagship" ? "flagship" : "standard";
  try {
    var claimResults = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO staff_line_accounts " +
        "(id, tenant_id, staff_id, provider_id, line_user_id, status, linked_at, last_seen_at) " +
        "SELECT ?1, ?2, ?3, ?4, ?5, 'active', ?6, ?6 " +
        "WHERE EXISTS (SELECT 1 FROM owner_access_invites " +
        "WHERE id=?7 AND status='active' AND expires_at>?6) " +
        "AND NOT EXISTS (SELECT 1 FROM staff_line_accounts " +
        "WHERE tenant_id=?2 AND staff_id=?3 AND status='active')"
      ).bind(
        accountId, invite.tenant_id, invite.staff_id,
        env.LINE_PROVIDER_ID, lineUserId, now, invite.id
      ),
      env.DB.prepare(
        "UPDATE owner_access_invites SET status='claimed', claimed_at=?1 " +
        "WHERE id=?2 AND status='active' AND expires_at>?1"
      ).bind(now, invite.id),
      env.DB.prepare(
        "UPDATE tenants SET name=?1, owner_name=?2, updated_at=?3 WHERE id=?4 " +
        "AND EXISTS (SELECT 1 FROM owner_access_invites " +
        "WHERE id=?5 AND status='claimed' AND claimed_at=?3)"
      ).bind(studioName, ownerName, now, invite.tenant_id, invite.id),
      env.DB.prepare(
        "UPDATE locations SET name=?1, updated_at=?2 " +
        "WHERE tenant_id=?3 AND is_default=1 " +
        "AND EXISTS (SELECT 1 FROM owner_access_invites " +
        "WHERE id=?4 AND status='claimed' AND claimed_at=?2)"
      ).bind(studioName, now, invite.tenant_id, invite.id),
      env.DB.prepare(
        "UPDATE staff SET display_name=?1, updated_at=?2 " +
        "WHERE tenant_id=?3 AND id=?4 " +
        "AND EXISTS (SELECT 1 FROM owner_access_invites " +
        "WHERE id=?5 AND status='claimed' AND claimed_at=?2)"
      ).bind(ownerName, now, invite.tenant_id, invite.staff_id, invite.id),
      env.DB.prepare(
        "INSERT INTO tenant_settings " +
        "(id, tenant_id, setting_key, setting_value, value_type, created_at, updated_at) " +
        "SELECT ?1, ?2, 'brand_name', ?3, 'string', ?4, ?4 " +
        "WHERE EXISTS (SELECT 1 FROM owner_access_invites " +
        "WHERE id=?5 AND status='claimed' AND claimed_at=?4) " +
        "ON CONFLICT(tenant_id, setting_key) DO UPDATE SET " +
        "setting_value=excluded.setting_value, updated_at=excluded.updated_at"
      ).bind(crypto.randomUUID(), invite.tenant_id, studioName, now, invite.id),
      env.DB.prepare(
        "INSERT INTO audit_logs " +
        "(id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, " +
        "source, metadata_json, created_at) SELECT " +
        "?1, ?2, 'staff', ?3, 'owner_identity_set_at_claim', " +
        "'tenant', ?2, 'line', ?4, ?5 " +
        "WHERE EXISTS (SELECT 1 FROM owner_access_invites " +
        "WHERE id=?6 AND status='claimed' AND claimed_at=?5)"
      ).bind(
        crypto.randomUUID(), invite.tenant_id, invite.staff_id,
        JSON.stringify({
          studioName: studioName,
          ownerName: ownerName,
          accountBindingAccepted: true,
          termsAccepted: true,
          termsVersion: input.termsVersion
        }), now,
        invite.id
      ),
      env.DB.prepare(
        "UPDATE tenant_subscriptions SET starts_on=?1, ends_on=?2, trial_used=1, updated_at=?3 " +
        "WHERE tenant_id=?4 AND status='trial' AND trial_used=0 " +
        "AND EXISTS (SELECT 1 FROM owner_access_invites WHERE id=?5 AND status='claimed')"
      ).bind(trialStartsOn, trialEndsOn, now, invite.tenant_id, invite.id),
      env.DB.prepare(
        "INSERT INTO tenant_trial_events " +
        "(id, tenant_id, actor_type, actor_id, action, starts_on, ends_on, metadata_json, created_at) " +
        "SELECT ?1, ?2, 'line_user', ?3, 'started', ?4, ?5, ?6, ?7 " +
        "WHERE ?8='trial' AND COALESCE(?9, 0)=0 " +
        "AND EXISTS (SELECT 1 FROM owner_access_invites WHERE id=?10 AND status='claimed')"
      ).bind(crypto.randomUUID(), invite.tenant_id, lineUserId, trialStartsOn, trialEndsOn,
        JSON.stringify({ trialDays: 14, plan: trialPlan }), now,
        invite.subscription_status, invite.trial_used, invite.id)
    ]);
    if (!claimResults[0] || !claimResults[0].meta || claimResults[0].meta.changes !== 1 ||
        !claimResults[1] || !claimResults[1].meta || claimResults[1].meta.changes !== 1) {
      throw makeError("邀請已被使用，無法再次綁定或修改資料", 409);
    }
  } catch (error) {
    if (error && error.status === 409 && error.message) throw error;
    throw makeError("無法完成業主帳號綁定", 409);
  }
  return {
    ok: true,
    tenantId: invite.tenant_id,
    tenantName: studioName,
    staffName: ownerName
  };
}
