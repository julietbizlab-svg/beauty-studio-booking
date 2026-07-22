/**
 * Owner AI 草稿編排（唯讀、零持久化）
 *
 * 合約：
 * - 不 log／不儲存 prompt、AI 回應、或完整 DB 列
 * - 零 D1／R2／audit／LINE／storage 寫入；不自動傳送
 * - 驗證順序：請求本體 400 → 能力／provider 503 → 限流 429 → 唯讀查詢 → 產生
 * - 訊息草稿問候固定「您好」，不 SELECT／不傳遞任何客戶身分
 */

import {
  requireOwnerAiCapability,
  invokeAiProviderMethod,
  isAllowedAiDraftType,
  getAiDraftTypeLabel,
  isValidAiDateString,
  isValidAiBookingId,
  assertOwnerAiRateLimit,
  sanitizeAiUntrustedText,
  FIXED_GREETING,
  AI_DISCLAIMER,
  AI_SERVICE_NAME_MAX_CODE_POINTS,
  AI_STATUS_MAX_CODE_POINTS,
  AI_DURATION_MAX_MINUTES,
  AI_BOOKINGS_MAX_ITEMS
} from "./ai-provider.js";
import {
  listOwnerAiDailySummaryItems,
  getOwnerAiMessageDraftContext
} from "./data-repository.js";

function makeError(message, status, headers) {
  var error = new Error(message);
  error.status = status;
  if (headers) error.headers = headers;
  return error;
}

function assertPlainObjectBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw makeError("請求格式錯誤", 400);
  }
}

/**
 * 當日摘要：先驗證 date（400），再能力／限流／產生。
 */
export async function generateOwnerDailySummaryDraft(env, body, ownerUserId) {
  assertPlainObjectBody(body);
  var extraKeys = Object.keys(body).filter(function (k) { return k !== "date"; });
  if (extraKeys.length) {
    throw makeError("請求含不支援的欄位", 400);
  }
  if (!isValidAiDateString(body.date)) {
    throw makeError("date 格式錯誤，請使用 YYYY-MM-DD", 400);
  }

  var provider = requireOwnerAiCapability(env);
  assertOwnerAiRateLimit(env, ownerUserId, "summary");

  var packed = await listOwnerAiDailySummaryItems(env, body.date);
  var bookings = (packed.bookings || []).slice(0, AI_BOOKINGS_MAX_ITEMS).map(function (item) {
    var duration = Number(item.durationMinutes);
    if (!Number.isFinite(duration) || duration < 0) duration = 0;
    if (duration > AI_DURATION_MAX_MINUTES) duration = AI_DURATION_MAX_MINUTES;
    duration = Math.round(duration);
    return {
      startTime: String(item.startTime || ""),
      durationMinutes: duration,
      serviceName: sanitizeAiUntrustedText(
        item.serviceName,
        AI_SERVICE_NAME_MAX_CODE_POINTS,
        "服務"
      ),
      status: sanitizeAiUntrustedText(
        item.status,
        AI_STATUS_MAX_CODE_POINTS,
        "已確認"
      )
    };
  });

  var payload = {
    date: packed.date,
    bookings: bookings
  };

  var draft = await invokeAiProviderMethod(
    provider,
    "generateDailySummary",
    payload
  );

  return {
    ok: true,
    date: packed.date,
    bookingCount: bookings.length,
    draft: draft,
    disclaimer: AI_DISCLAIMER
  };
}

/**
 * 訊息草稿：先驗證 bookingId／draftType（400），再能力／限流／產生。
 * Provider payload 使用固定「您好」，不含客戶姓名或任何身分欄位。
 */
export async function generateOwnerMessageDraft(env, body, ownerUserId) {
  assertPlainObjectBody(body);
  var allowed = { bookingId: true, draftType: true };
  var extras = Object.keys(body).filter(function (k) { return !allowed[k]; });
  if (extras.length) {
    throw makeError("請求含不支援的欄位", 400);
  }
  if (!isValidAiBookingId(body.bookingId)) {
    throw makeError("bookingId 無效", 400);
  }
  if (!isAllowedAiDraftType(body.draftType)) {
    throw makeError("draftType 無效，請使用允許的草稿類型", 400);
  }

  var provider = requireOwnerAiCapability(env);
  assertOwnerAiRateLimit(env, ownerUserId, "draft");

  var ctx = await getOwnerAiMessageDraftContext(env, body.bookingId);
  var payload = {
    draftType: String(body.draftType),
    draftTypeLabel: getAiDraftTypeLabel(body.draftType),
    greetingLabel: FIXED_GREETING,
    serviceName: sanitizeAiUntrustedText(
      ctx.serviceName,
      AI_SERVICE_NAME_MAX_CODE_POINTS,
      "服務"
    ),
    date: ctx.date,
    time: ctx.time
  };

  var draft = await invokeAiProviderMethod(
    provider,
    "generateMessageDraft",
    payload
  );

  return {
    ok: true,
    draftType: payload.draftType,
    draftTypeLabel: payload.draftTypeLabel,
    draft: draft,
    disclaimer: AI_DISCLAIMER
  };
}
