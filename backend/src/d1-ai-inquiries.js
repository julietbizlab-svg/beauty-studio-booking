/**
 * Customer AI inquiry reports (D1 only).
 *
 * The verified LINE user id is stored server-side for customer linking but is
 * never returned to the owner UI. Raw inquiry data has a 90-day expiry.
 */

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

function ensureEnv(env) {
  if (!env || !env.DB) throw makeError("缺少 D1 資料庫綁定", 500);
  if (!env.TENANT_ID) throw makeError("缺少 TENANT_ID 設定", 500);
}

function cleanText(value, max) {
  return Array.from(String(value || "").trim()).slice(0, max).join("");
}

function nowIso(env) {
  if (env && env.AI_INQUIRY_NOW_ISO) return String(env.AI_INQUIRY_NOW_ISO);
  return new Date().toISOString();
}

function expiryIso(now) {
  return new Date(Date.parse(now) + 90 * 24 * 60 * 60 * 1000).toISOString();
}

function safeLineRequestId(value) {
  var requestId = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(requestId) ? requestId : "";
}

function lineFailureCode(status) {
  if (status === 400) return "line_invalid_request";
  if (status === 401) return "line_authentication_failed";
  if (status === 403) return "line_forbidden";
  if (status === 429) return "line_rate_limited";
  if (status >= 500) return "line_provider_unavailable";
  return "line_rejected";
}

export async function createCustomerAiInquiry(env, input) {
  ensureEnv(env);
  var data = input || {};
  var lineUserId = String(data.lineUserId || "").trim();
  var message = cleanText(data.customerMessage, 300);
  var reply = cleanText(data.aiReply, 500);
  var summary = cleanText(data.ownerSummary, 240);
  var serviceId = String(data.recommendedServiceId || "").trim() || null;
  if (!lineUserId || !message || !reply || !summary) {
    throw makeError("AI 洽詢回報資料不完整", 500);
  }

  var now = nowIso(env);
  var id = "aiq_" + crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO ai_customer_inquiries (" +
    "id, tenant_id, customer_id, line_user_id, customer_message, ai_reply, " +
    "owner_summary, needs_owner_follow_up, recommended_service_id, status, " +
    "created_at, expires_at" +
    ") VALUES (" +
    "?1, ?2, (SELECT customer_id FROM line_accounts " +
    "WHERE tenant_id = ?2 AND line_user_id = ?3 LIMIT 1), ?3, ?4, ?5, ?6, ?7, ?8, " +
    "'new', ?9, ?10)"
  ).bind(
    id,
    env.TENANT_ID,
    lineUserId,
    message,
    reply,
    summary,
    data.needsOwnerFollowUp === false ? 0 : 1,
    serviceId,
    now,
    expiryIso(now)
  ).run();

  return { id: id, reportedToOwner: true };
}

export async function listOwnerAiInquiries(env) {
  ensureEnv(env);
  var now = nowIso(env);
  var result = await env.DB.prepare(
    "SELECT q.id, q.customer_message, q.ai_reply, q.owner_summary, " +
    "q.needs_owner_follow_up, q.status, q.created_at, " +
    "r.reply_text AS owner_reply_text, r.status AS owner_reply_status, " +
    "r.created_at AS owner_reply_created_at, r.sent_at AS owner_reply_sent_at, " +
    "COALESCE(c.display_name, la.display_name, 'LINE 客人') AS customer_name, " +
    "COALESCE(s.name, '') AS recommended_service_name " +
    "FROM ai_customer_inquiries q " +
    "LEFT JOIN customers c ON c.tenant_id = q.tenant_id AND c.id = q.customer_id " +
    "LEFT JOIN line_accounts la ON la.tenant_id = q.tenant_id " +
    "AND la.line_user_id = q.line_user_id " +
    "LEFT JOIN services s ON s.tenant_id = q.tenant_id " +
    "AND s.id = q.recommended_service_id " +
    "LEFT JOIN ai_inquiry_owner_replies r ON r.id = (" +
    "SELECT r2.id FROM ai_inquiry_owner_replies r2 " +
    "WHERE r2.tenant_id = q.tenant_id AND r2.inquiry_id = q.id " +
    "ORDER BY r2.created_at DESC, r2.id DESC LIMIT 1) " +
    "WHERE q.tenant_id = ?1 AND q.expires_at > ?2 " +
    "ORDER BY CASE q.status WHEN 'new' THEN 0 WHEN 'reviewed' THEN 1 ELSE 2 END, " +
    "q.created_at DESC LIMIT 50"
  ).bind(env.TENANT_ID, now).all();

  var inquiries = (result.results || []).map(function (row) {
    return {
      id: String(row.id),
      customerName: String(row.customer_name || "LINE 客人"),
      customerMessage: String(row.customer_message || ""),
      aiReply: String(row.ai_reply || ""),
      ownerSummary: String(row.owner_summary || ""),
      needsOwnerFollowUp: Number(row.needs_owner_follow_up) === 1,
      recommendedServiceName: String(row.recommended_service_name || ""),
      status: String(row.status || "new"),
      createdAt: String(row.created_at || ""),
      ownerReply: row.owner_reply_text ? {
        text: String(row.owner_reply_text),
        status: String(row.owner_reply_status || ""),
        createdAt: String(row.owner_reply_created_at || ""),
        sentAt: String(row.owner_reply_sent_at || "")
      } : null
    };
  });

  return {
    ok: true,
    unreadCount: inquiries.filter(function (item) { return item.status === "new"; }).length,
    inquiries: inquiries
  };
}

export async function listCustomerAiInquiries(env, lineUserId) {
  ensureEnv(env);
  var userId = String(lineUserId || "").trim();
  if (!userId) throw makeError("缺少客戶身分", 401);
  var result = await env.DB.prepare(
    "SELECT q.id, q.customer_message, q.ai_reply, q.needs_owner_follow_up, q.created_at, " +
    "r.reply_text AS owner_reply_text, r.sent_at AS owner_reply_sent_at " +
    "FROM ai_customer_inquiries q " +
    "LEFT JOIN ai_inquiry_owner_replies r ON r.id = (" +
    "SELECT r2.id FROM ai_inquiry_owner_replies r2 " +
    "WHERE r2.tenant_id = q.tenant_id AND r2.inquiry_id = q.id " +
    "AND r2.status = 'sent' ORDER BY r2.sent_at DESC, r2.id DESC LIMIT 1) " +
    "WHERE q.tenant_id = ?1 AND q.line_user_id = ?2 AND q.expires_at > ?3 " +
    "ORDER BY q.created_at DESC LIMIT 50"
  ).bind(env.TENANT_ID, userId, nowIso(env)).all();
  return {
    ok: true,
    inquiries: (result.results || []).map(function (row) {
      return {
        id: String(row.id),
        customerMessage: String(row.customer_message || ""),
        autoReply: Number(row.needs_owner_follow_up) === 0
          ? String(row.ai_reply || "") : "",
        createdAt: String(row.created_at || ""),
        ownerReply: row.owner_reply_text ? {
          text: String(row.owner_reply_text),
          sentAt: String(row.owner_reply_sent_at || "")
        } : null
      };
    })
  };
}

export async function countDailyCustomerAiInquiries(env, lineUserId) {
  ensureEnv(env);
  var userId = String(lineUserId || "").trim();
  if (!userId) throw makeError("缺少客戶身分", 401);
  var now = nowIso(env);
  var taipeiNow = new Date(Date.parse(now) + 8 * 60 * 60 * 1000);
  var taipeiDate = taipeiNow.toISOString().slice(0, 10);
  var dayStart = new Date(
    Date.parse(taipeiDate + "T00:00:00.000Z") - 8 * 60 * 60 * 1000
  ).toISOString();
  var result = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM ai_customer_inquiries " +
    "WHERE tenant_id = ?1 AND line_user_id = ?2 " +
    "AND created_at >= ?3 AND created_at <= ?4"
  ).bind(env.TENANT_ID, userId, dayStart, now).all();
  var row = result && result.results && result.results[0];
  return Math.max(0, Number(row && row.total) || 0);
}

export async function updateOwnerAiInquiryStatus(env, inquiryId, status) {
  ensureEnv(env);
  var id = String(inquiryId || "").trim();
  var next = String(status || "").trim();
  if (!id) throw makeError("缺少洽詢編號", 400);
  if (next !== "reviewed" && next !== "resolved") {
    throw makeError("洽詢狀態無效", 400);
  }
  var now = nowIso(env);
  var statement = next === "reviewed"
    ? env.DB.prepare(
      "UPDATE ai_customer_inquiries SET status = 'reviewed', reviewed_at = ?1 " +
      "WHERE tenant_id = ?2 AND id = ?3 AND status = 'new'"
    ).bind(now, env.TENANT_ID, id)
    : env.DB.prepare(
      "UPDATE ai_customer_inquiries SET status = 'resolved', " +
      "reviewed_at = COALESCE(reviewed_at, ?1), resolved_at = ?1 " +
      "WHERE tenant_id = ?2 AND id = ?3 AND status IN ('new', 'reviewed')"
    ).bind(now, env.TENANT_ID, id);
  var result = await statement.run();
  if (!result || !result.meta || Number(result.meta.changes) !== 1) {
    var existing = await env.DB.prepare(
      "SELECT status FROM ai_customer_inquiries WHERE tenant_id = ?1 AND id = ?2"
    ).bind(env.TENANT_ID, id).first();
    if (!existing) throw makeError("找不到此 AI 洽詢", 404);
    if (String(existing.status) !== next) {
      throw makeError("此 AI 洽詢狀態已更新，請重新整理", 409);
    }
  }
  return { ok: true, id: id, status: next };
}

export async function sendOwnerAiInquiryReply(env, inquiryId, ownerId, input) {
  ensureEnv(env);
  var id = String(inquiryId || "").trim();
  var actorId = String(ownerId || "").trim();
  var data = input || {};
  var message = cleanText(data.message, 1000);
  var clientRequestId = safeLineRequestId(data.requestId);
  var token = String(env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();
  if (!id) throw makeError("缺少洽詢編號", 400);
  if (!actorId) throw makeError("缺少業主身分", 500);
  if (!message) throw makeError("請輸入回覆內容", 400);
  if (!clientRequestId) throw makeError("回覆識別碼格式錯誤", 400);
  if (!token) throw makeError("LINE 訊息功能尚未設定", 503);

  var existing = await env.DB.prepare(
    "SELECT id, inquiry_id, reply_text, status, created_at, sent_at " +
    "FROM ai_inquiry_owner_replies WHERE tenant_id = ?1 AND client_request_id = ?2"
  ).bind(env.TENANT_ID, clientRequestId).first();
  if (existing) {
    if (String(existing.inquiry_id) !== id || String(existing.reply_text) !== message) {
      throw makeError("回覆識別碼已被使用", 409);
    }
    return {
      ok: existing.status === "sent",
      id: String(existing.id),
      inquiryId: id,
      status: String(existing.status),
      createdAt: String(existing.created_at || ""),
      sentAt: String(existing.sent_at || "")
    };
  }

  var inquiry = await env.DB.prepare(
    "SELECT line_user_id, status FROM ai_customer_inquiries " +
    "WHERE tenant_id = ?1 AND id = ?2 AND expires_at > ?3"
  ).bind(env.TENANT_ID, id, nowIso(env)).first();
  if (!inquiry) throw makeError("找不到此 AI 洽詢", 404);

  var now = nowIso(env);
  var replyId = "air_" + crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO ai_inquiry_owner_replies (" +
    "id, tenant_id, inquiry_id, owner_id, client_request_id, reply_text, status, created_at" +
    ") VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'sending', ?7)"
  ).bind(
    replyId, env.TENANT_ID, id, actorId, clientRequestId, message, now
  ).run();

  var response;
  try {
    response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "X-Line-Retry-Key": replyId.replace(/^air_/, "")
      },
      body: JSON.stringify({
        to: String(inquiry.line_user_id),
        messages: [{ type: "text", text: "茱麗葉工作室回覆：\n" + message }]
      })
    });
  } catch (error) {
    var failedAt = nowIso(env);
    await env.DB.prepare(
      "UPDATE ai_inquiry_owner_replies SET status = 'failed', failed_at = ?1, " +
      "error_code = ?2 WHERE tenant_id = ?3 AND id = ?4 AND status = 'sending'"
    ).bind(
      failedAt,
      "line_network_error",
      env.TENANT_ID,
      replyId
    ).run();
    throw makeError("LINE 訊息未送出，請稍後重新回覆", 502);
  }
  if (!response.ok) {
    var rejectedAt = nowIso(env);
    await env.DB.prepare(
      "UPDATE ai_inquiry_owner_replies SET status = 'failed', failed_at = ?1, " +
      "error_code = ?2 WHERE tenant_id = ?3 AND id = ?4 AND status = 'sending'"
    ).bind(
      rejectedAt,
      lineFailureCode(Number(response.status) || 0),
      env.TENANT_ID,
      replyId
    ).run();
    throw makeError("LINE 訊息未送出，請稍後重新回覆", 502);
  }

  var sentAt = nowIso(env);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE ai_inquiry_owner_replies SET status = 'sent', sent_at = ?1 " +
      "WHERE tenant_id = ?2 AND id = ?3 AND status = 'sending'"
    ).bind(sentAt, env.TENANT_ID, replyId),
    env.DB.prepare(
      "UPDATE ai_customer_inquiries SET status = 'resolved', " +
      "reviewed_at = COALESCE(reviewed_at, ?1), resolved_at = ?1 " +
      "WHERE tenant_id = ?2 AND id = ?3"
    ).bind(sentAt, env.TENANT_ID, id)
  ]);
  return {
    ok: true,
    id: replyId,
    inquiryId: id,
    status: "sent",
    createdAt: now,
    sentAt: sentAt
  };
}
