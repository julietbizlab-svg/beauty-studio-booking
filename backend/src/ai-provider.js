/**
 * Owner AI provider 抽象、嚴格 payload schema、能力旗標、本機限流、Workers AI adapter。
 *
 * 合約（硬性）：
 * - 不記錄／不持久化任何 prompt、AI 回應、或資料庫列內容（無 console／D1／R2／KV／cache 寫入）。
 * - 不自動傳送 LINE、不寫 audit、不變更預約狀態。
 * - 預設關閉：需 OWNER_AI_ENABLED 明確啟用且可解析到 provider，否則 503。
 * - 測試注入 env.AI_PROVIDER；正式可選 Workers AI adapter（需 env.AI + OWNER_AI_MODEL），
 *   本工作包不設定 wrangler binding／model／env 值。
 * - 分散式限流屬後續部署議題；此處僅 best-effort 單 Isolate 記憶體限流。
 */

var DRAFT_TYPES = {
  booking_reminder: "預約提醒",
  reschedule_coordination: "改期協調",
  cancellation_reply: "取消回覆",
  pre_service_reminder: "服務前叮嚀",
  post_service_care: "服務後保養"
};

/** 固定通用問候語（繁中）；訊息草稿不得帶入任何客戶身分。 */
export var FIXED_GREETING = "您好";

export var AI_OUTPUT_MAX_CODE_POINTS = 500;
export var AI_SERVICE_NAME_MAX_CODE_POINTS = 80;
export var AI_STATUS_MAX_CODE_POINTS = 20;
export var AI_BOOKINGS_MAX_ITEMS = 48;
export var AI_DURATION_MAX_MINUTES = 480;
export var AI_BOOKING_ID_MAX_LENGTH = 64;

/** 摘要：每 owner 每 60 秒最多 5 次；草稿：每 60 秒最多 10 次（單 Isolate）。 */
export var AI_RATE_SUMMARY_LIMIT = 5;
export var AI_RATE_DRAFT_LIMIT = 10;
export var AI_RATE_WINDOW_MS = 60 * 1000;

var FORBIDDEN_KEY_PATTERN =
  /^(phone|mobile|birthday|line_user_id|lineUserId|customer_id|customerId|booking_id|bookingId|booking_no|bookingNo|display_name|displayName|displayNameHint|customerName|name|notes?|owner_notes?|customer_notes?|photo|photos|token|secret|authorization|cookie|header|headers|raw|password)$/i;

var FORBIDDEN_VALUE_PATTERN =
  /(line[_-]?user|U[0-9a-fA-F]{10,}|Bearer\s|CHANNEL_SECRET|ACCESS_TOKEN|\.dev\.vars)/i;

var CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

var defaultRateStore = Object.create(null);

function makeError(message, status, headers) {
  var error = new Error(message);
  error.status = status;
  if (headers) {
    error.headers = headers;
  }
  return error;
}

function codePointLength(str) {
  return Array.from(String(str || "")).length;
}

function truncateCodePoints(str, max) {
  return Array.from(String(str || "")).slice(0, max).join("");
}

function hasControlChars(str) {
  return CONTROL_CHAR_PATTERN.test(String(str || ""));
}

export function listAiDraftTypes() {
  return Object.keys(DRAFT_TYPES).map(function (key) {
    return { id: key, label: DRAFT_TYPES[key] };
  });
}

export function isAllowedAiDraftType(draftType) {
  return Object.prototype.hasOwnProperty.call(DRAFT_TYPES, String(draftType || ""));
}

export function getAiDraftTypeLabel(draftType) {
  return DRAFT_TYPES[String(draftType || "")] || "";
}

export function isValidAiDateString(date) {
  var value = String(date || "");
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function isValidAiTimeString(time) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ""));
}

export function isValidAiBookingId(bookingId) {
  var id = String(bookingId || "");
  if (!id || id.length > AI_BOOKING_ID_MAX_LENGTH) return false;
  return /^[A-Za-z0-9_-]+$/.test(id);
}

/**
 * 將 DB 字串視為不可信 prompt 資料：去控制字元、trim、截斷碼點。
 */
export function sanitizeAiUntrustedText(value, maxCodePoints, fallback) {
  var raw = String(value == null ? "" : value);
  raw = raw.replace(CONTROL_CHAR_PATTERN, "").trim();
  if (!raw) {
    return fallback != null ? String(fallback) : "";
  }
  if (codePointLength(raw) > maxCodePoints) {
    raw = truncateCodePoints(raw, maxCodePoints);
  }
  return raw;
}

function assertExactKeys(obj, allowedKeys, label) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw makeError("AI payload 格式錯誤（" + label + "）", 500);
  }
  var keys = Object.keys(obj).sort();
  var expected = allowedKeys.slice().sort();
  if (keys.length !== expected.length) {
    throw makeError("AI payload 鍵數量不符（" + label + "）", 500);
  }
  for (var i = 0; i < expected.length; i++) {
    if (keys[i] !== expected[i]) {
      throw makeError("AI payload 含非允許鍵（" + label + "）", 500);
    }
  }
}

function walkForbidden(value, path, findings) {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach(function (item, index) {
      walkForbidden(item, path + "[" + index + "]", findings);
    });
    return;
  }
  if (typeof value !== "object") {
    if (typeof value === "string" && FORBIDDEN_VALUE_PATTERN.test(value)) {
      findings.push(path || "(root)");
    }
    return;
  }
  Object.keys(value).forEach(function (key) {
    var nextPath = path ? path + "." + key : key;
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      findings.push(nextPath);
      return;
    }
    walkForbidden(value[key], nextPath, findings);
  });
}

export function assertAiPayloadSafe(payload, contextLabel) {
  var findings = [];
  walkForbidden(payload, "", findings);
  if (findings.length) {
    throw makeError(
      "AI payload 含禁止欄位（" + (contextLabel || "unknown") + "）",
      500
    );
  }
}

/**
 * 嚴格驗證當日摘要 provider payload（精確鍵＋型別＋範圍）。
 */
export function assertDailySummaryPayloadSchema(payload) {
  assertExactKeys(payload, ["date", "bookings"], "daily-summary");
  if (!isValidAiDateString(payload.date)) {
    throw makeError("AI payload date 無效", 500);
  }
  if (!Array.isArray(payload.bookings)) {
    throw makeError("AI payload bookings 必須為陣列", 500);
  }
  if (payload.bookings.length > AI_BOOKINGS_MAX_ITEMS) {
    throw makeError("AI payload bookings 過長", 500);
  }
  payload.bookings.forEach(function (item, index) {
    assertExactKeys(
      item,
      ["startTime", "durationMinutes", "serviceName", "status"],
      "daily-summary[" + index + "]"
    );
    if (!isValidAiTimeString(item.startTime)) {
      throw makeError("AI payload startTime 無效", 500);
    }
    if (
      typeof item.durationMinutes !== "number" ||
      !Number.isFinite(item.durationMinutes) ||
      !Number.isInteger(item.durationMinutes) ||
      item.durationMinutes < 0 ||
      item.durationMinutes > AI_DURATION_MAX_MINUTES
    ) {
      throw makeError("AI payload durationMinutes 無效", 500);
    }
    if (typeof item.serviceName !== "string" || !item.serviceName ||
        codePointLength(item.serviceName) > AI_SERVICE_NAME_MAX_CODE_POINTS ||
        hasControlChars(item.serviceName)) {
      throw makeError("AI payload serviceName 無效", 500);
    }
    if (typeof item.status !== "string" || !item.status ||
        codePointLength(item.status) > AI_STATUS_MAX_CODE_POINTS ||
        hasControlChars(item.status)) {
      throw makeError("AI payload status 無效", 500);
    }
  });
  assertAiPayloadSafe(payload, "daily-summary");
}

/**
 * 嚴格驗證訊息草稿 provider payload。
 * greetingLabel 必須為固定「您好」；不得含任何客戶身分欄位。
 */
export function assertMessageDraftPayloadSchema(payload) {
  assertExactKeys(
    payload,
    ["draftType", "draftTypeLabel", "greetingLabel", "serviceName", "date", "time"],
    "message-draft"
  );
  if (!isAllowedAiDraftType(payload.draftType)) {
    throw makeError("AI payload draftType 無效", 500);
  }
  if (payload.draftTypeLabel !== getAiDraftTypeLabel(payload.draftType)) {
    throw makeError("AI payload draftTypeLabel 無效", 500);
  }
  if (payload.greetingLabel !== FIXED_GREETING) {
    throw makeError("AI payload greetingLabel 必須為固定問候語", 500);
  }
  if (!isValidAiDateString(payload.date)) {
    throw makeError("AI payload date 無效", 500);
  }
  if (!isValidAiTimeString(payload.time)) {
    throw makeError("AI payload time 無效", 500);
  }
  if (typeof payload.serviceName !== "string" || !payload.serviceName ||
      codePointLength(payload.serviceName) > AI_SERVICE_NAME_MAX_CODE_POINTS ||
      hasControlChars(payload.serviceName)) {
    throw makeError("AI payload serviceName 無效", 500);
  }
  assertAiPayloadSafe(payload, "message-draft");
}

export function sanitizeAndValidateAiOutput(text) {
  if (typeof text !== "string") {
    throw makeError("AI 未回傳可用草稿", 502);
  }
  var cleaned = text.replace(CONTROL_CHAR_PATTERN, "").trim();
  if (!cleaned) {
    throw makeError("AI 未回傳可用草稿", 502);
  }
  if (codePointLength(cleaned) > AI_OUTPUT_MAX_CODE_POINTS) {
    cleaned = truncateCodePoints(cleaned, AI_OUTPUT_MAX_CODE_POINTS);
  }
  if (!cleaned || hasControlChars(cleaned)) {
    throw makeError("AI 未回傳可用草稿", 502);
  }
  return cleaned;
}

function isTruthyFlag(value) {
  return value === true || value === "true" || value === "1";
}

/**
 * Cloudflare Workers AI adapter（程式就緒、預設不啟用）。
 * 需同時具備 env.AI.run 與明確的 env.OWNER_AI_MODEL；缺一則 null（fail closed）。
 * 不硬編碼 model 字串；單次嘗試＋逾時；結構化 messages；清楚分隔不可信預約資料。
 */
export function createWorkersAiProvider(env) {
  if (!env || !env.AI || typeof env.AI.run !== "function") {
    return null;
  }
  var model = env.OWNER_AI_MODEL != null ? String(env.OWNER_AI_MODEL).trim() : "";
  if (!model) {
    return null;
  }
  var timeoutMs = Number(env.OWNER_AI_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    timeoutMs = 12000;
  }

  async function runOnce(systemPrompt, userPayload) {
    // 契約：不 log prompt／response；不可信資料置於明確分隔區。
    var userContent =
      "【不可信預約資料開始】\n" +
      JSON.stringify(userPayload) +
      "\n【不可信預約資料結束】\n" +
      "請依系統指示產出繁體中文草稿。";

    var runPromise = env.AI.run(model, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    });

    var timer;
    var timeoutPromise = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        reject(makeError("AI 產生逾時", 502));
      }, timeoutMs);
    });

    try {
      var result = await Promise.race([runPromise, timeoutPromise]);
      var text = "";
      if (typeof result === "string") {
        text = result;
      } else if (result && typeof result.response === "string") {
        text = result.response;
      } else if (result && typeof result.text === "string") {
        text = result.text;
      }
      return { text: text };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  var systemBase =
    "你是美業工作室業主助手，只產出繁體中文（台灣）草稿。" +
    "不可捏造價格、政策、客戶事實或未提供的資訊。" +
    "不可宣稱訊息已傳送或已儲存。" +
    "輸出純文字草稿，供業主自行審核後使用。";

  return {
    generateDailySummary: async function (payload) {
      assertDailySummaryPayloadSchema(payload);
      return runOnce(
        systemBase + "任務：依當日預約列表產出簡短行程摘要草稿。",
        payload
      );
    },
    generateMessageDraft: async function (payload) {
      assertMessageDraftPayloadSchema(payload);
      return runOnce(
        systemBase +
          "任務：依草稿類型產出給客戶的訊息草稿；開頭使用固定問候「您好」。",
        payload
      );
    }
  };
}

export function resolveAiProvider(env) {
  var injected = env && env.AI_PROVIDER;
  if (
    injected &&
    typeof injected.generateDailySummary === "function" &&
    typeof injected.generateMessageDraft === "function"
  ) {
    return injected;
  }
  return createWorkersAiProvider(env);
}

/**
 * 功能旗標：必須明確啟用且可取得 provider，否則視為關閉。
 * 預設 env（無 OWNER_AI_ENABLED）→ false。
 */
export function isOwnerAiCapabilityEnabled(env) {
  if (!isTruthyFlag(env && env.OWNER_AI_ENABLED)) {
    return false;
  }
  return resolveAiProvider(env) != null;
}

export function requireOwnerAiCapability(env) {
  if (!isOwnerAiCapabilityEnabled(env)) {
    throw makeError("AI 功能尚未啟用，請稍後再試", 503);
  }
  return resolveAiProvider(env);
}

export function getOwnerAiCapability(env) {
  // 僅揭露 enabled；不洩漏 model／provider／ownerId
  return {
    ok: true,
    enabled: isOwnerAiCapabilityEnabled(env)
  };
}

function getRateStore(env) {
  if (env && env.AI_RATE_LIMIT_STORE && typeof env.AI_RATE_LIMIT_STORE === "object") {
    return env.AI_RATE_LIMIT_STORE;
  }
  return defaultRateStore;
}

function getNowMs(env) {
  if (env && typeof env.AI_RATE_LIMIT_NOW_MS === "number" &&
      Number.isFinite(env.AI_RATE_LIMIT_NOW_MS)) {
    return env.AI_RATE_LIMIT_NOW_MS;
  }
  if (env && typeof env.AI_RATE_LIMIT_NOW_MS === "function") {
    return Number(env.AI_RATE_LIMIT_NOW_MS());
  }
  return Date.now();
}

/**
 * 測試用：清空預設記憶體限流狀態（不寫 D1／R2／KV）。
 */
export function resetAiRateLimitStoreForTests() {
  Object.keys(defaultRateStore).forEach(function (key) {
    delete defaultRateStore[key];
  });
}

/**
 * Owner 範圍本機限流（best-effort，單 Isolate）。
 * bucketKey 使用雜湊樣式前綴，回應不得回傳 ownerId。
 * kind: "summary" | "draft"
 */
export function assertOwnerAiRateLimit(env, ownerUserId, kind) {
  var ownerKey = String(ownerUserId || "").trim();
  if (!ownerKey) {
    throw makeError("AI 產生失敗，請稍後再試", 502);
  }
  var limit = kind === "draft" ? AI_RATE_DRAFT_LIMIT : AI_RATE_SUMMARY_LIMIT;
  var windowMs = AI_RATE_WINDOW_MS;
  var now = getNowMs(env);
  var store = getRateStore(env);
  // 不把原始 ownerId 當對外訊息；僅作記憶體鍵
  var bucket = "ai:" + kind + ":" + ownerKey;
  var entry = store[bucket];
  if (!entry || !Array.isArray(entry.hits)) {
    entry = { hits: [] };
    store[bucket] = entry;
  }
  entry.hits = entry.hits.filter(function (ts) {
    return now - ts < windowMs;
  });
  if (entry.hits.length >= limit) {
    var oldest = entry.hits[0];
    var retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    throw makeError("操作過於頻繁，請稍後再試", 429, {
      "Retry-After": String(retryAfterSec)
    });
  }
  entry.hits.push(now);
}

export async function invokeAiProviderMethod(provider, methodName, payload) {
  if (methodName === "generateDailySummary") {
    assertDailySummaryPayloadSchema(payload);
  } else if (methodName === "generateMessageDraft") {
    assertMessageDraftPayloadSchema(payload);
  } else {
    throw makeError("AI 產生失敗，請稍後再試", 502);
  }

  try {
    var result = await provider[methodName](payload);
    var text = result && typeof result.text === "string" ? result.text : "";
    return sanitizeAndValidateAiOutput(text);
  } catch (error) {
    if (error && error.status) {
      if (error.status === 500 && /AI payload/.test(String(error.message || ""))) {
        throw makeError("AI 產生失敗，請稍後再試", 502);
      }
      throw error;
    }
    throw makeError("AI 產生失敗，請稍後再試", 502);
  }
}

export var AI_DISCLAIMER =
  "此為 AI 草稿，業主須自行審核後再使用；系統不會自動傳送、不會儲存。";
