/**
 * 匯入客戶一次性 LINE 認領邀請 — D1 repository
 *
 * 業主對「尚未綁定 LINE」的 customer 產生一次性邀請 token（連結＋QR），
 * 客戶在 LINE 內開啟並經 LIFF ID token 驗證後，將自己的 LINE 身分
 * 綁定到該 customer（建立 line_accounts）。
 *
 * 安全規則：
 * - token 以 Web Crypto 產生 256-bit 隨機值；DB 只存 SHA-256 hash，
 *   原始 token 只在「建立邀請」回應出現一次，不進 log／audit／錯誤訊息
 * - 認領身分一律以 route 層 requireCustomerFromRequest 驗證後的
 *   LINE userId 為準，不信任 payload
 * - 不以姓名、電話、生日或 customer_no 猜測或搜尋 LINE 身分，不自動合併
 * - 失敗回應不洩漏客戶個資；audit 不含原始 token 與 LINE userId
 * - 所有 SQL 走 parameter bind 且 tenant scoped
 * - 競態 fail closed：關鍵寫入用「INSERT … SELECT WHERE 邀請仍 active」
 *   ＋ line_accounts 的 UNIQUE(tenant, line_user_id)／UNIQUE(tenant,
 *   customer_id)，同一 invite 不可能被兩個 LINE 帳號成功使用
 */

/** 邀請有效期限（小時） */
export var CLAIM_INVITE_TTL_HOURS = 24;

/** 邀請 token 隨機位元組數（32 bytes = 256 bits） */
export var CLAIM_TOKEN_BYTES = 32;

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

function ensureD1Env(env) {
  if (!env || !env.DB) {
    throw makeError("缺少 D1 資料庫綁定（DB），請確認 wrangler 設定", 500);
  }
  if (!env.TENANT_ID) {
    throw makeError("缺少 TENANT_ID 設定", 500);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function hoursFromNowIso(hours) {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

/** base64url 編碼（無 padding），輸出只含 A-Za-z0-9_- */
function toBase64Url(bytes) {
  var binary = "";
  for (var i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** 產生 256-bit cryptographically secure 邀請 token（base64url） */
export function generateClaimToken() {
  var bytes = new Uint8Array(CLAIM_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** token 的 SHA-256 hex（DB 只保存此 hash） */
export async function hashClaimToken(token) {
  var bytes = new TextEncoder().encode(String(token));
  var digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(function (b) { return b.toString(16).padStart(2, "0"); })
    .join("");
}

/** 認領 token 格式檢查（base64url，長度合理範圍） */
export function isValidClaimTokenFormat(token) {
  return /^[A-Za-z0-9_-]{22,128}$/.test(String(token || ""));
}

/** 確認 env.STAFF_ID 屬於本 tenant（fail closed，不洩漏設定值） */
async function ensureStaffBelongsToTenant(env) {
  if (!env.STAFF_ID) {
    throw makeError("操作人員設定錯誤，請確認工作室設定", 500);
  }
  var staffRow = await env.DB.prepare(
    "SELECT id FROM staff WHERE tenant_id = ?1 AND id = ?2"
  ).bind(env.TENANT_ID, env.STAFF_ID).first();
  if (!staffRow) {
    throw makeError("操作人員設定錯誤，請確認工作室設定", 500);
  }
}

/** 讀取 tenant scoped、未刪除的客戶＋LINE 綁定狀態；不存在回 null */
async function fetchCustomerWithLink(env, customerId) {
  return env.DB.prepare(
    "SELECT c.id AS customer_id, c.display_name, c.mobile, c.birthday, " +
    "la.id AS line_account_id " +
    "FROM customers c " +
    "LEFT JOIN line_accounts la " +
    "ON la.tenant_id = c.tenant_id AND la.customer_id = c.id " +
    "WHERE c.tenant_id = ?1 AND c.id = ?2 " +
    "AND c.deleted_at IS NULL AND c.status <> 'deleted'"
  ).bind(env.TENANT_ID, customerId).first();
}

/** 邀請 DTO（不含 token_hash；active 但已過期時對外顯示 expired） */
function inviteToDto(row, now) {
  if (!row) {
    return null;
  }
  var status = row.status;
  if (status === "active" && String(row.expires_at) <= now) {
    status = "expired";
  }
  return {
    status: status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    claimedAt: row.claimed_at || null,
    revokedAt: row.revoked_at || null
  };
}

var AUDIT_INSERT_SQL =
  "INSERT INTO audit_logs " +
  "(id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, " +
  "source, metadata_json, created_at) " +
  "VALUES (?, ?, ?, ?, ?, 'customer_claim_invite', ?, ?, ?, ?)";

/**
 * POST /api/owner/customers/by-id/:customerId/claim-invite
 *
 * 已綁 LINE／deleted 客戶不可建立。建立時在同一 D1 batch 內
 * 撤銷舊 active 邀請、寫入新邀請與 audit；原始 token 只在本次
 * 回應出現一次。
 */
export async function createCustomerClaimInvite(env, customerId) {
  ensureD1Env(env);
  var id = String(customerId || "").trim();
  if (!id) {
    throw makeError("缺少 customerId", 400);
  }

  await ensureStaffBelongsToTenant(env);

  var customer = await fetchCustomerWithLink(env, id);
  if (!customer) {
    throw makeError("找不到此客戶", 404);
  }
  if (customer.line_account_id) {
    throw makeError("此客戶已綁定 LINE，無需建立認領邀請", 409);
  }

  var token = generateClaimToken();
  var tokenHash = await hashClaimToken(token);
  var now = nowIso();
  var expiresAt = hoursFromNowIso(CLAIM_INVITE_TTL_HOURS);
  var inviteId = crypto.randomUUID();

  await env.DB.batch([
    // 同一客戶同時只能有一個有效邀請：先安全撤銷舊 active 邀請
    env.DB.prepare(
      "UPDATE customer_claim_invites " +
      "SET status = 'revoked', revoked_at = ?1 " +
      "WHERE tenant_id = ?2 AND customer_id = ?3 AND status = 'active'"
    ).bind(now, env.TENANT_ID, id),
    env.DB.prepare(
      "INSERT INTO customer_claim_invites " +
      "(id, tenant_id, customer_id, token_hash, status, expires_at, " +
      "created_by_staff_id, created_at) " +
      "VALUES (?, ?, ?, ?, 'active', ?, ?, ?)"
    ).bind(inviteId, env.TENANT_ID, id, tokenHash, expiresAt, env.STAFF_ID, now),
    // audit 只含 id 對應，不含 token、token_hash 或任何個資
    env.DB.prepare(AUDIT_INSERT_SQL).bind(
      crypto.randomUUID(),
      env.TENANT_ID,
      "staff",
      env.STAFF_ID,
      "customer.claim_invite.create",
      inviteId,
      "admin",
      JSON.stringify({ inviteId: inviteId, customerId: id }),
      now
    )
  ]);

  return {
    ok: true,
    claimToken: token,
    invite: {
      status: "active",
      expiresAt: expiresAt,
      createdAt: now,
      claimedAt: null,
      revokedAt: null
    }
  };
}

/**
 * GET /api/owner/customers/by-id/:customerId/claim-invite
 * 只回狀態等安全資訊，永不回原始 token 或 token hash。
 */
export async function getCustomerClaimInvite(env, customerId) {
  ensureD1Env(env);
  var id = String(customerId || "").trim();
  if (!id) {
    throw makeError("缺少 customerId", 400);
  }

  var customer = await fetchCustomerWithLink(env, id);
  if (!customer) {
    throw makeError("找不到此客戶", 404);
  }

  var invite = await env.DB.prepare(
    "SELECT status, expires_at, created_at, claimed_at, revoked_at " +
    "FROM customer_claim_invites " +
    "WHERE tenant_id = ?1 AND customer_id = ?2 " +
    "ORDER BY created_at DESC LIMIT 1"
  ).bind(env.TENANT_ID, id).first();

  return {
    ok: true,
    linkedLine: Boolean(customer.line_account_id),
    invite: inviteToDto(invite, nowIso())
  };
}

/**
 * DELETE /api/owner/customers/by-id/:customerId/claim-invite
 * 撤銷 active 邀請；無 active 邀請時冪等回 revoked: false。
 */
export async function revokeCustomerClaimInvite(env, customerId) {
  ensureD1Env(env);
  var id = String(customerId || "").trim();
  if (!id) {
    throw makeError("缺少 customerId", 400);
  }

  await ensureStaffBelongsToTenant(env);

  var customer = await fetchCustomerWithLink(env, id);
  if (!customer) {
    throw makeError("找不到此客戶", 404);
  }

  var active = await env.DB.prepare(
    "SELECT id FROM customer_claim_invites " +
    "WHERE tenant_id = ?1 AND customer_id = ?2 AND status = 'active' " +
    "LIMIT 1"
  ).bind(env.TENANT_ID, id).first();

  if (!active) {
    return { ok: true, revoked: false };
  }

  var now = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE customer_claim_invites " +
      "SET status = 'revoked', revoked_at = ?1 " +
      "WHERE tenant_id = ?2 AND id = ?3 AND status = 'active'"
    ).bind(now, env.TENANT_ID, active.id),
    env.DB.prepare(AUDIT_INSERT_SQL).bind(
      crypto.randomUUID(),
      env.TENANT_ID,
      "staff",
      env.STAFF_ID,
      "customer.claim_invite.revoke",
      active.id,
      "admin",
      JSON.stringify({ inviteId: active.id, customerId: id }),
      now
    )
  ]);

  return { ok: true, revoked: true };
}

/** 認領成功的安全 DTO（不含 notes、token、hash 或其他 LINE userId） */
function claimSuccessResponse(customer, alreadyLinked) {
  return {
    ok: true,
    claimed: true,
    alreadyLinked: Boolean(alreadyLinked),
    customer: {
      customerName: customer.display_name || "",
      phone: customer.mobile || "",
      birthday: customer.birthday || ""
    }
  };
}

/** 依 tenant＋LINE userId 查既有綁定（只取 id 與 customer_id） */
async function fetchLineAccountByUserId(env, lineUserId) {
  return env.DB.prepare(
    "SELECT id, customer_id FROM line_accounts " +
    "WHERE tenant_id = ?1 AND line_user_id = ?2"
  ).bind(env.TENANT_ID, lineUserId).first();
}

/**
 * POST /api/customer/claim-invite 的 repository 實作。
 *
 * params.lineUserId／displayName／pictureUrl 必須來自 route 層
 * requireCustomerFromRequest 的驗證結果；本函式不讀 payload 的
 * 任何身分欄位。
 *
 * 競態設計：line_accounts INSERT 與 invite UPDATE 都以
 * 「邀請仍 active 且未過期」為條件（同一 batch＝同一交易內一致），
 * 並由 UNIQUE(tenant, line_user_id)／UNIQUE(tenant, customer_id)
 * 保底；任何條件不成立時整批零寫入，再重新查詢分類錯誤。
 */
export async function claimCustomerInvite(env, params) {
  ensureD1Env(env);
  var input = params || {};
  var lineUserId = String(input.lineUserId || "").trim();
  if (!lineUserId) {
    throw makeError("缺少已驗證的 LINE 身分", 401);
  }

  var token = String(input.claimToken || "").trim();
  if (!isValidClaimTokenFormat(token)) {
    // 格式不符一律視為無效邀請，不洩漏任何客戶資訊
    throw makeError("邀請連結無效或已失效", 404);
  }

  var tokenHash = await hashClaimToken(token);
  var invite = await env.DB.prepare(
    "SELECT id, customer_id, status, expires_at " +
    "FROM customer_claim_invites " +
    "WHERE tenant_id = ?1 AND token_hash = ?2"
  ).bind(env.TENANT_ID, tokenHash).first();

  if (!invite) {
    throw makeError("邀請連結無效或已失效", 404);
  }

  var now = nowIso();
  var existingByUser = await fetchLineAccountByUserId(env, lineUserId);

  if (invite.status === "revoked") {
    throw makeError("此邀請已由店家撤銷，請聯絡店家重新產生", 410);
  }
  if (invite.status === "claimed" || invite.status === "expired") {
    if (invite.status === "claimed" &&
        existingByUser && existingByUser.customer_id === invite.customer_id) {
      // 同一 LINE 帳號重複開啟已完成的邀請：安全冪等
      var claimedCustomer = await fetchCustomerWithLink(env, invite.customer_id);
      if (claimedCustomer) {
        return claimSuccessResponse(claimedCustomer, true);
      }
    }
    throw makeError(
      invite.status === "claimed"
        ? "此邀請已被使用，請聯絡店家確認"
        : "此邀請已過期，請聯絡店家重新產生",
      410
    );
  }
  if (String(invite.expires_at) <= now) {
    throw makeError("此邀請已過期，請聯絡店家重新產生", 410);
  }

  var customer = await fetchCustomerWithLink(env, invite.customer_id);
  if (!customer) {
    throw makeError("邀請連結無效或已失效", 404);
  }

  if (existingByUser) {
    if (existingByUser.customer_id === invite.customer_id) {
      // 已綁定同一客戶：冪等完成，並把仍 active 的邀請補記為 claimed
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE customer_claim_invites " +
          "SET status = 'claimed', claimed_at = ?1, claimed_line_account_id = ?2 " +
          "WHERE tenant_id = ?3 AND id = ?4 AND status = 'active'"
        ).bind(now, existingByUser.id, env.TENANT_ID, invite.id),
        env.DB.prepare(AUDIT_INSERT_SQL).bind(
          crypto.randomUUID(),
          env.TENANT_ID,
          "customer",
          existingByUser.id,
          "customer.claim_invite.claimed",
          invite.id,
          "line",
          JSON.stringify({
            inviteId: invite.id,
            customerId: invite.customer_id,
            lineAccountId: existingByUser.id,
            alreadyLinked: true
          }),
          now
        )
      ]);
      return claimSuccessResponse(customer, true);
    }
    // 已綁定其他 customer：不自動合併、不搬移，零寫入
    throw makeError("此 LINE 帳號已綁定其他客戶資料，請聯絡店家處理", 409);
  }

  if (customer.line_account_id) {
    // 客戶已被其他 LINE 帳號認領：零寫入
    throw makeError("此客戶資料已由其他 LINE 帳號完成綁定，請聯絡店家確認", 409);
  }

  var lineAccountId = crypto.randomUUID();
  var auditId = crypto.randomUUID();

  var statements = [
    // 只有邀請仍 active 且未過期才建立綁定（同一交易內條件一致）
    env.DB.prepare(
      "INSERT INTO line_accounts " +
      "(id, tenant_id, customer_id, line_user_id, display_name, picture_url, linked_at) " +
      "SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 " +
      "WHERE EXISTS (" +
      "SELECT 1 FROM customer_claim_invites " +
      "WHERE tenant_id = ?2 AND id = ?8 AND status = 'active' AND expires_at > ?7" +
      ")"
    ).bind(
      lineAccountId,
      env.TENANT_ID,
      invite.customer_id,
      lineUserId,
      String(input.displayName || ""),
      String(input.pictureUrl || ""),
      now,
      invite.id
    ),
    env.DB.prepare(
      "UPDATE customer_claim_invites " +
      "SET status = 'claimed', claimed_at = ?1, claimed_line_account_id = ?2 " +
      "WHERE tenant_id = ?3 AND id = ?4 AND status = 'active' " +
      "AND EXISTS (SELECT 1 FROM line_accounts WHERE id = ?2)"
    ).bind(now, lineAccountId, env.TENANT_ID, invite.id),
    // audit 以 line_accounts 的 uuid 作 actor，不寫 LINE userId；
    // 與 INSERT 同條件：綁定沒建立時不留 audit
    env.DB.prepare(
      "INSERT INTO audit_logs " +
      "(id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, " +
      "source, metadata_json, created_at) " +
      "SELECT ?, ?, ?, ?, ?, 'customer_claim_invite', ?, ?, ?, ? " +
      "WHERE EXISTS (SELECT 1 FROM line_accounts WHERE id = ?)"
    ).bind(
      auditId,
      env.TENANT_ID,
      "customer",
      lineAccountId,
      "customer.claim_invite.claimed",
      invite.id,
      "line",
      JSON.stringify({
        inviteId: invite.id,
        customerId: invite.customer_id,
        lineAccountId: lineAccountId
      }),
      now,
      lineAccountId
    )
  ];

  var results;
  try {
    results = await env.DB.batch(statements);
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error && error.message))) {
      // 競態：另一個認領先完成 → 整批已回滾，重新查詢分類
      var racedByUser = await fetchLineAccountByUserId(env, lineUserId);
      if (racedByUser && racedByUser.customer_id === invite.customer_id) {
        return claimSuccessResponse(customer, true);
      }
      if (racedByUser) {
        throw makeError("此 LINE 帳號已綁定其他客戶資料，請聯絡店家處理", 409);
      }
      throw makeError("此客戶資料已由其他 LINE 帳號完成綁定，請聯絡店家確認", 409);
    }
    throw makeError("認領處理失敗，請稍後再試", 500);
  }

  var inserted = results && results[0] && results[0].meta
    ? Number(results[0].meta.changes)
    : 0;
  if (!inserted) {
    // 條件式 INSERT 未寫入：邀請在讀取後被撤銷／使用／過期，fail closed
    var latest = await env.DB.prepare(
      "SELECT status, expires_at FROM customer_claim_invites " +
      "WHERE tenant_id = ?1 AND id = ?2"
    ).bind(env.TENANT_ID, invite.id).first();
    if (latest && latest.status === "revoked") {
      throw makeError("此邀請已由店家撤銷，請聯絡店家重新產生", 410);
    }
    if (latest && latest.status === "claimed") {
      throw makeError("此邀請已被使用，請聯絡店家確認", 410);
    }
    throw makeError("此邀請已過期，請聯絡店家重新產生", 410);
  }

  return claimSuccessResponse(customer, false);
}
