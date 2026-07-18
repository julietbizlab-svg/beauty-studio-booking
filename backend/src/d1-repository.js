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
