/**
 * D1 資料層（v2）— services 與 settings repository
 *
 * Phase 2 第一小步：只提供與 notion.js 相容的 services／settings 函式，
 * 尚未接上 index.js 路由（見 TASK-d1-migration-plan.md Phase 2）。
 *
 * 對應資料表（backend/migrations/）：
 * - services（0001_init_core.sql）
 * - tenant_settings（0003_settings_schedules.sql，key-value）
 * - staff_schedules（0003_settings_schedules.sql，僅 schedule_type='weekly'）
 *
 * DTO 相容規則：
 * - service：{ id, name, durationMinutes, price, description, status, sortOrder }
 *   status 對外一律為「上架」／「下架」（與現有 API 相同）。
 * - settings：欄位與 notion.js 的 getSettings 相同（brandName、primaryColor、
 *   announcement、cancelPolicy、depositEnabled、depositAmount、bankName、
 *   bankCode、bankAccount、bankAccountName、depositNote）。
 *
 * 狀態轉換：
 * - 上架 ←→ active
 * - 下架 ←→ inactive
 * - archived（D1 保留的封存狀態）不出現在列表，也不可經由本 API 寫入。
 */

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

/** 檢查 D1 綁定與 tenant 設定；錯誤訊息不含任何 secret 或實際值 */
export function ensureD1Env(env) {
  if (!env.DB) {
    throw makeError("缺少 D1 資料庫綁定（DB），請確認 wrangler 設定", 500);
  }
  if (!env.TENANT_ID) {
    throw makeError("缺少 TENANT_ID 設定", 500);
  }
}

/** slots 功能另需 location／staff 定位設定 */
export function ensureD1SlotsEnv(env) {
  ensureD1Env(env);
  if (!env.LOCATION_ID) {
    throw makeError("缺少 LOCATION_ID 設定", 500);
  }
  if (!env.STAFF_ID) {
    throw makeError("缺少 STAFF_ID 設定", 500);
  }
}

function nowIso() {
  return new Date().toISOString();
}

// ─────────────────────────────── services ───────────────────────────────

var SERVICE_STATUS_TO_API = {
  active: "上架",
  inactive: "下架",
  archived: "下架"
};

var SERVICE_STATUS_TO_DB = {
  "上架": "active",
  "下架": "inactive"
};

function serviceApiStatusToDb(status) {
  var mapped = SERVICE_STATUS_TO_DB[String(status)];
  if (!mapped) {
    throw makeError("服務狀態僅支援「上架」或「下架」", 400);
  }
  return mapped;
}

function serviceRowToDto(row) {
  return {
    id: row.id,
    name: row.name,
    durationMinutes: Number(row.duration_minutes) || 60,
    price: Number(row.price_amount) || 0,
    description: row.description || "",
    status: SERVICE_STATUS_TO_API[row.status] || "下架",
    sortOrder: Number(row.sort_order) || 0
  };
}

export async function listServices(env, activeOnly) {
  ensureD1Env(env);

  var sql =
    "SELECT id, name, duration_minutes, price_amount, description, status, sort_order " +
    "FROM services WHERE tenant_id = ?1 AND status " +
    (activeOnly ? "= 'active' " : "IN ('active', 'inactive') ") +
    "ORDER BY sort_order ASC, created_at ASC";

  var result = await env.DB.prepare(sql).bind(env.TENANT_ID).all();
  return (result.results || []).map(serviceRowToDto);
}

export async function getServiceById(env, serviceId) {
  ensureD1Env(env);
  if (!serviceId) {
    throw makeError("缺少 serviceId", 400);
  }

  var row = await env.DB.prepare(
    "SELECT id, name, duration_minutes, price_amount, description, status, sort_order " +
    "FROM services WHERE tenant_id = ?1 AND id = ?2"
  ).bind(env.TENANT_ID, String(serviceId)).first();

  if (!row) {
    throw makeError("服務不存在", 404);
  }
  return serviceRowToDto(row);
}

/**
 * 依服務 ID 查時長對照表；查不到的 ID 略過（與 notion.js 行為一致，
 * 呼叫端以保守時長處理）。
 */
export async function getServiceDurationMap(env, serviceIds) {
  ensureD1Env(env);

  var ids = [];
  var seen = {};
  (serviceIds || []).forEach(function (id) {
    if (id && !seen[id]) {
      seen[id] = true;
      ids.push(String(id));
    }
  });

  if (!ids.length) {
    return {};
  }

  var placeholders = ids.map(function (ignore, i) { return "?" + (i + 2); }).join(", ");
  var result = await env.DB.prepare(
    "SELECT id, duration_minutes FROM services " +
    "WHERE tenant_id = ?1 AND id IN (" + placeholders + ")"
  ).bind(...[env.TENANT_ID].concat(ids)).all();

  var map = {};
  (result.results || []).forEach(function (row) {
    var duration = Number(row.duration_minutes) || 0;
    if (duration > 0) {
      map[row.id] = duration;
    }
  });
  return map;
}

export async function createService(env, data) {
  ensureD1Env(env);
  if (!data || !data.name) {
    throw makeError("請填寫服務名稱");
  }

  var id = crypto.randomUUID();
  var now = nowIso();
  var status = data.status !== undefined ? serviceApiStatusToDb(data.status) : "active";
  var durationMinutes = Number(data.durationMinutes) || 60;
  var price = data.price != null && data.price !== "" ? Number(data.price) : 0;
  var sortOrder = Number(data.sortOrder) || 0;

  if (!(durationMinutes > 0)) {
    throw makeError("時長須大於 0 分鐘", 400);
  }
  if (!(price >= 0)) {
    throw makeError("價格不可為負數", 400);
  }

  await env.DB.prepare(
    "INSERT INTO services (id, tenant_id, code, name, description, duration_minutes, " +
    "price_amount, status, sort_order, created_at, updated_at) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)"
  ).bind(
    id,
    env.TENANT_ID,
    "svc_" + id,
    String(data.name),
    data.description != null ? String(data.description) : "",
    durationMinutes,
    price,
    status,
    sortOrder,
    now
  ).run();

  return getServiceById(env, id);
}

export async function updateService(env, serviceId, data) {
  ensureD1Env(env);
  if (!serviceId) {
    throw makeError("缺少 serviceId", 400);
  }

  var sets = [];
  var binds = [];

  function addSet(column, value) {
    binds.push(value);
    sets.push(column + " = ?" + binds.length);
  }

  if (data.name !== undefined) {
    addSet("name", String(data.name));
  }
  if (data.durationMinutes !== undefined) {
    var duration = Number(data.durationMinutes) || 60;
    if (!(duration > 0)) {
      throw makeError("時長須大於 0 分鐘", 400);
    }
    addSet("duration_minutes", duration);
  }
  if (data.price !== undefined) {
    var price = data.price === null || data.price === "" ? 0 : Number(data.price);
    if (!(price >= 0)) {
      throw makeError("價格不可為負數", 400);
    }
    addSet("price_amount", price);
  }
  if (data.description !== undefined) {
    addSet("description", String(data.description));
  }
  if (data.status !== undefined) {
    addSet("status", serviceApiStatusToDb(data.status));
  }
  if (data.sortOrder !== undefined) {
    addSet("sort_order", Number(data.sortOrder) || 0);
  }

  if (sets.length) {
    addSet("updated_at", nowIso());
    binds.push(env.TENANT_ID);
    var tenantIndex = binds.length;
    binds.push(String(serviceId));
    var idIndex = binds.length;

    var result = await env.DB.prepare(
      "UPDATE services SET " + sets.join(", ") +
      " WHERE tenant_id = ?" + tenantIndex + " AND id = ?" + idIndex
    ).bind(...binds).run();

    if (!result.meta || !result.meta.changes) {
      throw makeError("服務不存在", 404);
    }
  }

  return getServiceById(env, serviceId);
}

// ─────────────────────────────── settings ───────────────────────────────

/**
 * settings 白名單：DTO 欄位 ↔ tenant_settings.setting_key。
 * setting_key 命名對齊既有匯入慣例（theme_color、cancellation_policy_text、
 * deposit_notice、bank_*）。updateSettings 只接受此清單，禁止任意 key 寫入。
 */
var SETTINGS_FIELDS = [
  { dto: "brandName", key: "brand_name", type: "string" },
  { dto: "primaryColor", key: "theme_color", type: "string" },
  { dto: "announcement", key: "announcement", type: "string" },
  { dto: "cancelPolicy", key: "cancellation_policy_text", type: "string" },
  { dto: "depositEnabled", key: "deposit_enabled", type: "boolean" },
  { dto: "depositAmount", key: "deposit_amount", type: "number" },
  { dto: "bankName", key: "bank_name", type: "string" },
  { dto: "bankCode", key: "bank_code", type: "string" },
  { dto: "bankAccount", key: "bank_account", type: "string" },
  { dto: "bankAccountName", key: "bank_account_name", type: "string" },
  { dto: "depositNote", key: "deposit_notice", type: "string" }
];

/** 預設值與 notion.js 的 defaultSettings() 一致 */
function defaultSettings() {
  return {
    id: "default",
    brandName: "美業工作室",
    primaryColor: "#E8B4B8",
    announcement: "",
    cancelPolicy: "預約日前 24 小時可免費取消。",
    depositEnabled: false,
    depositAmount: null,
    bankName: "",
    bankCode: "",
    bankAccount: "",
    bankAccountName: "",
    depositNote: ""
  };
}

function parseSettingValue(field, rawValue) {
  if (rawValue == null || rawValue === "") {
    return field.type === "number" || field.type === "boolean" ? null : "";
  }
  if (field.type === "boolean") {
    return rawValue === "true" || rawValue === "1";
  }
  if (field.type === "number") {
    var num = Number(rawValue);
    return Number.isFinite(num) ? num : null;
  }
  return String(rawValue);
}

function serializeSettingValue(field, value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (field.type === "boolean") {
    return value ? "true" : "false";
  }
  if (field.type === "number") {
    var num = Number(value);
    if (!Number.isFinite(num)) {
      throw makeError("欄位「" + field.dto + "」須為數字", 400);
    }
    return String(num);
  }
  return String(value);
}

export async function getSettings(env) {
  ensureD1Env(env);

  var keys = SETTINGS_FIELDS.map(function (f) { return f.key; });
  var placeholders = keys.map(function (ignore, i) { return "?" + (i + 2); }).join(", ");

  var result = await env.DB.prepare(
    "SELECT setting_key, setting_value FROM tenant_settings " +
    "WHERE tenant_id = ?1 AND setting_key IN (" + placeholders + ")"
  ).bind(...[env.TENANT_ID].concat(keys)).all();

  var byKey = {};
  (result.results || []).forEach(function (row) {
    byKey[row.setting_key] = row.setting_value;
  });

  var settings = defaultSettings();
  SETTINGS_FIELDS.forEach(function (field) {
    if (Object.prototype.hasOwnProperty.call(byKey, field.key)) {
      settings[field.dto] = parseSettingValue(field, byKey[field.key]);
    }
  });
  return settings;
}

export async function updateSettings(env, patch) {
  ensureD1Env(env);
  var input = patch || {};

  // 與 notion.js 相同的訂金驗證：開啟訂金時帳號、戶名必填且金額 > 0
  if (input.depositEnabled === true) {
    var account = input.bankAccount != null ? String(input.bankAccount).trim() : "";
    var accountName = input.bankAccountName != null ? String(input.bankAccountName).trim() : "";
    var depositAmount = input.depositAmount != null && input.depositAmount !== ""
      ? Number(input.depositAmount)
      : NaN;
    if (!account || !accountName) {
      throw makeError("開啟訂金時請填寫帳號與戶名", 400);
    }
    if (!(depositAmount > 0)) {
      throw makeError("開啟訂金時訂金金額須大於 0", 400);
    }
  }

  var now = nowIso();
  var statements = [];

  SETTINGS_FIELDS.forEach(function (field) {
    if (input[field.dto] === undefined) {
      return;
    }
    var value = serializeSettingValue(field, input[field.dto]);
    statements.push(
      env.DB.prepare(
        "INSERT INTO tenant_settings " +
        "(id, tenant_id, setting_key, setting_value, value_type, created_at, updated_at) " +
        "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6) " +
        "ON CONFLICT (tenant_id, setting_key) DO UPDATE SET " +
        "setting_value = excluded.setting_value, " +
        "value_type = excluded.value_type, " +
        "updated_at = excluded.updated_at"
      ).bind(
        crypto.randomUUID(),
        env.TENANT_ID,
        field.key,
        value,
        field.type,
        now
      )
    );
  });

  if (statements.length) {
    await env.DB.batch(statements);
  }

  return getSettings(env);
}

// ──────────────────────────── weekly slots ───────────────────────────────

/** index 即 staff_schedules.weekday（0=日 … 6=六），與 slots.js 標籤一致 */
var SLOT_WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

var TIME_HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function weekdayLabelToIndex(label) {
  var index = SLOT_WEEKDAY_LABELS.indexOf(String(label));
  if (index === -1) {
    throw makeError("星期格式錯誤，僅支援：日、一、二、三、四、五、六", 400);
  }
  return index;
}

function slotRowToDto(row) {
  var weekdayLabel = SLOT_WEEKDAY_LABELS[Number(row.weekday)] || "";
  var status = Number(row.is_available) === 1 ? "開放" : "關閉";
  return {
    id: row.id,
    name: "週" + weekdayLabel + " " + row.start_time + "~" + row.end_time,
    weekday: weekdayLabel,
    startTime: row.start_time,
    endTime: row.end_time,
    status: status
  };
}

/**
 * 與 notion.js 的 listWeeklySlots 相容：只回傳「開放」時段。
 */
export async function listWeeklySlots(env) {
  ensureD1SlotsEnv(env);

  var result = await env.DB.prepare(
    "SELECT id, weekday, start_time, end_time, is_available FROM staff_schedules " +
    "WHERE tenant_id = ?1 AND location_id = ?2 AND staff_id = ?3 " +
    "AND schedule_type = 'weekly' AND is_active = 1 AND is_available = 1 " +
    "ORDER BY weekday ASC, start_time ASC"
  ).bind(env.TENANT_ID, env.LOCATION_ID, env.STAFF_ID).all();

  return (result.results || []).map(slotRowToDto);
}

/**
 * 整批取代每週時段（與 notion.js 的 replaceWeeklySlots 行為一致：
 * 缺 weekday／startTime／endTime 的列直接略過）。
 * 只影響目前 tenant＋location＋staff 的 weekly rows；date_override 不動。
 * 刪除＋新增放同一個 D1 batch（單一交易），失敗不留半套資料。
 */
export async function replaceWeeklySlots(env, slots) {
  ensureD1SlotsEnv(env);

  var now = nowIso();
  var rows = [];
  var seen = {};

  (slots || []).forEach(function (slot) {
    if (!slot || !slot.weekday || !slot.startTime || !slot.endTime) {
      return;
    }

    var weekday = weekdayLabelToIndex(slot.weekday);
    var startTime = String(slot.startTime).trim();
    var endTime = String(slot.endTime).trim();

    if (!TIME_HHMM_PATTERN.test(startTime) || !TIME_HHMM_PATTERN.test(endTime)) {
      throw makeError("時間格式錯誤，請使用 HH:MM（24 小時制）", 400);
    }
    if (endTime <= startTime) {
      throw makeError("結束時間必須晚於開始時間", 400);
    }

    var duplicateKey = weekday + "|" + startTime + "|" + endTime;
    if (seen[duplicateKey]) {
      throw makeError("時段重複：週" + SLOT_WEEKDAY_LABELS[weekday] + " " + startTime + "~" + endTime, 400);
    }
    seen[duplicateKey] = true;

    var isAvailable;
    if (slot.status === undefined || slot.status === null || slot.status === "") {
      isAvailable = 1;
    } else if (slot.status === "開放") {
      isAvailable = 1;
    } else if (slot.status === "關閉") {
      isAvailable = 0;
    } else {
      throw makeError("時段狀態僅允許「開放」或「關閉」", 400);
    }

    rows.push({
      id: crypto.randomUUID(),
      weekday: weekday,
      startTime: startTime,
      endTime: endTime,
      isAvailable: isAvailable
    });
  });

  var statements = [
    env.DB.prepare(
      "DELETE FROM staff_schedules " +
      "WHERE tenant_id = ?1 AND location_id = ?2 AND staff_id = ?3 " +
      "AND schedule_type = 'weekly'"
    ).bind(env.TENANT_ID, env.LOCATION_ID, env.STAFF_ID)
  ];

  rows.forEach(function (row) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO staff_schedules " +
        "(id, tenant_id, location_id, staff_id, schedule_type, weekday, " +
        "start_time, end_time, is_available, is_active, created_at, updated_at) " +
        "VALUES (?1, ?2, ?3, ?4, 'weekly', ?5, ?6, ?7, ?8, 1, ?9, ?9)"
      ).bind(
        row.id,
        env.TENANT_ID,
        env.LOCATION_ID,
        env.STAFF_ID,
        row.weekday,
        row.startTime,
        row.endTime,
        row.isAvailable,
        now
      )
    );
  });

  await env.DB.batch(statements);

  return rows.map(function (row) {
    return slotRowToDto({
      id: row.id,
      weekday: row.weekday,
      start_time: row.startTime,
      end_time: row.endTime,
      is_available: row.isAvailable
    });
  });
}

// ─────────────────────── bookings（唯讀查詢） ────────────────────────────
//
// 對應資料表：bookings、booking_items（0002_bookings.sql）、
// customers、line_accounts（0001_init_core.sql）。
// 只提供客戶端查詢；不含 createBooking／cancelBooking／owner 函式。
//
// 狀態轉換（D1 → 現有 API）：
// - pending / confirmed / checked_in / completed →「已確認」
// - cancelled_by_customer →「已取消」＋ canceledBy「客人」
// - cancelled_by_store   →「已取消」＋ canceledBy「業主」
// - rescheduled / no_show 不屬於 active，也不出現在客戶查詢
//
// 時間規則：start_at／cancelled_at 以 UTC ISO 儲存；輸出 date／time／
// canceledAt 一律轉 Asia/Taipei；月／日查詢先把台北日界換算成 UTC 範圍
// 再比對 start_at，不假設 UTC 日期等於台北日期。

/** active＝可占用時段的狀態（completed 已結束、rescheduled/no_show 不算） */
var BOOKING_ACTIVE_STATUSES = "('pending', 'confirmed', 'checked_in')";

/** 客戶查詢會出現的全部狀態（排除 rescheduled／no_show） */
var BOOKING_VISIBLE_STATUSES =
  "('pending', 'confirmed', 'checked_in', 'completed', " +
  "'cancelled_by_customer', 'cancelled_by_store')";

var BOOKING_STATUS_TO_API = {
  pending: "已確認",
  confirmed: "已確認",
  checked_in: "已確認",
  completed: "已確認",
  cancelled_by_customer: "已取消",
  cancelled_by_store: "已取消"
};

var BOOKING_CANCELED_BY = {
  cancelled_by_customer: "客人",
  cancelled_by_store: "業主"
};

/** 台北日期（YYYY-MM-DD）00:00 → UTC ISO 字串（Asia/Taipei 固定 +08:00） */
function taipeiDateToUtcIso(dateStr) {
  var parsed = new Date(dateStr + "T00:00:00+08:00");
  if (isNaN(parsed.getTime())) {
    throw makeError("date 格式錯誤，請使用 YYYY-MM-DD", 400);
  }
  return parsed.toISOString();
}

function utcIsoToTaipeiDate(isoString) {
  if (!isoString) return "";
  var parsed = new Date(isoString);
  if (isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(parsed);
}

function utcIsoToTaipeiTime(isoString) {
  if (!isoString) return "";
  var parsed = new Date(isoString);
  if (isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

/** 與 notion.js 的 parseMonthParam 相同的驗證與台北月份範圍 */
function parseBookingMonthParam(month) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw makeError("month 格式錯誤，請使用 YYYY-MM", 400);
  }
  var parts = String(month).split("-");
  var year = Number(parts[0]);
  var monthNum = Number(parts[1]);
  if (monthNum < 1 || monthNum > 12) {
    throw makeError("month 格式錯誤，請使用 YYYY-MM", 400);
  }
  var start = month + "-01";
  var lastDay = new Date(year, monthNum, 0).getDate();
  var end = month + "-" + String(lastDay).padStart(2, "0");
  var nextMonthFirst = monthNum === 12
    ? (year + 1) + "-01-01"
    : year + "-" + String(monthNum + 1).padStart(2, "0") + "-01";
  return { month: month, start: start, end: end, nextMonthFirst: nextMonthFirst };
}

function validateBookingDateParam(date) {
  var value = String(date || "");
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw makeError("date 格式錯誤，請使用 YYYY-MM-DD", 400);
  }

  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);

  // round-trip 驗證：Date 對 2026-02-30 這類輸入會自動進位成 03-02，
  // 反查年月日不一致即表示原始日期不存在
  var parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw makeError("date 格式錯誤，請使用 YYYY-MM-DD", 400);
  }

  return value;
}

/**
 * 共用 SELECT：bookings JOIN customers／line_accounts，
 * 服務資訊取 booking_items 中 sort_order 最前的一筆（單服務 DTO 相容）。
 */
var BOOKING_SELECT_SQL =
  "SELECT b.id, b.booking_no, b.start_at, b.status, " +
  "b.cancellation_reason_code, b.cancellation_note, b.cancelled_at, b.created_at, " +
  "c.display_name, c.mobile, c.birthday, " +
  "la.line_user_id, " +
  "bi.service_id, bi.service_name_snapshot " +
  "FROM bookings b " +
  "JOIN customers c ON c.tenant_id = b.tenant_id AND c.id = b.customer_id " +
  "LEFT JOIN line_accounts la ON la.tenant_id = b.tenant_id AND la.customer_id = b.customer_id " +
  "LEFT JOIN booking_items bi ON bi.id = (" +
  "SELECT bi2.id FROM booking_items bi2 " +
  "WHERE bi2.tenant_id = b.tenant_id AND bi2.booking_id = b.id " +
  "ORDER BY bi2.sort_order ASC, bi2.created_at ASC LIMIT 1" +
  ") ";

function bookingRowToDto(row) {
  return {
    id: row.id,
    title: row.booking_no || "",
    userId: row.line_user_id || "",
    customerName: row.display_name || "",
    phone: row.mobile || "",
    birthday: row.birthday || "",
    serviceId: row.service_id || "",
    serviceName: row.service_name_snapshot || "",
    date: utcIsoToTaipeiDate(row.start_at),
    time: utcIsoToTaipeiTime(row.start_at),
    status: BOOKING_STATUS_TO_API[row.status] || "已取消",
    cancelReason: row.cancellation_note || row.cancellation_reason_code || "",
    canceledBy: BOOKING_CANCELED_BY[row.status] || "",
    canceledAt: utcIsoToTaipeiDate(row.cancelled_at),
    createdAt: row.created_at || ""
  };
}

export async function getActiveBookingsForMonth(env, month) {
  ensureD1Env(env);
  var range = parseBookingMonthParam(month);
  var startUtc = taipeiDateToUtcIso(range.start);
  var endUtc = taipeiDateToUtcIso(range.nextMonthFirst);

  var result = await env.DB.prepare(
    BOOKING_SELECT_SQL +
    "WHERE b.tenant_id = ?1 AND b.status IN " + BOOKING_ACTIVE_STATUSES + " " +
    "AND b.start_at >= ?2 AND b.start_at < ?3 " +
    "ORDER BY b.start_at ASC"
  ).bind(env.TENANT_ID, startUtc, endUtc).all();

  return {
    range: { month: range.month, start: range.start, end: range.end },
    bookings: (result.results || []).map(bookingRowToDto)
  };
}

export async function getActiveBookingsByDate(env, date) {
  ensureD1Env(env);
  var day = validateBookingDateParam(date);
  var startUtc = taipeiDateToUtcIso(day);
  var endUtc = new Date(new Date(startUtc).getTime() + 24 * 60 * 60 * 1000).toISOString();

  var result = await env.DB.prepare(
    BOOKING_SELECT_SQL +
    "WHERE b.tenant_id = ?1 AND b.status IN " + BOOKING_ACTIVE_STATUSES + " " +
    "AND b.start_at >= ?2 AND b.start_at < ?3 " +
    "ORDER BY b.start_at ASC"
  ).bind(env.TENANT_ID, startUtc, endUtc).all();

  return (result.results || []).map(bookingRowToDto);
}

export async function getActiveBookingsByUser(env, userId) {
  ensureD1Env(env);
  if (!userId) {
    throw makeError("缺少 userId", 400);
  }

  var result = await env.DB.prepare(
    BOOKING_SELECT_SQL +
    "WHERE b.tenant_id = ?1 AND la.line_user_id = ?2 " +
    "AND b.status IN " + BOOKING_ACTIVE_STATUSES + " " +
    "ORDER BY b.start_at ASC"
  ).bind(env.TENANT_ID, String(userId)).all();

  return (result.results || []).map(bookingRowToDto);
}

/**
 * 我的預約：已確認（含 completed）在前、已取消在後，
 * 各組依預約時間新到舊排序（與現有 API 的日期遞減一致）。
 */
export async function getUserBookings(env, userId) {
  ensureD1Env(env);
  if (!userId) {
    throw makeError("缺少 userId", 400);
  }

  var result = await env.DB.prepare(
    BOOKING_SELECT_SQL +
    "WHERE b.tenant_id = ?1 AND la.line_user_id = ?2 " +
    "AND b.status IN " + BOOKING_VISIBLE_STATUSES + " " +
    "ORDER BY CASE WHEN b.status IN " + BOOKING_ACTIVE_STATUSES + " OR b.status = 'completed' " +
    "THEN 0 ELSE 1 END ASC, b.start_at DESC"
  ).bind(env.TENANT_ID, String(userId)).all();

  return (result.results || []).map(bookingRowToDto);
}
