import {
  isKnownBookingStatus,
  isCustomerCancellableStatus,
  isCancellationStatus
} from "./booking-state-machine.js";

/**
 * 預約／取消提前天數政策（精確 = 天數 × 24 小時）
 *
 * - 儲存一律 UTC ISO-8601；顯示格式化使用 Asia/Taipei。
 * - 剛好到達截止時間允許；超過 1 毫秒即禁止。
 * - 已開始或已過期的預約，客戶一律不可取消。
 */

export var NOTICE_DAYS_MIN = 0;
export var NOTICE_DAYS_MAX = 30;
export var DEFAULT_NOTICE_DAYS = 1;
/** 無快照的舊預約 fallback（固定 1 天，不讀目前 tenant 設定） */
export var FALLBACK_CANCELLATION_NOTICE_DAYS = 1;

export var MS_PER_NOTICE_DAY = 24 * 60 * 60 * 1000;

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

/** 解析設定值；無效時回 fallback（用於讀取 tenant 設定） */
export function parseNoticeDays(value, fallback) {
  if (value == null || value === "") {
    return fallback != null ? fallback : DEFAULT_NOTICE_DAYS;
  }
  var n = Number(value);
  if (!Number.isInteger(n) || n < NOTICE_DAYS_MIN || n > NOTICE_DAYS_MAX) {
    return fallback != null ? fallback : DEFAULT_NOTICE_DAYS;
  }
  return n;
}

/** 業主更新設定：只接受 0～30 整數；null／字串／小數／超範圍一律拒絕 */
export function validateNoticeDaysInput(value, fieldLabel) {
  if (value === undefined) {
    return;
  }
  if (value === null || value === "") {
    throw makeError("「" + fieldLabel + "」不可為空", 400);
  }
  if (typeof value === "boolean") {
    throw makeError("「" + fieldLabel + "」須為 0～30 的整數", 400);
  }
  var n = Number(value);
  if (!Number.isInteger(n) || n < NOTICE_DAYS_MIN || n > NOTICE_DAYS_MAX) {
    throw makeError("「" + fieldLabel + "」須為 0～30 的整數", 400);
  }
}

/** 台北 date（YYYY-MM-DD）+ time（HH:MM）→ UTC Date */
export function taipeiSlotStartToDate(dateStr, timeStr) {
  return new Date(String(dateStr) + "T" + String(timeStr) + ":00+08:00");
}

/** 取消截止 = 預約開始 − noticeDays × 24h（UTC ms） */
export function computeCancellationDeadlineAt(startAtUtc, noticeDays) {
  var days = parseNoticeDays(noticeDays, DEFAULT_NOTICE_DAYS);
  var startMs = new Date(startAtUtc).getTime();
  if (isNaN(startMs)) {
    return null;
  }
  return new Date(startMs - days * MS_PER_NOTICE_DAY).toISOString();
}

/**
 * 建立預約：start_at 必須 >= now + noticeDays × 24h（含邊界）。
 * noticeDays = 0 時仍須 start > now（不可預約已開始／已過去）。
 */
export function meetsBookingMinNotice(startAtUtc, noticeDays, nowUtc) {
  var startMs = new Date(startAtUtc).getTime();
  var nowMs = nowUtc.getTime();
  if (isNaN(startMs)) {
    return false;
  }
  if (startMs <= nowMs) {
    return false;
  }
  var days = parseNoticeDays(noticeDays, DEFAULT_NOTICE_DAYS);
  var minStartMs = nowMs + days * MS_PER_NOTICE_DAY;
  return startMs >= minStartMs;
}

export function isBookingStartedOrPast(startAtUtc, nowUtc) {
  var startMs = new Date(startAtUtc).getTime();
  return !isNaN(startMs) && startMs <= nowUtc.getTime();
}

/**
 * 解析此筆預約的取消截止（優先 DB 快照；舊資料 fallback 1 天）。
 * 回傳 { deadlineAt, noticeDays }（deadlineAt 為 UTC ISO）。
 */
export function resolveCancellationPolicy(startAtUtc, storedDeadline, storedNoticeDays) {
  if (storedDeadline) {
    return {
      deadlineAt: storedDeadline,
      noticeDays: storedNoticeDays != null
        ? parseNoticeDays(storedNoticeDays, FALLBACK_CANCELLATION_NOTICE_DAYS)
        : FALLBACK_CANCELLATION_NOTICE_DAYS
    };
  }
  var noticeDays = storedNoticeDays != null
    ? parseNoticeDays(storedNoticeDays, FALLBACK_CANCELLATION_NOTICE_DAYS)
    : FALLBACK_CANCELLATION_NOTICE_DAYS;
  return {
    deadlineAt: computeCancellationDeadlineAt(startAtUtc, noticeDays),
    noticeDays: noticeDays
  };
}

/**
 * 客戶可否取消（不含所有權／status 檢查）。
 * 回傳 { canCancel, reasonCode, reasonMessage }。
 */
export function evaluateCustomerCancelPermission(startAtUtc, storedDeadline, storedNoticeDays, nowUtc, status) {
  if (!isKnownBookingStatus(status)) {
    return {
      canCancel: false,
      reasonCode: "not_cancellable_status",
      reasonMessage: "此預約無法取消"
    };
  }
  if (isCancellationStatus(status)) {
    return {
      canCancel: false,
      reasonCode: "already_cancelled",
      reasonMessage: "此預約已取消"
    };
  }
  if (!isCustomerCancellableStatus(status)) {
    return {
      canCancel: false,
      reasonCode: "not_cancellable_status",
      reasonMessage: "此預約無法取消"
    };
  }
  if (isBookingStartedOrPast(startAtUtc, nowUtc)) {
    return {
      canCancel: false,
      reasonCode: "booking_started",
      reasonMessage: "此預約已超過取消期限，如需協助請聯絡工作室。"
    };
  }
  var policy = resolveCancellationPolicy(startAtUtc, storedDeadline, storedNoticeDays);
  var deadlineMs = new Date(policy.deadlineAt).getTime();
  var nowMs = nowUtc.getTime();
  if (isNaN(deadlineMs) || nowMs > deadlineMs) {
    return {
      canCancel: false,
      reasonCode: "past_cancellation_deadline",
      reasonMessage: "此預約已超過取消期限，如需協助請聯絡工作室。"
    };
  }
  return {
    canCancel: true,
    reasonCode: null,
    reasonMessage: "",
    cancellationDeadlineAt: policy.deadlineAt,
    cancellationNoticeDays: policy.noticeDays
  };
}

/** Asia/Taipei 顯示：YYYY-MM-DD HH:mm（供 API DTO，前端不自行推算） */
export function formatDeadlineTaipei(isoUtc) {
  if (!isoUtc) return "";
  var parsed = new Date(isoUtc);
  if (isNaN(parsed.getTime())) return "";
  var parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(parsed);
  var y = "", mo = "", d = "", h = "", mi = "";
  parts.forEach(function (p) {
    if (p.type === "year") y = p.value;
    if (p.type === "month") mo = p.value;
    if (p.type === "day") d = p.value;
    if (p.type === "hour") h = p.value;
    if (p.type === "minute") mi = p.value;
  });
  return y + "-" + mo + "-" + d + " " + h + ":" + mi;
}

/** 時段是否可預約（含 min notice；days=0 仍排除已開始） */
export function isSlotStartBookable(dateStr, timeStr, noticeDays, nowUtc) {
  var start = taipeiSlotStartToDate(dateStr, timeStr);
  return meetsBookingMinNotice(start.toISOString(), noticeDays, nowUtc);
}
