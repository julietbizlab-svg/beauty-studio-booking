/**
 * Notion 資料層 — 美業一人工作室預約系統
 *
 * ── 服務項目資料庫（NOTION_DATABASE_SERVICES）──
 * | 欄位     | 類型   | 說明           |
 * | 服務名稱 | Title  |                |
 * | 時長     | 數字   | 分鐘           |
 * | 價格     | 數字   | 顯示用，可選   |
 * | 說明     | 文字   |                |
 * | 狀態     | 選項   | 上架、下架     |
 * | 排序     | 數字   | 越小越前面     |
 *
 * ── 營業時段資料庫（NOTION_DATABASE_SLOTS）──
 * | 欄位     | 類型   | 說明                     |
 * | 名稱     | Title  | 例：週一上午               |
 * | 星期     | 選項   | 日、一、二、三、四、五、六 |
 * | 開始時間 | 文字   | 例：10:00                  |
 * | 結束時間 | 文字   | 例：18:00                  |
 * | 狀態     | 選項   | 開放、關閉                 |
 *
 * ── 預約紀錄資料庫（NOTION_DATABASE_BOOKINGS）──
 * | 欄位       | 類型   | 說明               |
 * | 預約編號   | Title  | 自動產生           |
 * | LINE userId| 文字   |                    |
 * | 客人姓名   | 文字   |                    |
 * | 客人電話   | 文字   | 預約當下留下（可選補欄）|
 * | 客人生日   | 日期   | 可選               |
 * | 服務ID     | 文字   | Notion page ID     |
 * | 服務名稱   | 文字   |                    |
 * | 預約日期   | 日期   |                    |
 * | 預約時段   | 文字   | 例：14:00          |
 * | 狀態       | 選項   | 已確認、已取消     |
 * | 取消原因   | 文字   | rich_text（可選）  |
 * | 取消者     | 選項   | 客人、業主（可選） |
 * | 取消時間   | 日期   | date（可選）       |
 *
 * ── 客人資料庫（NOTION_DATABASE_CUSTOMERS，建議）──
 * | 欄位         | 類型     | 說明                 |
 * | 客人名稱     | Title    | 真實姓名             |
 * | LINE userId  | 文字     | 以 userId upsert     |
 * | 電話         | 文字     |                      |
 * | 生日         | 日期     | 可選                 |
 * | LINE 暱稱    | 文字     |                      |
 * | 備註         | 文字     |                      |
 * （建立／最後更新時間由 Notion 內建即可）
 *
 * ── 店面設定資料庫（NOTION_DATABASE_SETTINGS）──
 * 僅需一筆資料（第一筆為預設）
 * | 欄位         | 類型     | 說明                 |
 * | 設定名稱     | Title    | 例：預設             |
 * | 品牌名稱     | 文字     |                      |
 * | 主色         | 文字     | 例：#E8B4B8          |
 * | 公告文字     | 文字     |                      |
 * | 取消規則     | 文字     |                      |
 * | 是否收訂金   | Checkbox | 關閉則客人不顯示     |
 * | 訂金金額     | 數字     | 例：500               |
 * | 銀行名稱     | 文字     |                      |
 * | 銀行代碼     | 文字     |                      |
 * | 帳號         | 文字     | 匯款帳號（非 secret）|
 * | 戶名         | 文字     |                      |
 * | 轉帳提醒文字 | 文字     |                      |
 */

import {
  buildBusyIntervalsFromBookings,
  candidateOverlapsBusy,
  CONSERVATIVE_BUSY_DURATION_MINUTES
} from "./slots.js";

var NOTION_VERSION = "2022-06-28";

export function ensureNotionEnv(env) {
  if (!env.NOTION_TOKEN) {
    throw makeError("缺少 NOTION_TOKEN 設定", 500);
  }
  if (!env.NOTION_DATABASE_SERVICES || !env.NOTION_DATABASE_SLOTS ||
      !env.NOTION_DATABASE_BOOKINGS || !env.NOTION_DATABASE_SETTINGS) {
    throw makeError("缺少 Notion 資料庫 ID 設定", 500);
  }
}

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

export async function notionFetch(path, token, options) {
  var response = await fetch("https://api.notion.com/v1" + path, Object.assign({
    headers: {
      "Authorization": "Bearer " + token,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    }
  }, options || {}));

  var body = null;
  try {
    body = await response.json();
  } catch (ignore) {
    body = null;
  }

  if (!response.ok) {
    var msg = (body && body.message) ? body.message : "Notion API 錯誤（" + response.status + "）";
    throw makeError(msg, response.status >= 500 ? 502 : 400);
  }

  return body;
}

async function queryDatabase(env, databaseId, filter, sorts) {
  var results = [];
  var cursor = null;

  do {
    var payload = { page_size: 100 };
    if (filter) payload.filter = filter;
    if (sorts) payload.sorts = sorts;
    if (cursor) payload.start_cursor = cursor;

    var body = await notionFetch("/databases/" + databaseId + "/query", env.NOTION_TOKEN, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    results = results.concat(body.results || []);
    cursor = body.has_more ? body.next_cursor : null;
  } while (cursor);

  return results;
}

function getTitle(props) {
  var key = Object.keys(props).find(function (k) { return props[k].type === "title"; });
  if (!key) return "";
  return (props[key].title || []).map(function (t) { return t.plain_text; }).join("");
}

function getRichText(props, name) {
  var field = props[name];
  if (!field || field.type !== "rich_text") return "";
  return (field.rich_text || []).map(function (t) { return t.plain_text; }).join("");
}

function getNumber(props, name) {
  var field = props[name];
  if (!field || field.type !== "number" || field.number === null) return 0;
  return field.number;
}

function getNumberOrNull(props, name) {
  var field = props[name];
  if (!field || field.type !== "number" || field.number === null || field.number === undefined) {
    return null;
  }
  return field.number;
}

function getDepositEnabled(props) {
  var field = props["是否收訂金"];
  if (!field) {
    return false;
  }
  if (field.type === "checkbox") {
    return Boolean(field.checkbox);
  }
  if (field.type === "select" && field.select) {
    var name = field.select.name || "";
    return name === "是" || name === "true" || name === "開啟";
  }
  return false;
}

function getSelect(props, name) {
  var field = props[name];
  if (!field || field.type !== "select" || !field.select) return "";
  return field.select.name || "";
}

function getDateStart(props, name) {
  var field = props[name];
  if (!field || field.type !== "date" || !field.date) return "";
  return field.date.start || "";
}

function parseServicePage(page) {
  var p = page.properties;
  return {
    id: page.id,
    name: getTitle(p),
    durationMinutes: getNumber(p, "時長") || 60,
    price: getNumber(p, "價格"),
    description: getRichText(p, "說明"),
    status: getSelect(p, "狀態") || "上架",
    sortOrder: getNumber(p, "排序")
  };
}

function parseSlotPage(page) {
  var p = page.properties;
  return {
    id: page.id,
    name: getTitle(p),
    weekday: getSelect(p, "星期"),
    startTime: getRichText(p, "開始時間"),
    endTime: getRichText(p, "結束時間"),
    status: getSelect(p, "狀態") || "開放"
  };
}

function getPhone(props, name) {
  var field = props[name];
  if (!field) return "";
  if (field.type === "phone_number") {
    return field.phone_number || "";
  }
  if (field.type === "rich_text") {
    return (field.rich_text || []).map(function (t) { return t.plain_text; }).join("");
  }
  return "";
}

function parseBookingPage(page) {
  var p = page.properties;
  return {
    id: page.id,
    title: getTitle(p),
    userId: getRichText(p, "LINE userId"),
    customerName: getRichText(p, "客人姓名"),
    phone: getPhone(p, "客人電話") || getPhone(p, "電話"),
    birthday: getDateStart(p, "客人生日") || getDateStart(p, "生日"),
    serviceId: getRichText(p, "服務ID"),
    serviceName: getRichText(p, "服務名稱"),
    date: getDateStart(p, "預約日期"),
    time: getRichText(p, "預約時段"),
    status: getSelect(p, "狀態") || "已確認",
    cancelReason: getRichText(p, "取消原因"),
    canceledBy: getSelect(p, "取消者"),
    canceledAt: getDateStart(p, "取消時間")
  };
}

function getTaipeiCancelDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function buildCancelProperties(canceledBy, cancelReason) {
  var properties = {
    "狀態": { select: { name: "已取消" } }
  };
  if (canceledBy) {
    properties["取消者"] = { select: { name: canceledBy } };
  }
  if (cancelReason) {
    properties["取消原因"] = {
      rich_text: [{ text: { content: String(cancelReason).slice(0, 2000) } }]
    };
  }
  properties["取消時間"] = { date: { start: getTaipeiCancelDateString() } };
  return properties;
}

function parseSettingsPage(page) {
  var p = page.properties;
  return {
    id: page.id,
    brandName: getRichText(p, "品牌名稱") || "美業工作室",
    primaryColor: getRichText(p, "主色") || "#E8B4B8",
    announcement: getRichText(p, "公告文字"),
    cancelPolicy: getRichText(p, "取消規則"),
    depositEnabled: getDepositEnabled(p),
    depositAmount: getNumberOrNull(p, "訂金金額"),
    bankName: getRichText(p, "銀行名稱"),
    bankCode: getRichText(p, "銀行代碼"),
    bankAccount: getRichText(p, "帳號"),
    bankAccountName: getRichText(p, "戶名"),
    depositNote: getRichText(p, "轉帳提醒文字")
  };
}

function defaultSettings() {
  return {
    id: "",
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

/** settings 訂金相關欄位（缺欄時自動補 schema，不改既有列內容） */
var SETTINGS_DEPOSIT_PROPERTY_SCHEMA = {
  "是否收訂金": { checkbox: {} },
  "訂金金額": { number: {} },
  "銀行名稱": { rich_text: {} },
  "銀行代碼": { rich_text: {} },
  "帳號": { rich_text: {} },
  "戶名": { rich_text: {} },
  "轉帳提醒文字": { rich_text: {} }
};

function richTextProperty(value) {
  return {
    rich_text: [{ text: { content: String(value == null ? "" : value).slice(0, 2000) } }]
  };
}

function buildDepositEnabledProperty(propertyType, enabled) {
  if (propertyType === "select") {
    return { select: { name: enabled ? "是" : "否" } };
  }
  return { checkbox: Boolean(enabled) };
}

function humanizeSettingsNotionError(message) {
  var msg = String(message || "");
  if (/轉帳提醒文字/i.test(msg) && /not a property|does not exist|找不到|is not/i.test(msg)) {
    return "Notion「店面設定」缺少「轉帳提醒文字」欄位（文字／rich_text），請新增後再儲存。";
  }
  if (/是否收訂金|訂金金額|銀行名稱|銀行代碼|帳號|戶名/.test(msg) &&
      /not a property|does not exist|找不到|is not/i.test(msg)) {
    return "Notion「店面設定」訂金欄位不完整或名稱不符，請依手冊補齊後再儲存。";
  }
  if (/validation|invalid.*(number|checkbox|rich_text)|type mismatch/i.test(msg)) {
    return "訂金設定欄位格式不符 Notion 類型，請確認「是否收訂金」為勾選、「訂金金額」為數字、其餘為文字。";
  }
  return msg;
}

async function ensureSettingsDepositProperties(env) {
  var databaseId = env.NOTION_DATABASE_SETTINGS;
  var db = await notionFetch("/databases/" + databaseId, env.NOTION_TOKEN);
  var existing = db.properties || {};
  var toAdd = {};

  Object.keys(SETTINGS_DEPOSIT_PROPERTY_SCHEMA).forEach(function (name) {
    if (!existing[name]) {
      toAdd[name] = SETTINGS_DEPOSIT_PROPERTY_SCHEMA[name];
    }
  });

  if (!Object.keys(toAdd).length) {
    return existing;
  }

  var updated = await notionFetch("/databases/" + databaseId, env.NOTION_TOKEN, {
    method: "PATCH",
    body: JSON.stringify({ properties: toAdd })
  });
  return updated.properties || existing;
}

export async function getSettings(env) {
  var pages = await queryDatabase(env, env.NOTION_DATABASE_SETTINGS);
  if (!pages.length) {
    return defaultSettings();
  }
  return parseSettingsPage(pages[0]);
}

export async function updateSettings(env, patch) {
  var dbProperties = await ensureSettingsDepositProperties(env);
  var pages = await queryDatabase(env, env.NOTION_DATABASE_SETTINGS);
  var pageId = pages.length ? pages[0].id : null;

  var properties = {};
  if (patch.brandName !== undefined) {
    properties["品牌名稱"] = richTextProperty(patch.brandName);
  }
  if (patch.primaryColor !== undefined) {
    properties["主色"] = richTextProperty(patch.primaryColor);
  }
  if (patch.announcement !== undefined) {
    properties["公告文字"] = richTextProperty(patch.announcement);
  }
  if (patch.cancelPolicy !== undefined) {
    properties["取消規則"] = richTextProperty(patch.cancelPolicy);
  }
  if (patch.depositEnabled !== undefined) {
    var depositField = dbProperties["是否收訂金"];
    var depositType = depositField && depositField.type ? depositField.type : "checkbox";
    properties["是否收訂金"] = buildDepositEnabledProperty(depositType, patch.depositEnabled);
  }
  if (patch.depositAmount !== undefined) {
    var amount = patch.depositAmount;
    properties["訂金金額"] = {
      number: amount === null || amount === "" ? null : Number(amount)
    };
  }
  if (patch.bankName !== undefined) {
    properties["銀行名稱"] = richTextProperty(patch.bankName);
  }
  if (patch.bankCode !== undefined) {
    properties["銀行代碼"] = richTextProperty(patch.bankCode);
  }
  if (patch.bankAccount !== undefined) {
    properties["帳號"] = richTextProperty(patch.bankAccount);
  }
  if (patch.bankAccountName !== undefined) {
    properties["戶名"] = richTextProperty(patch.bankAccountName);
  }
  if (patch.depositNote !== undefined) {
    properties["轉帳提醒文字"] = richTextProperty(patch.depositNote);
  }

  // 開啟訂金時：帳號、戶名必填；金額須 > 0（僅驗證有送出的欄位）
  if (patch.depositEnabled === true) {
    var account = patch.bankAccount != null ? String(patch.bankAccount).trim() : "";
    var accountName = patch.bankAccountName != null ? String(patch.bankAccountName).trim() : "";
    var depositAmount = patch.depositAmount != null && patch.depositAmount !== ""
      ? Number(patch.depositAmount)
      : NaN;
    if (!account || !accountName) {
      throw makeError("開啟訂金時請填寫帳號與戶名", 400);
    }
    if (!(depositAmount > 0)) {
      throw makeError("開啟訂金時訂金金額須大於 0", 400);
    }
  }

  try {
    if (!pageId) {
      var created = await notionFetch("/pages", env.NOTION_TOKEN, {
        method: "POST",
        body: JSON.stringify({
          parent: { database_id: env.NOTION_DATABASE_SETTINGS },
          properties: Object.assign({
            "設定名稱": { title: [{ text: { content: "預設" } }] }
          }, properties)
        })
      });
      return parseSettingsPage(created);
    }

    var updated = await notionFetch("/pages/" + pageId, env.NOTION_TOKEN, {
      method: "PATCH",
      body: JSON.stringify({ properties: properties })
    });
    return parseSettingsPage(updated);
  } catch (error) {
    throw makeError(humanizeSettingsNotionError(error.message), error.status || 400);
  }
}

export async function listServices(env, activeOnly) {
  var pages = await queryDatabase(env, env.NOTION_DATABASE_SERVICES, null, [
    { property: "排序", direction: "ascending" }
  ]);

  var services = pages.map(parseServicePage);
  if (activeOnly) {
    services = services.filter(function (s) { return s.status === "上架"; });
  }
  return services;
}

export async function getServiceById(env, serviceId) {
  var page = await notionFetch("/pages/" + serviceId, env.NOTION_TOKEN);
  return parseServicePage(page);
}

/**
 * 依預約上的服務 ID 查時長對照表；查不到則略過（呼叫端用保守時長）。
 * 不變更 Notion schema。
 */
export async function getServiceDurationMap(env, serviceIds) {
  var map = {};
  var seen = {};
  var ids = serviceIds || [];

  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    if (!id || seen[id]) {
      continue;
    }
    seen[id] = true;
    try {
      var service = await getServiceById(env, id);
      var duration = Number(service.durationMinutes) || 0;
      if (duration > 0) {
        map[id] = duration;
      }
    } catch (ignore) {
      // 服務已刪或無法讀取：不寫入 map，由 resolveBusyDurationMinutes 保守處理
    }
  }

  return map;
}

export async function createService(env, data) {
  if (!data.name) {
    throw makeError("請填寫服務名稱");
  }

  var page = await notionFetch("/pages", env.NOTION_TOKEN, {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: env.NOTION_DATABASE_SERVICES },
      properties: {
        "服務名稱": { title: [{ text: { content: data.name } }] },
        "時長": { number: Number(data.durationMinutes) || 60 },
        "價格": { number: data.price != null ? Number(data.price) : null },
        "說明": { rich_text: [{ text: { content: data.description || "" } }] },
        "狀態": { select: { name: data.status || "上架" } },
        "排序": { number: Number(data.sortOrder) || 0 }
      }
    })
  });

  return parseServicePage(page);
}

export async function updateService(env, serviceId, data) {
  var properties = {};

  if (data.name !== undefined) {
    properties["服務名稱"] = { title: [{ text: { content: String(data.name) } }] };
  }
  if (data.durationMinutes !== undefined) {
    properties["時長"] = { number: Number(data.durationMinutes) || 60 };
  }
  if (data.price !== undefined) {
    properties["價格"] = { number: data.price === null ? null : Number(data.price) };
  }
  if (data.description !== undefined) {
    properties["說明"] = { rich_text: [{ text: { content: String(data.description) } }] };
  }
  if (data.status !== undefined) {
    properties["狀態"] = { select: { name: data.status } };
  }
  if (data.sortOrder !== undefined) {
    properties["排序"] = { number: Number(data.sortOrder) || 0 };
  }

  var page = await notionFetch("/pages/" + serviceId, env.NOTION_TOKEN, {
    method: "PATCH",
    body: JSON.stringify({ properties: properties })
  });

  return parseServicePage(page);
}

export async function listWeeklySlots(env) {
  var pages = await queryDatabase(env, env.NOTION_DATABASE_SLOTS);
  return pages
    .map(parseSlotPage)
    .filter(function (s) { return s.status === "開放"; });
}

export async function replaceWeeklySlots(env, slots) {
  var existing = await queryDatabase(env, env.NOTION_DATABASE_SLOTS);

  for (var i = 0; i < existing.length; i++) {
    await notionFetch("/pages/" + existing[i].id, env.NOTION_TOKEN, {
      method: "PATCH",
      body: JSON.stringify({ archived: true })
    });
  }

  var created = [];
  for (var j = 0; j < (slots || []).length; j++) {
    var slot = slots[j];
    if (!slot.weekday || !slot.startTime || !slot.endTime) {
      continue;
    }
    var page = await notionFetch("/pages", env.NOTION_TOKEN, {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: env.NOTION_DATABASE_SLOTS },
        properties: {
          "名稱": { title: [{ text: { content: "週" + slot.weekday + " " + slot.startTime + "~" + slot.endTime } }] },
          "星期": { select: { name: slot.weekday } },
          "開始時間": { rich_text: [{ text: { content: slot.startTime } }] },
          "結束時間": { rich_text: [{ text: { content: slot.endTime } }] },
          "狀態": { select: { name: slot.status || "開放" } }
        }
      })
    });
    created.push(parseSlotPage(page));
  }

  return created;
}

export async function getActiveBookingsForMonth(env, month) {
  var range = parseMonthParam(month);
  var pages = await queryDatabase(env, env.NOTION_DATABASE_BOOKINGS, {
    and: [
      { property: "預約日期", date: { on_or_after: range.start } },
      { property: "預約日期", date: { on_or_before: range.end } },
      { property: "狀態", select: { equals: "已確認" } }
    ]
  });
  return {
    range: range,
    bookings: pages.map(parseBookingPage)
  };
}

export async function getActiveBookingsByDate(env, date) {
  var pages = await queryDatabase(env, env.NOTION_DATABASE_BOOKINGS, {
    and: [
      { property: "預約日期", date: { equals: date } },
      { property: "狀態", select: { equals: "已確認" } }
    ]
  });
  return pages.map(parseBookingPage);
}

export async function getActiveBookingsByUser(env, userId) {
  var pages = await queryDatabase(env, env.NOTION_DATABASE_BOOKINGS, {
    and: [
      { property: "LINE userId", rich_text: { equals: userId } },
      { property: "狀態", select: { equals: "已確認" } }
    ]
  }, [
    { property: "預約日期", direction: "ascending" }
  ]);
  return pages.map(parseBookingPage);
}

export async function getUserBookings(env, userId) {
  var pages = await queryDatabase(env, env.NOTION_DATABASE_BOOKINGS, {
    property: "LINE userId",
    rich_text: { equals: userId }
  }, [
    { property: "預約日期", direction: "descending" }
  ]);
  return pages.map(parseBookingPage);
}

var BOOKING_CUSTOMER_PROPERTY_SCHEMA = {
  "客人電話": { rich_text: {} },
  "客人生日": { date: {} }
};

var CUSTOMERS_PROPERTY_SCHEMA = {
  "LINE userId": { rich_text: {} },
  "電話": { rich_text: {} },
  "生日": { date: {} },
  "LINE 暱稱": { rich_text: {} },
  "備註": { rich_text: {} }
};

async function ensureDatabaseProperties(env, databaseId, schema) {
  if (!databaseId) return {};
  var db = await notionFetch("/databases/" + databaseId, env.NOTION_TOKEN);
  var existing = db.properties || {};
  var toAdd = {};
  Object.keys(schema).forEach(function (name) {
    if (!existing[name]) {
      toAdd[name] = schema[name];
    }
  });
  if (!Object.keys(toAdd).length) {
    return existing;
  }
  var updated = await notionFetch("/databases/" + databaseId, env.NOTION_TOKEN, {
    method: "PATCH",
    body: JSON.stringify({ properties: toAdd })
  });
  return updated.properties || existing;
}

function normalizePhoneInput(phone) {
  return String(phone || "").trim().replace(/\s+/g, "");
}

function isValidPhoneInput(phone) {
  var cleaned = normalizePhoneInput(phone).replace(/-/g, "");
  return /^\+?\d{8,15}$/.test(cleaned);
}

function isValidBirthdayInput(birthday) {
  if (!birthday) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(birthday));
}

function parseCustomerPage(page) {
  var p = page.properties;
  return {
    id: page.id,
    name: getTitle(p) || "",
    userId: getRichText(p, "LINE userId"),
    phone: getPhone(p, "電話"),
    birthday: getDateStart(p, "生日"),
    lineNickname: getRichText(p, "LINE 暱稱"),
    note: getRichText(p, "備註")
  };
}

/**
 * 依 LINE userId 建立或更新客人資料（需設定 NOTION_DATABASE_CUSTOMERS）
 */
export async function upsertCustomer(env, payload) {
  var databaseId = env.NOTION_DATABASE_CUSTOMERS;
  if (!databaseId) {
    return null;
  }

  var userId = String(payload.userId || "").trim();
  var name = String(payload.name || "").trim();
  var phone = normalizePhoneInput(payload.phone);
  var birthday = payload.birthday ? String(payload.birthday).trim() : "";
  var lineNickname = String(payload.lineNickname || "").trim();

  if (!userId || !name || !phone) {
    throw makeError("客人姓名與電話為必填", 400);
  }

  await ensureDatabaseProperties(env, databaseId, CUSTOMERS_PROPERTY_SCHEMA);

  var db = await notionFetch("/databases/" + databaseId, env.NOTION_TOKEN);
  var dbProps = db.properties || {};
  var titleName = Object.keys(dbProps).find(function (key) {
    return dbProps[key] && dbProps[key].type === "title";
  }) || "客人名稱";

  var properties = {};
  properties[titleName] = { title: [{ text: { content: name.slice(0, 100) } }] };
  properties["LINE userId"] = richTextProperty(userId);
  properties["電話"] = richTextProperty(phone);
  if (birthday) {
    properties["生日"] = { date: { start: birthday } };
  }
  if (lineNickname) {
    properties["LINE 暱稱"] = richTextProperty(lineNickname);
  }

  var existing = await queryDatabase(env, databaseId, {
    property: "LINE userId",
    rich_text: { equals: userId }
  });

  if (existing.length) {
    var updated = await notionFetch("/pages/" + existing[0].id, env.NOTION_TOKEN, {
      method: "PATCH",
      body: JSON.stringify({ properties: properties })
    });
    return parseCustomerPage(updated);
  }

  var created = await notionFetch("/pages", env.NOTION_TOKEN, {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: properties
    })
  });
  return parseCustomerPage(created);
}

function bookingTitle(customerName, serviceName, date, time) {
  return [customerName || "客人", serviceName, date, time].filter(Boolean).join("｜");
}

export async function createBooking(env, payload) {
  var userId = payload.userId;
  var lineNickname = payload.displayName || payload.lineNickname || "";
  var customerName = String(payload.customerName || payload.name || "").trim();
  var phone = normalizePhoneInput(payload.phone);
  var birthday = payload.birthday ? String(payload.birthday).trim() : "";
  var serviceId = payload.serviceId;
  var date = payload.date;
  var time = payload.time;

  if (!userId) throw makeError("缺少 LINE userId");
  if (!customerName) throw makeError("請填寫姓名", 400);
  if (!phone) throw makeError("請填寫電話", 400);
  if (!isValidPhoneInput(phone)) throw makeError("電話格式不正確", 400);
  if (!isValidBirthdayInput(birthday)) throw makeError("生日格式請使用 YYYY-MM-DD", 400);
  if (!serviceId) throw makeError("請選擇服務項目");
  if (!date) throw makeError("請選擇預約日期");
  if (!time) throw makeError("請選擇預約時段");

  var service = await getServiceById(env, serviceId);
  if (service.status !== "上架") {
    throw makeError("此服務目前未開放預約");
  }

  var dateBookings = await getActiveBookingsByDate(env, date);

  var userSameDay = dateBookings.some(function (b) { return b.userId === userId; });
  if (userSameDay) {
    throw makeError("同一天僅能預約一個時段");
  }

  var durationMap = await getServiceDurationMap(
    env,
    dateBookings.map(function (b) { return b.serviceId; })
  );
  var fallbackBusy = Math.max(
    Number(service.durationMinutes) || 60,
    CONSERVATIVE_BUSY_DURATION_MINUTES
  );
  var busyIntervals = buildBusyIntervalsFromBookings(
    dateBookings,
    durationMap,
    fallbackBusy
  );

  if (candidateOverlapsBusy(time, service.durationMinutes, busyIntervals)) {
    throw makeError("此時段與現有預約重疊，請選擇其他時間");
  }

  try {
    await upsertCustomer(env, {
      userId: userId,
      name: customerName,
      phone: phone,
      birthday: birthday,
      lineNickname: lineNickname
    });
  } catch (ignore) {
    // customers 未設定或寫入失敗時，仍以 booking 保存姓名／電話
  }

  await ensureDatabaseProperties(env, env.NOTION_DATABASE_BOOKINGS, BOOKING_CUSTOMER_PROPERTY_SCHEMA);

  var bookingProperties = {
    "預約編號": { title: [{ text: { content: bookingTitle(customerName, service.name, date, time) } }] },
    "LINE userId": richTextProperty(userId),
    "客人姓名": richTextProperty(customerName),
    "客人電話": richTextProperty(phone),
    "服務ID": richTextProperty(serviceId),
    "服務名稱": richTextProperty(service.name),
    "預約日期": { date: { start: date } },
    "預約時段": richTextProperty(time),
    "狀態": { select: { name: "已確認" } }
  };
  if (birthday) {
    bookingProperties["客人生日"] = { date: { start: birthday } };
  }

  var page = await notionFetch("/pages", env.NOTION_TOKEN, {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: env.NOTION_DATABASE_BOOKINGS },
      properties: bookingProperties
    })
  });

  return {
    ok: true,
    message: "預約成功",
    booking: parseBookingPage(page)
  };
}

export async function cancelBooking(env, userId, bookingId) {
  if (!userId) throw makeError("缺少 LINE userId");
  if (!bookingId) throw makeError("缺少預約編號");

  var page = await notionFetch("/pages/" + bookingId, env.NOTION_TOKEN);
  var booking = parseBookingPage(page);

  if (booking.userId !== userId) {
    throw makeError("無法取消他人的預約", 403);
  }
  if (booking.status === "已取消") {
    throw makeError("此預約已取消");
  }

  await notionFetch("/pages/" + bookingId, env.NOTION_TOKEN, {
    method: "PATCH",
    body: JSON.stringify({
      properties: buildCancelProperties("客人", "客人自行取消")
    })
  });

  return {
    ok: true,
    message: "已取消預約",
    bookingId: bookingId
  };
}

/**
 * 業主取消客戶預約（須先經 requireOwnerFromRequest）
 */
export async function cancelBookingByOwner(env, bookingId, cancelReason) {
  if (!bookingId) throw makeError("缺少預約編號");
  var reason = String(cancelReason || "").trim();
  if (!reason) {
    throw makeError("請填寫取消原因", 400);
  }

  var page = await notionFetch("/pages/" + bookingId, env.NOTION_TOKEN);
  var booking = parseBookingPage(page);

  if (booking.status === "已取消") {
    throw makeError("此預約已取消");
  }

  await notionFetch("/pages/" + bookingId, env.NOTION_TOKEN, {
    method: "PATCH",
    body: JSON.stringify({
      properties: buildCancelProperties("業主", reason)
    })
  });

  return {
    ok: true,
    message: "已取消預約",
    bookingId: bookingId,
    cancelReason: reason,
    canceledBy: "業主"
  };
}

export async function getTodayBookingsForOwner(env, date) {
  var pages = await queryDatabase(env, env.NOTION_DATABASE_BOOKINGS, {
    property: "預約日期",
    date: { equals: date }
  });

  return pages
    .map(parseBookingPage)
    .filter(function (b) {
      return b.status === "已確認" || b.status === "已取消";
    })
    .sort(function (a, b) {
      return a.time.localeCompare(b.time);
    });
}

export function parseMonthParam(month) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw makeError("month 格式錯誤，請使用 YYYY-MM", 400);
  }
  var parts = month.split("-");
  var year = Number(parts[0]);
  var monthNum = Number(parts[1]);
  if (monthNum < 1 || monthNum > 12) {
    throw makeError("month 格式錯誤，請使用 YYYY-MM", 400);
  }
  var start = month + "-01";
  var lastDay = new Date(year, monthNum, 0).getDate();
  var end = month + "-" + String(lastDay).padStart(2, "0");
  return { month: month, start: start, end: end };
}

function bookingToOwnerDto(booking) {
  return {
    id: booking.id,
    customerName: booking.customerName,
    phone: booking.phone || "",
    birthday: booking.birthday || "",
    serviceName: booking.serviceName,
    date: booking.date,
    time: booking.time,
    status: booking.status,
    cancelReason: booking.cancelReason || "",
    canceledBy: booking.canceledBy || "",
    canceledAt: booking.canceledAt || ""
  };
}

function bookingDateTimeKey(booking) {
  return String(booking.date || "") + "T" + String(booking.time || "00:00");
}

function compareBookingNewestFirst(a, b) {
  var aKey = bookingDateTimeKey(a);
  var bKey = bookingDateTimeKey(b);
  if (aKey > bKey) return -1;
  if (aKey < bKey) return 1;
  return 0;
}

function sortBookingsConfirmedFirst(bookings) {
  return (bookings || []).slice().sort(function (a, b) {
    var aRank = a.status === "已確認" ? 0 : (a.status === "已取消" ? 1 : 2);
    var bRank = b.status === "已確認" ? 0 : (b.status === "已取消" ? 1 : 2);
    if (aRank !== bRank) return aRank - bRank;
    return compareBookingNewestFirst(a, b);
  });
}

async function listAllOwnerRelevantBookings(env) {
  var pages = await queryDatabase(env, env.NOTION_DATABASE_BOOKINGS);
  return pages
    .map(parseBookingPage)
    .filter(function (b) {
      return b.status === "已確認" || b.status === "已取消";
    });
}

function pickLatestNonEmpty(list, field) {
  for (var i = 0; i < list.length; i++) {
    var value = list[i][field];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

/**
 * 從 bookings 彙總業主客戶名單（不以 customers 表為必要）
 */
export async function getOwnerCustomersFromBookings(env, queryText) {
  var q = String(queryText || "").trim().toLowerCase();
  var bookings = await listAllOwnerRelevantBookings(env);
  var byUser = {};

  bookings.forEach(function (b) {
    var userId = String(b.userId || "").trim();
    if (!userId) return;
    if (!byUser[userId]) byUser[userId] = [];
    byUser[userId].push(b);
  });

  var customers = Object.keys(byUser).map(function (userId) {
    var list = byUser[userId].slice().sort(compareBookingNewestFirst);
    var last = list[0] || {};
    return {
      userId: userId,
      customerName: pickLatestNonEmpty(list, "customerName") || last.customerName || "客人",
      phone: pickLatestNonEmpty(list, "phone"),
      birthday: pickLatestNonEmpty(list, "birthday"),
      lastBookingDate: last.date || "",
      bookingCount: list.length
    };
  });

  if (q) {
    customers = customers.filter(function (c) {
      var name = String(c.customerName || "").toLowerCase();
      var phone = String(c.phone || "").toLowerCase();
      return name.indexOf(q) !== -1 || phone.indexOf(q) !== -1;
    });
  }

  customers.sort(function (a, b) {
    if (a.lastBookingDate > b.lastBookingDate) return -1;
    if (a.lastBookingDate < b.lastBookingDate) return 1;
    return String(a.customerName || "").localeCompare(String(b.customerName || ""), "zh-Hant");
  });

  return {
    ok: true,
    customers: customers
  };
}

/**
 * 依 LINE userId 取得該客戶歷史預約（已確認在上、已取消在下）
 */
export async function getOwnerCustomerBookings(env, userId) {
  var id = String(userId || "").trim();
  if (!id) {
    throw makeError("缺少 userId", 400);
  }

  var bookings = (await listAllOwnerRelevantBookings(env)).filter(function (b) {
    return String(b.userId || "").trim() === id;
  });

  if (!bookings.length) {
    return {
      ok: true,
      userId: id,
      customerName: "",
      phone: "",
      birthday: "",
      bookings: []
    };
  }

  var newest = bookings.slice().sort(compareBookingNewestFirst);
  var sorted = sortBookingsConfirmedFirst(bookings);

  return {
    ok: true,
    userId: id,
    customerName: pickLatestNonEmpty(newest, "customerName") || "客人",
    phone: pickLatestNonEmpty(newest, "phone"),
    birthday: pickLatestNonEmpty(newest, "birthday"),
    bookings: sorted.map(bookingToOwnerDto)
  };
}

export async function getOwnerBookingsForMonth(env, month) {
  var range = parseMonthParam(month);
  var pages = await queryDatabase(env, env.NOTION_DATABASE_BOOKINGS, {
    and: [
      { property: "預約日期", date: { on_or_after: range.start } },
      { property: "預約日期", date: { on_or_before: range.end } }
    ]
  });

  var bookings = pages
    .map(parseBookingPage)
    .filter(function (b) {
      return b.status === "已確認" || b.status === "已取消";
    });

  var days = {};
  bookings.forEach(function (b) {
    if (!b.date) {
      return;
    }
    if (!days[b.date]) {
      days[b.date] = {
        confirmedCount: 0,
        canceledCount: 0,
        bookings: []
      };
    }
    if (b.status === "已確認") {
      days[b.date].confirmedCount += 1;
    } else if (b.status === "已取消") {
      days[b.date].canceledCount += 1;
    }
    days[b.date].bookings.push(bookingToOwnerDto(b));
  });

  Object.keys(days).forEach(function (dateKey) {
    days[dateKey].bookings.sort(function (a, b) {
      return a.time.localeCompare(b.time);
    });
  });

  return {
    ok: true,
    month: range.month,
    days: days
  };
}
