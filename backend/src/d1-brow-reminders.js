var BROW_SERVICE = /霧眉|紋眉|飄眉|粉霧眉|紋繡/;
var LIP_SERVICE = /霧唇|紋唇|唇色|唇部定妝|唇部調色/;
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

function addDays(iso, days) {
  return new Date(Date.parse(iso) + days * 24 * 60 * 60 * 1000).toISOString();
}

function addMonths(iso, months) {
  var date = new Date(iso);
  var day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  var lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

export function appendServiceToBookingUrl(value, serviceId) {
  var text = String(value || "").trim();
  if (!text || !/^https:\/\//i.test(text)) return "";
  try {
    var url = new URL(text);
    url.searchParams.set("serviceId", String(serviceId || ""));
    return url.toString();
  } catch (_error) {
    return "";
  }
}

function dateToTaipeiReminderIso(value) {
  var text = String(value || "").trim();
  if (!DATE_RE.test(text) ||
      new Date(text + "T00:00:00.000Z").toISOString().slice(0, 10) !== text) {
    throw makeError("提醒日期格式錯誤");
  }
  return new Date(Date.parse(text + "T10:00:00.000+08:00")).toISOString();
}

function serviceKind(serviceName) {
  var name = String(serviceName || "");
  if (LIP_SERVICE.test(name)) return "lip";
  if (BROW_SERVICE.test(name)) return "brow";
  return "";
}

function standardFollowUpDays(serviceName, configuredDays) {
  var name = String(serviceName || "");
  // 合做項目先判斷手部，確保「手＋足」固定採較早的 21 天提醒。
  if (/手部|手指|手足|手腳/.test(name) && /美甲|凝膠|指甲/.test(name)) return 21;
  if (/足部|腳部|足趾|腳趾/.test(name) && /美甲|凝膠|指甲/.test(name)) return 42;
  if (/美睫|睫毛|嫁接|翹睫/.test(name)) return 21;
  return Number(configuredDays);
}

function reminderRows(kind, base) {
  if (kind === "lip") return [
    {
      code: "lip_touchup_28d",
      at: addDays(base, 28),
      content: "距離您上次霧唇即將滿 1 個月，可聯絡工作室預約補色服務。實際安排與補色方案請以老師確認為準。"
    },
    {
      code: "lip_paid_maintenance_11m",
      at: addMonths(base, 11),
      content: "距離您上次霧唇即將滿 1 年，請拍攝目前唇部清楚照片回傳給老師。老師本人檢視後，會評估是否需要回店進行維持補色保養。此項服務為另外計費，價格與安排請以工作室確認為準。"
    }
  ];
  return [
    {
      code: "brow_complimentary_touchup_28d",
      at: addDays(base, 28),
      content: "距離您上次霧眉即將滿 1 個月，您有一次工作室贈送的補色服務，歡迎聯絡工作室安排時間。實際是否適合補色仍由老師確認。"
    },
    {
      code: "brow_paid_maintenance_11m",
      at: addMonths(base, 11),
      content: "距離您上次霧眉即將滿 1 年，請拍攝目前眉部清楚照片回傳給老師。老師本人檢視後，會評估是否需要回店進行維持補色保養。此項服務為另外計費，價格與安排請以工作室確認為準。"
    }
  ];
}

async function findBooking(env, bookingId) {
  var booking = await env.DB.prepare(
    "SELECT b.id, b.customer_id, b.start_at, " +
    "(SELECT bi.service_id FROM booking_items bi WHERE bi.tenant_id=b.tenant_id " +
    "AND bi.booking_id=b.id ORDER BY bi.sort_order LIMIT 1) AS service_id, " +
    "(SELECT s.settings_json FROM booking_items bi JOIN services s " +
    "ON s.tenant_id=bi.tenant_id AND s.id=bi.service_id WHERE bi.tenant_id=b.tenant_id " +
    "AND bi.booking_id=b.id ORDER BY bi.sort_order LIMIT 1) AS service_settings_json, " +
    "(SELECT GROUP_CONCAT(bi.service_name_snapshot, '、') FROM booking_items bi " +
    "WHERE bi.tenant_id=b.tenant_id AND bi.booking_id=b.id) AS service_name " +
    "FROM bookings b " +
    "WHERE b.tenant_id=?1 AND b.id=?2"
  ).bind(env.TENANT_ID, String(bookingId)).first();
  if (!booking) throw makeError("找不到預約", 404);
  return booking;
}

async function customerBookingUrl(env, serviceId) {
  var row = await env.DB.prepare(
    "SELECT setting_value FROM tenant_settings WHERE tenant_id=?1 " +
    "AND setting_key='customer_booking_url' LIMIT 1"
  ).bind(env.TENANT_ID).first();
  return appendServiceToBookingUrl(row && row.setting_value, serviceId);
}

async function getPlanCode(env) {
  try {
    var row = await env.DB.prepare(
      "SELECT COALESCE(plan_code,'standard') AS plan_code FROM tenant_features WHERE tenant_id=?1"
    ).bind(env.TENANT_ID).first();
    return row && row.plan_code === "flagship" ? "flagship" : "standard";
  } catch (_error) {
    // Older local/test databases may predate tenant_features. Preserve their
    // original standard-plan behavior instead of breaking completed bookings.
    return "standard";
  }
}

export async function schedulePigmentFollowUpReminders(env, bookingId, completedAt) {
  var booking = await findBooking(env, bookingId);
  var kind = serviceKind(booking.service_name);
  if (!kind) {
    var planCode = await getPlanCode(env);
    if (planCode !== "standard") return { ok: true, scheduled: false };
    var serviceSettings = {};
    try { serviceSettings = JSON.parse(booking.service_settings_json || "{}"); } catch (_error) {}
    var configuredDays = serviceSettings.followUpDays == null
      ? 21 : Number(serviceSettings.followUpDays);
    var followUpDays = standardFollowUpDays(booking.service_name, configuredDays);
    if (!Number.isInteger(followUpDays) || followUpDays <= 0 || followUpDays > 365) {
      return { ok: true, scheduled: false, reason: "follow_up_disabled" };
    }
    var standardBase = new Date(booking.start_at || completedAt || new Date().toISOString()).toISOString();
    var standardAt = addDays(standardBase, followUpDays);
    var serviceLabel = String(booking.service_name || "本次服務").trim() || "本次服務";
    var bookingUrl = await customerBookingUrl(env, booking.service_id);
    var content = "距離您上次「" + serviceLabel + "」服務已滿 " + followUpDays +
      " 天，若需要持續保養，可直接再次預約相同服務。";
    if (bookingUrl) content += "\n再次預約：" + bookingUrl;
    await env.DB.prepare(
      "INSERT OR IGNORE INTO notifications " +
      "(id,tenant_id,customer_id,booking_id,channel,template_code,content_snapshot,status,scheduled_at,created_at) " +
      "VALUES (?1,?2,?3,?4,'line','standard_care_follow_up_21d',?5,'queued',?6,?7)"
    ).bind(crypto.randomUUID(), env.TENANT_ID, booking.customer_id, booking.id,
      content,
      standardAt, standardBase).run();
    return { ok: true, scheduled: true, serviceKind: "standard",
      followUpDays: followUpDays, followUpAt: standardAt, hasBookingUrl: Boolean(bookingUrl) };
  }
  var base = new Date(booking.start_at || completedAt || new Date().toISOString()).toISOString();
  var rows = reminderRows(kind, base);
  var statements = rows.map(function (row) {
    return env.DB.prepare(
      "INSERT OR IGNORE INTO notifications " +
      "(id,tenant_id,customer_id,booking_id,channel,template_code,content_snapshot,status,scheduled_at,created_at) " +
      "VALUES (?1,?2,?3,?4,'line',?5,?6,'queued',?7,?8)"
    ).bind(crypto.randomUUID(), env.TENANT_ID, booking.customer_id, booking.id,
      row.code, row.content, row.at, base);
  });
  await env.DB.batch(statements);
  return { ok: true, scheduled: true, serviceKind: kind,
    touchupAt: rows[0].at, complimentaryAt: rows[0].at, maintenanceAt: rows[1].at };
}

export async function scheduleBrowFollowUpReminders(env, bookingId, completedAt) {
  return schedulePigmentFollowUpReminders(env, bookingId, completedAt);
}

export async function updatePigmentFollowUpReminderDates(env, bookingId, input) {
  var allowed = ["touchupOn", "complimentaryOn", "maintenanceOn"];
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(function (key) { return allowed.indexOf(key) === -1; })) {
    throw makeError("提醒設定格式錯誤");
  }
  var booking = await findBooking(env, bookingId);
  var kind = serviceKind(booking.service_name);
  if (!kind) throw makeError("只有霧眉或霧唇服務可設定補色提醒", 400);
  var touchupField = input.touchupOn !== undefined ? "touchupOn" : "complimentaryOn";
  var mapping = kind === "lip" ? [
    [touchupField, "lip_touchup_28d"], ["maintenanceOn", "lip_paid_maintenance_11m"]
  ] : [
    [touchupField, "brow_complimentary_touchup_28d"], ["maintenanceOn", "brow_paid_maintenance_11m"]
  ];
  var statements = [];
  mapping.forEach(function (entry) {
    if (input[entry[0]] === undefined) return;
    statements.push(env.DB.prepare(
      "UPDATE notifications SET scheduled_at=?1, status='queued', sent_at=NULL " +
      "WHERE tenant_id=?2 AND booking_id=?3 AND template_code=?4 AND status IN ('queued','cancelled')"
    ).bind(dateToTaipeiReminderIso(input[entry[0]]), env.TENANT_ID,
      String(bookingId), entry[1]));
  });
  if (!statements.length) throw makeError("請設定提醒日期");
  await env.DB.batch(statements);
  return { ok: true };
}

export async function updateBrowFollowUpReminderDates(env, bookingId, input) {
  return updatePigmentFollowUpReminderDates(env, bookingId, input);
}
