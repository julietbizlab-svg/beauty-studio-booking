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
 * | 服務ID     | 文字   | Notion page ID     |
 * | 服務名稱   | 文字   |                    |
 * | 預約日期   | 日期   |                    |
 * | 預約時段   | 文字   | 例：14:00          |
 * | 狀態       | 選項   | 已確認、已取消     |
 *
 * ── 店面設定資料庫（NOTION_DATABASE_SETTINGS）──
 * 僅需一筆資料（第一筆為預設）
 * | 欄位     | 類型   | 說明           |
 * | 設定名稱 | Title  | 例：預設         |
 * | 品牌名稱 | 文字   |                |
 * | 主色     | 文字   | 例：#E8B4B8     |
 * | 公告文字 | 文字   |                |
 * | 取消規則 | 文字   |                |
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

function parseBookingPage(page) {
  var p = page.properties;
  return {
    id: page.id,
    title: getTitle(p),
    userId: getRichText(p, "LINE userId"),
    customerName: getRichText(p, "客人姓名"),
    serviceId: getRichText(p, "服務ID"),
    serviceName: getRichText(p, "服務名稱"),
    date: getDateStart(p, "預約日期"),
    time: getRichText(p, "預約時段"),
    status: getSelect(p, "狀態") || "已確認"
  };
}

function parseSettingsPage(page) {
  var p = page.properties;
  return {
    id: page.id,
    brandName: getRichText(p, "品牌名稱") || "美業工作室",
    primaryColor: getRichText(p, "主色") || "#E8B4B8",
    announcement: getRichText(p, "公告文字"),
    cancelPolicy: getRichText(p, "取消規則")
  };
}

function defaultSettings() {
  return {
    id: "",
    brandName: "美業工作室",
    primaryColor: "#E8B4B8",
    announcement: "",
    cancelPolicy: "預約日前 24 小時可免費取消。"
  };
}

export async function getSettings(env) {
  var pages = await queryDatabase(env, env.NOTION_DATABASE_SETTINGS);
  if (!pages.length) {
    return defaultSettings();
  }
  return parseSettingsPage(pages[0]);
}

export async function updateSettings(env, patch) {
  var pages = await queryDatabase(env, env.NOTION_DATABASE_SETTINGS);
  var pageId = pages.length ? pages[0].id : null;

  var properties = {};
  if (patch.brandName !== undefined) {
    properties["品牌名稱"] = { rich_text: [{ text: { content: String(patch.brandName) } }] };
  }
  if (patch.primaryColor !== undefined) {
    properties["主色"] = { rich_text: [{ text: { content: String(patch.primaryColor) } }] };
  }
  if (patch.announcement !== undefined) {
    properties["公告文字"] = { rich_text: [{ text: { content: String(patch.announcement) } }] };
  }
  if (patch.cancelPolicy !== undefined) {
    properties["取消規則"] = { rich_text: [{ text: { content: String(patch.cancelPolicy) } }] };
  }

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

function bookingTitle(customerName, serviceName, date, time) {
  return [customerName || "客人", serviceName, date, time].filter(Boolean).join("｜");
}

export async function createBooking(env, payload) {
  var userId = payload.userId;
  var displayName = payload.displayName || "客人";
  var serviceId = payload.serviceId;
  var date = payload.date;
  var time = payload.time;

  if (!userId) throw makeError("缺少 LINE userId");
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

  var page = await notionFetch("/pages", env.NOTION_TOKEN, {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: env.NOTION_DATABASE_BOOKINGS },
      properties: {
        "預約編號": { title: [{ text: { content: bookingTitle(displayName, service.name, date, time) } }] },
        "LINE userId": { rich_text: [{ text: { content: userId } }] },
        "客人姓名": { rich_text: [{ text: { content: displayName } }] },
        "服務ID": { rich_text: [{ text: { content: serviceId } }] },
        "服務名稱": { rich_text: [{ text: { content: service.name } }] },
        "預約日期": { date: { start: date } },
        "預約時段": { rich_text: [{ text: { content: time } }] },
        "狀態": { select: { name: "已確認" } }
      }
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
      properties: {
        "狀態": { select: { name: "已取消" } }
      }
    })
  });

  return {
    ok: true,
    message: "已取消預約",
    bookingId: bookingId
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
    serviceName: booking.serviceName,
    date: booking.date,
    time: booking.time,
    status: booking.status
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
