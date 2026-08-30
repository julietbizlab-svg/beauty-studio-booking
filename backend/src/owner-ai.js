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
  AI_STUDIO_NAME_MAX_CODE_POINTS,
  AI_STATUS_MAX_CODE_POINTS,
  AI_DURATION_MAX_MINUTES,
  AI_BOOKINGS_MAX_ITEMS
} from "./ai-provider.js";
import {
  listOwnerAiDailySummaryItems,
  getOwnerAiMessageDraftContext,
  getOwnerBookingReview
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

export function inferOwnerAiServiceCategory(serviceName) {
  var name = String(serviceName || "");
  if (/霧眉|紋眉|飄眉|粉霧眉|眉毛|眉部/.test(name)) return "brow";
  if (/霧唇|紋唇|唇色|唇部|嘴唇/.test(name)) return "lip";
  if (/美甲|指甲|凝膠|手足/.test(name)) return "nail";
  if (/美睫|睫毛|嫁接/.test(name)) return "lash";
  return "other";
}

var SIMPLIFIED_CHINESE_PATTERN =
  /[请这为与后发肤时会务进过个们问议联络还没让从将应对开关门边变无须顾复术处于种该达]/;
var INTERNAL_AI_META_PATTERN =
  /booking_reminder|reschedule_coordination|cancellation_reply|pre_service_reminder|post_service_care|draftType|payload|根據系統指示|系統指示|草稿類型|以下是草稿|產出草稿類型|推理過程/i;

export function assertOwnerAiMessageDraftMatchesService(draft, payload) {
  var text = String(draft || "");
  if (SIMPLIFIED_CHINESE_PATTERN.test(text)) {
    throw makeError("AI 草稿含簡體中文，已停止顯示，請重新產生", 502);
  }
  if (!/^您好/.test(text)) {
    throw makeError("AI 草稿格式不符，已停止顯示，請重新產生", 502);
  }
  if (INTERNAL_AI_META_PATTERN.test(text)) {
    throw makeError("AI 草稿含內部系統文字，已停止顯示，請重新產生", 502);
  }
  var category = payload && payload.serviceCategory;
  var semanticText = text;
  [payload && payload.serviceName, payload && payload.studioName].forEach(function (trustedLabel) {
    var label = String(trustedLabel || "");
    if (label) semanticText = semanticText.split(label).join("");
  });
  var forbiddenByCategory = {
    brow: /唇部|嘴唇|唇色|霧唇|紋唇|美甲|指甲|睫毛|美睫/,
    lip: /眉部|眉毛|霧眉|紋眉|飄眉|美甲|指甲|睫毛|美睫/,
    nail: /眉部|眉毛|霧眉|紋眉|唇部|嘴唇|霧唇|睫毛|美睫/,
    lash: /眉部|眉毛|霧眉|紋眉|唇部|嘴唇|霧唇|美甲|指甲/
  };
  if (forbiddenByCategory[category] && forbiddenByCategory[category].test(semanticText)) {
    throw makeError("AI 草稿內容與服務項目不符，已停止顯示，請重新產生", 502);
  }
  return text;
}

export function buildOwnerRescheduleCoordinationDraft(payload) {
  var date = String(payload && payload.date || "").replace(/-/g, "/");
  var time = String(payload && payload.time || "");
  var serviceName = String(payload && payload.serviceName || "服務");
  var studioName = String(payload && payload.studioName || "本工作室");
  return "您好，關於您原訂於 " + date + " " + time + " 的「" + serviceName +
    "」服務，需要與您協調改期。請回覆方便的日期與時段，待本工作室確認後再為您安排。\n\n" +
    studioName;
}

export function buildOwnerPostServiceCareDraft(payload) {
  var serviceName = String(payload && payload.serviceName || "服務");
  var studioName = String(payload && payload.studioName || "本工作室");
  var category = String(payload && payload.serviceCategory || "other");
  var careByCategory = {
    brow: [
      "請依業主現場交代保持眉部清潔與乾燥。",
      "避免抓、摳或摩擦眉部，讓表面自然修復。",
      "恢復期間請避免游泳、泡湯、三溫暖及大量流汗。"
    ],
    lip: [
      "請依業主現場交代保持唇部清潔並做好保濕照護。",
      "避免抓、摳或摩擦唇部，讓表面自然修復。",
      "恢復期間請避免刺激性飲食，並依照業主說明照護。"
    ],
    nail: [
      "請避免摳、撕或自行剝除凝膠及裝飾。",
      "接觸清潔劑或長時間碰水時，建議配戴手套保護。",
      "如有翹起、裂損或不適，請聯絡本工作室協助處理。"
    ],
    lash: [
      "請避免揉眼、拉扯或自行拔除睫毛。",
      "清潔眼周時請放輕力道，並依照業主現場說明照護。",
      "如有持續不適或異常情形，請儘快聯絡本工作室。"
    ],
    other: [
      "請依照業主現場提供的服務後照護說明進行保養。",
      "避免抓、摳或摩擦施作部位。",
      "如有持續不適或異常情形，請儘快聯絡本工作室。"
    ]
  };
  var careLines = careByCategory[category] || careByCategory.other;
  return "您好，您的「" + serviceName + "」服務已完成，請留意以下服務後保養事項：\n\n- " +
    careLines.join("\n- ") + "\n\n" + studioName;
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
    arrivalReminderMinutes: Number.isInteger(Number(ctx.arrivalReminderMinutes))
      ? Number(ctx.arrivalReminderMinutes)
      : 5,
    draftType: String(body.draftType),
    draftTypeLabel: getAiDraftTypeLabel(body.draftType),
    greetingLabel: FIXED_GREETING,
    serviceCategory: inferOwnerAiServiceCategory(ctx.serviceName),
    serviceName: sanitizeAiUntrustedText(
      ctx.serviceName,
      AI_SERVICE_NAME_MAX_CODE_POINTS,
      "服務"
    ),
    studioName: sanitizeAiUntrustedText(
      ctx.studioName,
      AI_STUDIO_NAME_MAX_CODE_POINTS,
      "本工作室"
    ),
    date: ctx.date,
    time: ctx.time
  };

  var draft = payload.draftType === "reschedule_coordination"
    ? buildOwnerRescheduleCoordinationDraft(payload)
    : payload.draftType === "post_service_care"
      ? buildOwnerPostServiceCareDraft(payload)
      : await invokeAiProviderMethod(
      provider,
      "generateMessageDraft",
      payload
      );
  draft = assertOwnerAiMessageDraftMatchesService(draft, payload);

  return {
    ok: true,
    draftType: payload.draftType,
    draftTypeLabel: payload.draftTypeLabel,
    draft: draft,
    disclaimer: AI_DISCLAIMER
  };
}

export async function generateOwnerReviewSummary(env, body, ownerUserId) {
  assertPlainObjectBody(body);
  if (Object.keys(body).length !== 1 || !isValidAiBookingId(body.bookingId)) {
    throw makeError("bookingId 無效", 400);
  }
  var provider = requireOwnerAiCapability(env);
  if (!provider || typeof provider.generateReviewSummary !== "function") {
    throw makeError("AI 審核摘要尚未啟用", 503);
  }
  assertOwnerAiRateLimit(env, ownerUserId, "summary");
  var result = await getOwnerBookingReview(env, body.bookingId);
  var intake = result.intake || {};
  var payload = {
    status: intake.submittedAt ? "已提交" : "尚未提交",
    surgeryHistory: sanitizeAiUntrustedText(intake.surgeryHistory, 2000, "未提供"),
    diseaseHistory: sanitizeAiUntrustedText(intake.diseaseHistory, 2000, "未提供"),
    lastTreatmentAt: String(intake.lastTreatmentAt || ""),
    customerNote: sanitizeAiUntrustedText(intake.customerNote, 2000, ""),
    photoRequested: Boolean(intake.photoRequested),
    photoRequestNote: sanitizeAiUntrustedText(intake.photoRequestNote, 500, ""),
    photoCount: Math.min(3, (intake.photos || []).length)
  };
  return {
    ok: true,
    summary: await invokeAiProviderMethod(provider, "generateReviewSummary", payload),
    disclaimer: "AI 僅整理資料，不作醫療診斷或承接決定；最終仍由業主確認。"
  };
}
