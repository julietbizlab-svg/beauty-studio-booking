import { lineMessagingTokenForTenant } from "./line-channel-routing.js";

var TEMPLATE_MESSAGES = {
  review_photo_requested: "服務人員需要您補充評估資料或照片，請開啟預約頁查看需求。",
  review_answers_requested: "服務人員需要您補充評估問題，請開啟「我的預約」查看並回覆。",
  deposit_payment_requested: "工作室已受理您的預約申請。請於 24 小時內完成訂金匯款，逾時系統將自動釋放時段。",
  deposit_expired: "您的預約申請因超過 24 小時未確認訂金已自動取消，時段已釋放。"
};

var DEFAULT_TOMORROW_REMINDER_TIME = "12:20";
var DEFAULT_TOMORROW_REMINDER_MESSAGE =
  "明天見！請在約定時間前 5 分鐘到場，讓我們可以從容為您準備。";

function formatTaipeiDeadline(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatTaipeiAppointment(value) {
  if (!value) return null;
  var parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));
  var values = {};
  parts.forEach(function (part) {
    if (part.type !== "literal") values[part.type] = part.value;
  });
  if (!values.year || !values.month || !values.day ||
      !values.hour || !values.minute) return null;
  return {
    date: values.year + "/" + values.month + "/" + values.day,
    weekday: values.weekday || "",
    time: values.hour + ":" + values.minute
  };
}

function tomorrowTaipeiUtcRange(value) {
  var scheduledAt = new Date(value == null ? Date.now() : value);
  if (Number.isNaN(scheduledAt.getTime())) scheduledAt = new Date();
  var taipei = new Date(scheduledAt.getTime() + 8 * 60 * 60 * 1000);
  var year = taipei.getUTCFullYear();
  var month = taipei.getUTCMonth();
  var day = taipei.getUTCDate();
  return {
    start: new Date(Date.UTC(year, month, day + 1) - 8 * 60 * 60 * 1000).toISOString(),
    end: new Date(Date.UTC(year, month, day + 2) - 8 * 60 * 60 * 1000).toISOString()
  };
}

function taipeiHourMinute(value) {
  var scheduledAt = new Date(value == null ? Date.now() : value);
  if (Number.isNaN(scheduledAt.getTime())) return "";
  var taipei = new Date(scheduledAt.getTime() + 8 * 60 * 60 * 1000);
  return String(taipei.getUTCHours()).padStart(2, "0") + ":" +
    String(taipei.getUTCMinutes()).padStart(2, "0");
}

function buildTomorrowBookingReminder(row) {
  var appointment = formatTaipeiAppointment(row && row.start_at);
  if (!appointment) return "";
  return [
    row.service_name ? "服務項目：" + row.service_name : "",
    "預約日期：" + appointment.date +
      (appointment.weekday ? "（" + appointment.weekday + "）" : ""),
    "預約時間：" + appointment.time,
    String(row.reminder_message || "").trim() || DEFAULT_TOMORROW_REMINDER_MESSAGE
  ].filter(Boolean).join("\n");
}

async function buildBookingConfirmedMessage(env, bookingId) {
  var booking = await env.DB.prepare(
    "SELECT b.start_at, " +
    "COALESCE((SELECT setting_value FROM tenant_settings " +
    "WHERE tenant_id = b.tenant_id AND setting_key = 'deposit_amount'), '') " +
    "AS deposit_amount, " +
    "COALESCE((SELECT group_concat(bi.service_name_snapshot, '、') " +
    "FROM booking_items bi WHERE bi.tenant_id = b.tenant_id " +
    "AND bi.booking_id = b.id ORDER BY bi.sort_order), '') AS service_name " +
    "FROM bookings b WHERE b.tenant_id = ?1 AND b.id = ?2"
  ).bind(env.TENANT_ID, String(bookingId)).first();
  var appointment = formatTaipeiAppointment(booking && booking.start_at);
  if (!booking || !appointment) {
    throw makeError("找不到成立通知的預約時間", 404);
  }
  return [
    "工作室已確認收到訂金" +
      (booking.deposit_amount ? "：NT$ " + booking.deposit_amount : "") + "。",
    "您的預約已正式成立，預約時段已為您保留。",
    booking.service_name ? "服務項目：" + booking.service_name : "",
    "預約日期：" + appointment.date +
      (appointment.weekday ? "（" + appointment.weekday + "）" : ""),
    "預約時間：" + appointment.time,
    "請依上述日期與時間前往工作室。"
  ].filter(Boolean).join("\n");
}

async function buildBookingRescheduledMessage(env, bookingId) {
  var booking = await env.DB.prepare(
    "SELECT b.start_at, p.start_at AS original_start_at, " +
    "COALESCE((SELECT group_concat(bi.service_name_snapshot, '、') " +
    "FROM booking_items bi WHERE bi.tenant_id=b.tenant_id AND bi.booking_id=b.id " +
    "ORDER BY bi.sort_order), '') AS service_name " +
    "FROM bookings b LEFT JOIN bookings p ON p.tenant_id=b.tenant_id " +
    "AND p.id=b.parent_booking_id WHERE b.tenant_id=?1 AND b.id=?2"
  ).bind(env.TENANT_ID, String(bookingId)).first();
  var current = formatTaipeiAppointment(booking && booking.start_at);
  var original = formatTaipeiAppointment(booking && booking.original_start_at);
  if (!booking || !current || !original) throw makeError("找不到改期通知的預約時間", 404);
  return [
    "工作室已為您完成預約改期。",
    booking.service_name ? "服務項目：" + booking.service_name : "",
    "原預約日期：" + original.date + (original.weekday ? "（" + original.weekday + "）" : ""),
    "原預約時間：" + original.time,
    "新預約日期：" + current.date + (current.weekday ? "（" + current.weekday + "）" : ""),
    "新預約時間：" + current.time,
    "請依新的日期與時間前往工作室。"
  ].filter(Boolean).join("\n");
}

async function buildDepositPaymentMessage(env, bookingId) {
  var booking = await env.DB.prepare(
    "SELECT deposit_due_at FROM bookings WHERE tenant_id = ?1 AND id = ?2"
  ).bind(env.TENANT_ID, String(bookingId)).first();
  var settingsResult = await env.DB.prepare(
    "SELECT setting_key, setting_value FROM tenant_settings " +
    "WHERE tenant_id = ?1 AND setting_key IN " +
    "('deposit_amount', 'bank_name', 'bank_code', 'bank_account', " +
    "'bank_account_name', 'deposit_notice')"
  ).bind(env.TENANT_ID).all();
  var settings = {};
  (settingsResult.results || []).forEach(function (row) {
    settings[row.setting_key] = String(row.setting_value || "").trim();
  });

  var lines = [
    "工作室已受理您的預約申請，24 小時訂金期限已開始。",
    settings.deposit_amount ? "訂金金額：NT$ " + settings.deposit_amount : "",
    settings.bank_name
      ? "銀行：" + settings.bank_name + (settings.bank_code ? "（" + settings.bank_code + "）" : "")
      : (settings.bank_code ? "銀行代碼：" + settings.bank_code : ""),
    settings.bank_account ? "轉帳帳號：" + settings.bank_account : "",
    settings.bank_account_name ? "戶名：" + settings.bank_account_name : "",
    booking && booking.deposit_due_at
      ? "付款期限：" + formatTaipeiDeadline(booking.deposit_due_at) + "（台北時間）"
      : "請於 24 小時內完成訂金匯款。",
    settings.deposit_notice || "",
    "匯款後請通知工作室核對；確認訂金後預約才正式成立。逾時系統將自動釋放時段。"
  ];
  return lines.filter(Boolean).join("\n");
}

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 500;
  return error;
}

function lineHttpCategory(status) {
  if (status === 400) return "invalid_request";
  if (status === 401) return "authentication_failed";
  if (status === 403) return "forbidden";
  if (status === 404) return "endpoint_not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "rejected";
}

function safeLineRequestId(value) {
  var requestId = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(requestId) ? requestId : "";
}

function safeLineDetailFields(body) {
  if (!body || !Array.isArray(body.details)) return [];
  var fields = [];
  body.details.slice(0, 5).forEach(function (detail) {
    var property = detail && String(detail.property || "").trim();
    if (!property || !/^[A-Za-z0-9_.\[\]-]{1,80}$/.test(property)) return;
    if (fields.indexOf(property) === -1) fields.push(property);
  });
  return fields;
}

async function buildLineHttpFailure(response) {
  var status = Number(response && response.status) || 0;
  var category = lineHttpCategory(status);
  var requestId = safeLineRequestId(
    response && response.headers && response.headers.get("x-line-request-id")
  );
  var body = null;
  try {
    body = await response.json();
  } catch (ignore) {
    body = null;
  }
  var fields = safeLineDetailFields(body);
  var parts = [category, "details=" + fields.length];
  if (fields.length) parts.push("fields=" + fields.join(","));
  if (requestId) parts.push("request_id=" + requestId);
  return {
    code: "line_http_" + status + "_" + category,
    message: "LINE API HTTP " + status + " (" + parts.join("; ") + ")"
  };
}

export async function enqueueBookingNotification(env, bookingId, templateCode) {
  var content = TEMPLATE_MESSAGES[templateCode];
  if (!content && templateCode !== "booking_confirmed" && templateCode !== "booking_rescheduled") {
    throw makeError("未知通知類型", 400);
  }
  if (templateCode === "deposit_payment_requested") {
    content = await buildDepositPaymentMessage(env, bookingId);
  }
  if (templateCode === "booking_confirmed") {
    content = await buildBookingConfirmedMessage(env, bookingId);
  }
  if (templateCode === "booking_rescheduled") {
    content = await buildBookingRescheduledMessage(env, bookingId);
  }
  var now = new Date().toISOString();
  var deduplicateAfter = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  var notificationId = crypto.randomUUID();
  var inserted = await env.DB.prepare(
    "INSERT INTO notifications " +
    "(id, tenant_id, customer_id, booking_id, channel, template_code, " +
    "content_snapshot, status, scheduled_at, created_at) " +
    "SELECT ?1, b.tenant_id, b.customer_id, b.id, 'line', ?4, ?5, 'queued', ?6, ?6 " +
    "FROM bookings b WHERE b.tenant_id = ?2 AND b.id = ?3 " +
    "AND NOT EXISTS (SELECT 1 FROM notifications recent " +
    "WHERE recent.tenant_id = b.tenant_id AND recent.booking_id = b.id " +
    "AND recent.channel = 'line' AND (recent.template_code = ?4 OR recent.content_snapshot = ?5) " +
    "AND recent.created_at >= ?7)"
  ).bind(
    notificationId, env.TENANT_ID, String(bookingId), templateCode, content, now,
    deduplicateAfter
  ).run();
  if (inserted && inserted.meta && inserted.meta.changes === 0) {
    var recent = await env.DB.prepare(
      "SELECT id,status FROM notifications WHERE tenant_id = ?1 AND booking_id = ?2 " +
      "AND channel = 'line' AND template_code = ?3 AND created_at >= ?4 " +
      "ORDER BY created_at DESC LIMIT 1"
    ).bind(env.TENANT_ID, String(bookingId), templateCode, deduplicateAfter).first();
    if (recent) {
      return {
        ok: true,
        queued: recent.status !== "sent",
        sent: recent.status === "sent",
        deduplicated: true,
        notificationId: recent.id,
        templateCode: templateCode
      };
    }
    throw makeError("找不到通知預約", 404);
  }
  return {
    ok: true,
    queued: true,
    deduplicated: false,
    notificationId: notificationId,
    templateCode: templateCode
  };
}

export async function enqueueBookingCreatedNotifications(env, bookingId) {
  var booking = await env.DB.prepare(
    "SELECT b.id,b.status,b.start_at,c.display_name AS customer_name," +
    "la.line_user_id AS customer_line_user_id," +
    "COALESCE((SELECT group_concat(bi.service_name_snapshot, '、') " +
    "FROM booking_items bi WHERE bi.tenant_id=b.tenant_id AND bi.booking_id=b.id " +
    "ORDER BY bi.sort_order),'預約服務') AS service_name " +
    "FROM bookings b JOIN customers c ON c.tenant_id=b.tenant_id AND c.id=b.customer_id " +
    "LEFT JOIN line_accounts la ON la.tenant_id=b.tenant_id AND la.customer_id=b.customer_id " +
    "WHERE b.tenant_id=?1 AND b.id=?2 LIMIT 1"
  ).bind(env.TENANT_ID, String(bookingId || "")).first();
  if (!booking) throw makeError("找不到新預約通知資料", 404);

  var owner = await env.DB.prepare(
    "SELECT sla.line_user_id FROM bookings b " +
    "JOIN staff s ON s.tenant_id=b.tenant_id " +
    "JOIN staff_line_accounts sla ON sla.tenant_id=s.tenant_id AND sla.staff_id=s.id " +
    "WHERE b.tenant_id=?1 AND b.id=?2 AND s.status='active' " +
    "AND s.role IN ('owner','manager') AND sla.status='active' " +
    "ORDER BY CASE s.role WHEN 'owner' THEN 0 ELSE 1 END LIMIT 1"
  ).bind(env.TENANT_ID, String(bookingId || "")).first();
  var appointment = formatTaipeiAppointment(booking.start_at);
  if (!appointment) throw makeError("找不到新預約通知時間", 404);
  var now = new Date().toISOString();
  var notificationIds = [];

  async function insertNotification(templateCode, recipient, content) {
    if (!recipient) return;
    var notificationId = crypto.randomUUID();
    var inserted = await env.DB.prepare(
      "INSERT INTO notifications (id,tenant_id,booking_id,channel,template_code,recipient," +
      "content_snapshot,status,scheduled_at,created_at) " +
      "SELECT ?1,?2,?3,'line',?4,?5,?6,'queued',?7,?7 " +
      "WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE tenant_id=?2 " +
      "AND booking_id=?3 AND channel='line' AND template_code=?4)"
    ).bind(notificationId, env.TENANT_ID, String(bookingId), templateCode,
      recipient, content, now).run();
    if (inserted && inserted.meta && Number(inserted.meta.changes) === 1) {
      notificationIds.push(notificationId);
    }
  }

  if (booking.status === "pending_review") {
    await insertNotification("booking_request_received", booking.customer_line_user_id, [
      "您的預約申請已送出。",
      "服務項目：" + booking.service_name,
      "預約日期：" + appointment.date +
        (appointment.weekday ? "（" + appointment.weekday + "）" : ""),
      "預約時間：" + appointment.time,
      "工作室確認後會再通知您；送出申請不代表預約已正式成立。"
    ].join("\n"));
  }

  await insertNotification("owner_booking_created", owner && owner.line_user_id, [
    "有新的預約申請，請盡快查看。",
    "客戶：" + String(booking.customer_name || "客戶"),
    "服務項目：" + booking.service_name,
    "預約日期：" + appointment.date +
      (appointment.weekday ? "（" + appointment.weekday + "）" : ""),
    "預約時間：" + appointment.time,
    "請從業主端確認並處理。"
  ].join("\n"));

  return {
    ok: true,
    queuedCount: notificationIds.length,
    notificationIds: notificationIds,
    ownerLineBound: Boolean(owner && owner.line_user_id)
  };
}

export async function enqueueBookingCancelledNotifications(env, bookingId) {
  var booking = await env.DB.prepare(
    "SELECT b.id,b.status,b.start_at,b.cancellation_note,c.display_name AS customer_name," +
    "la.line_user_id AS customer_line_user_id," +
    "COALESCE((SELECT group_concat(bi.service_name_snapshot, '、') " +
    "FROM booking_items bi WHERE bi.tenant_id=b.tenant_id AND bi.booking_id=b.id " +
    "ORDER BY bi.sort_order),'預約服務') AS service_name " +
    "FROM bookings b JOIN customers c ON c.tenant_id=b.tenant_id AND c.id=b.customer_id " +
    "LEFT JOIN line_accounts la ON la.tenant_id=b.tenant_id AND la.customer_id=b.customer_id " +
    "WHERE b.tenant_id=?1 AND b.id=?2 " +
    "AND b.status IN ('cancelled_by_customer','cancelled_by_store') LIMIT 1"
  ).bind(env.TENANT_ID, String(bookingId || "")).first();
  if (!booking) throw makeError("找不到取消通知資料", 404);
  var owner = await env.DB.prepare(
    "SELECT sla.line_user_id FROM staff s " +
    "JOIN staff_line_accounts sla ON sla.tenant_id=s.tenant_id AND sla.staff_id=s.id " +
    "WHERE s.tenant_id=?1 AND s.status='active' AND s.role IN ('owner','manager') " +
    "AND sla.status='active' ORDER BY CASE s.role WHEN 'owner' THEN 0 ELSE 1 END LIMIT 1"
  ).bind(env.TENANT_ID).first();
  var appointment = formatTaipeiAppointment(booking.start_at);
  if (!appointment) throw makeError("找不到取消通知時間", 404);
  var cancelledByCustomer = booking.status === "cancelled_by_customer";
  var reason = String(booking.cancellation_note || "").trim();
  var now = new Date().toISOString();
  var notificationIds = [];

  async function insertNotification(templateCode, recipient, content) {
    if (!recipient) return;
    var notificationId = crypto.randomUUID();
    var inserted = await env.DB.prepare(
      "INSERT INTO notifications (id,tenant_id,booking_id,channel,template_code,recipient," +
      "content_snapshot,status,scheduled_at,created_at) " +
      "SELECT ?1,?2,?3,'line',?4,?5,?6,'queued',?7,?7 " +
      "WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE tenant_id=?2 " +
      "AND booking_id=?3 AND channel='line' AND template_code=?4)"
    ).bind(notificationId, env.TENANT_ID, String(bookingId), templateCode,
      recipient, content, now).run();
    if (inserted && inserted.meta && Number(inserted.meta.changes) === 1) {
      notificationIds.push(notificationId);
    }
  }

  var bookingLines = [
    "服務項目：" + booking.service_name,
    "原預約日期：" + appointment.date +
      (appointment.weekday ? "（" + appointment.weekday + "）" : ""),
    "原預約時間：" + appointment.time
  ];
  await insertNotification(
    cancelledByCustomer ? "booking_cancelled_customer_ack" : "booking_cancelled_by_store",
    booking.customer_line_user_id,
    ([cancelledByCustomer
      ? "您的預約已取消，原時段已釋出。"
      : "工作室已取消您的預約，原時段已釋出。"])
      .concat(bookingLines)
      .concat(!cancelledByCustomer && reason ? ["取消原因：" + reason] : [])
      .join("\n")
  );
  await insertNotification(
    cancelledByCustomer ? "owner_booking_cancelled_by_customer" : "owner_booking_cancelled_ack",
    owner && owner.line_user_id,
    ([cancelledByCustomer
      ? "客戶已取消預約，原時段已釋出。"
      : "工作室已取消預約，原時段已釋出。",
    "客戶：" + String(booking.customer_name || "客戶")])
      .concat(bookingLines)
      .concat(reason ? ["取消原因：" + reason] : [])
      .join("\n")
  );
  return { ok: true, queuedCount: notificationIds.length, notificationIds: notificationIds };
}

export async function enqueueAssessmentReviewNotification(env, sessionId, reviewStatus, customerMessage) {
  var status = String(reviewStatus || "");
  var templateCode = ({
    approved: "assessment_approved",
    need_more_information: "assessment_more_information_requested",
    temporarily_unavailable: "assessment_booking_paused",
    contact_manually: "assessment_manual_contact"
  })[status];
  if (!templateCode) throw makeError("未知評估通知類型", 400);
  var row = await env.DB.prepare(
    "SELECT s.id,s.line_user_id,la.customer_id,t.name AS tenant_name,at.name AS template_name " +
    "FROM assessment_sessions s " +
    "JOIN tenants t ON t.id=s.tenant_id " +
    "JOIN assessment_templates at ON at.tenant_id=s.tenant_id AND at.id=s.template_id " +
    "LEFT JOIN line_accounts la ON la.tenant_id=s.tenant_id AND la.line_user_id=s.line_user_id " +
    "WHERE s.tenant_id=?1 AND s.id=?2 LIMIT 1"
  ).bind(env.TENANT_ID, String(sessionId || "")).first();
  if (!row) throw makeError("找不到評估案件", 404);
  if (!row.customer_id || !row.line_user_id) {
    return { ok: true, queued: false, reason: "customer_line_not_bound" };
  }
  var studioName = String(row.tenant_name || "工作室");
  var assessmentName = String(row.template_name || "新客評估");
  var extra = String(customerMessage || "").trim();
  var content = ({
    approved: [
      studioName + "通知：您的「" + assessmentName + "」已通過人工審核。",
      "現在可以從工作室提供的專屬預約入口選擇服務、日期與時間。"
    ],
    need_more_information: [
      studioName + "通知：您的「" + assessmentName + "」需要補充資料或照片。",
      extra || "請重新開啟工作室專屬預約入口查看並補充資料。"
    ],
    temporarily_unavailable: [
      studioName + "通知：您的「" + assessmentName + "」目前暫不開放預約。",
      "如需進一步確認，請直接聯絡工作室。"
    ],
    contact_manually: [
      studioName + "通知：您的「" + assessmentName + "」將改由工作室人工聯絡。",
      "請留意工作室後續訊息。"
    ]
  })[status].join("\n");
  var now = new Date().toISOString();
  var recentAfter = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  var notificationId = crypto.randomUUID();
  var subject = "assessment:" + String(sessionId || "");
  var inserted = await env.DB.prepare(
    "INSERT INTO notifications (id,tenant_id,customer_id,channel,template_code,recipient," +
    "subject,content_snapshot,status,scheduled_at,created_at) " +
    "SELECT ?1,?2,?3,'line',?4,?5,?6,?7,'queued',?8,?8 " +
    "WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE tenant_id=?2 AND customer_id=?3 " +
    "AND channel='line' AND template_code=?4 AND subject=?6 AND created_at>=?9)"
  ).bind(notificationId, env.TENANT_ID, row.customer_id, templateCode, row.line_user_id,
    subject, content, now, recentAfter).run();
  if (inserted && inserted.meta && Number(inserted.meta.changes) === 0) {
    return { ok: true, queued: false, deduplicated: true };
  }
  return { ok: true, queued: true, deduplicated: false,
    notificationId: notificationId, templateCode: templateCode };
}

function lineTokenForTenant(env, tenantId) {
  return lineMessagingTokenForTenant(env, tenantId);
}

export function hasLineNotificationRoute(env, tenantId) {
  return Boolean(lineTokenForTenant(env || {}, tenantId));
}

export async function enqueueTomorrowBookingRemindersForAllTenants(env, scheduledTime) {
  var currentTaipeiTime = taipeiHourMinute(scheduledTime);
  var range = tomorrowTaipeiUtcRange(scheduledTime);
  var result = await env.DB.prepare(
    "SELECT b.id AS booking_id,b.tenant_id,b.customer_id,b.start_at,la.line_user_id," +
    "COALESCE((SELECT group_concat(bi.service_name_snapshot, '、') FROM booking_items bi " +
    "WHERE bi.tenant_id=b.tenant_id AND bi.booking_id=b.id ORDER BY bi.sort_order),'') AS service_name," +
    "COALESCE(NULLIF((SELECT ts.setting_value FROM tenant_settings ts WHERE ts.tenant_id=b.tenant_id " +
    "AND ts.setting_key='tomorrow_booking_reminder_time' LIMIT 1),''),?3) AS reminder_time," +
    "COALESCE(NULLIF((SELECT ts.setting_value FROM tenant_settings ts WHERE ts.tenant_id=b.tenant_id " +
    "AND ts.setting_key='tomorrow_booking_reminder_message' LIMIT 1),''),?4) AS reminder_message " +
    "FROM bookings b JOIN line_accounts la " +
    "ON la.tenant_id=b.tenant_id AND la.customer_id=b.customer_id " +
    "WHERE b.status='confirmed' AND b.start_at>=?1 AND b.start_at<?2 " +
    "ORDER BY b.start_at,b.tenant_id,b.id"
  ).bind(range.start, range.end, DEFAULT_TOMORROW_REMINDER_TIME,
    DEFAULT_TOMORROW_REMINDER_MESSAGE).all();
  var rows = (result.results || []).filter(function (row) {
    return String(row.reminder_time || DEFAULT_TOMORROW_REMINDER_TIME) === currentTaipeiTime;
  });
  if (!rows.length) {
    return { ok: true, skipped: true, reason: "outside_tenant_reminder_time",
      eligibleCount: 0, insertedCount: 0, duplicateCount: 0 };
  }
  var insertedCount = 0;
  var duplicateCount = 0;
  var now = new Date(
    scheduledTime == null || Number.isNaN(new Date(scheduledTime).getTime())
      ? Date.now()
      : new Date(scheduledTime).getTime()
  ).toISOString();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var content = buildTomorrowBookingReminder(row);
    if (!content || !row.line_user_id || !lineTokenForTenant(env, row.tenant_id)) continue;
    var inserted = await env.DB.prepare(
      "INSERT OR IGNORE INTO notifications " +
      "(id,tenant_id,customer_id,booking_id,channel,template_code,recipient," +
      "content_snapshot,status,scheduled_at,created_at) " +
      "VALUES (?1,?2,?3,?4,'line','booking_tomorrow_reminder',?5,?6,'queued',?7,?7)"
    ).bind(
      "booking-tomorrow-reminder:" + String(row.booking_id),
      row.tenant_id,
      row.customer_id,
      row.booking_id,
      row.line_user_id,
      content,
      now
    ).run();
    if (inserted && inserted.meta && Number(inserted.meta.changes) === 1) {
      insertedCount += 1;
    } else {
      duplicateCount += 1;
    }
  }
  return {
    ok: true,
    startAt: range.start,
    endAt: range.end,
    eligibleCount: rows.length,
    insertedCount: insertedCount,
    duplicateCount: duplicateCount
  };
}

async function deliverLineRows(env, rows) {
  var sentCount = 0;
  var failedCount = 0;
  var skippedCount = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var claimNow = new Date();
    var leaseUntil = new Date(claimNow.getTime() + 2 * 60 * 1000).toISOString();
    var retryBefore = new Date(claimNow.getTime() - 5 * 60 * 1000).toISOString();
    var claimed = await env.DB.prepare(
      "UPDATE notifications SET status='queued',scheduled_at=?1," +
      "failed_at=NULL,error_code=NULL,error_message=NULL " +
      "WHERE tenant_id=?2 AND id=?3 AND channel='line' AND (" +
      "(status='queued' AND (scheduled_at IS NULL OR scheduled_at<=?4)) OR " +
      "(status='failed' AND failed_at<=?5))"
    ).bind(leaseUntil, row.tenant_id, row.id, claimNow.toISOString(), retryBefore).run();
    if (!claimed || !claimed.meta || Number(claimed.meta.changes) !== 1) {
      skippedCount += 1;
      continue;
    }
    var token = lineTokenForTenant(env, row.tenant_id);
    if (!token) {
      await env.DB.prepare(
        "UPDATE notifications SET scheduled_at=?1 WHERE tenant_id=?2 AND id=?3 AND status='queued'"
      ).bind(claimNow.toISOString(), row.tenant_id, row.id).run();
      skippedCount += 1;
      continue;
    }
    var failure = null;
    try {
      var response = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to: row.line_user_id,
          messages: [{ type: "text", text: row.content_snapshot }]
        })
      });
      if (!response.ok) {
        failure = await buildLineHttpFailure(response);
        throw makeError("LINE provider rejected request", 502);
      }
      var now = new Date().toISOString();
      await env.DB.prepare(
        "UPDATE notifications SET status = 'sent', sent_at = ?1, " +
        "scheduled_at = ?1, failed_at = NULL, error_code = NULL, error_message = NULL " +
        "WHERE tenant_id = ?2 AND id = ?3 AND status IN ('queued', 'failed')"
      ).bind(now, row.tenant_id, row.id).run();
      sentCount += 1;
    } catch (error) {
      var failedAt = new Date().toISOString();
      if (!failure) {
        failure = {
          code: "line_network_error",
          message: "LINE API network request failed"
        };
      }
      await env.DB.prepare(
        "UPDATE notifications SET status = 'failed', failed_at = ?1, " +
        "error_code = ?2, error_message = ?3 " +
        "WHERE tenant_id = ?4 AND id = ?5 AND status IN ('queued', 'failed')"
      ).bind(
        failedAt, failure.code, failure.message, row.tenant_id, row.id
      ).run();
      failedCount += 1;
    }
  }
  return {
    ok: true,
    enabled: sentCount + failedCount > 0,
    sentCount: sentCount,
    failedCount: failedCount,
    skippedCount: skippedCount
  };
}

export async function dispatchLineNotificationById(env, notificationId) {
  var result = await env.DB.prepare(
    "SELECT n.id, n.tenant_id, n.content_snapshot, " +
    "COALESCE(NULLIF(n.recipient,''),la.line_user_id) AS line_user_id " +
    "FROM notifications n " +
    "LEFT JOIN line_accounts la ON la.tenant_id=n.tenant_id AND la.customer_id=n.customer_id " +
    "WHERE n.tenant_id = ?1 AND n.id = ?2 AND n.channel = 'line' " +
    "AND n.status IN ('queued', 'failed') " +
    "AND COALESCE(NULLIF(n.recipient,''),la.line_user_id) IS NOT NULL " +
    "AND (n.template_code<>'booking_tomorrow_reminder' OR EXISTS (" +
    "SELECT 1 FROM bookings b WHERE b.tenant_id=n.tenant_id " +
    "AND b.id=n.booking_id AND b.status='confirmed')) LIMIT 1"
  ).bind(env.TENANT_ID, String(notificationId)).all();
  return deliverLineRows(env, result.results || []);
}

export async function notifyOwnerPaidBookingReschedule(env, requestInfo) {
  var info = requestInfo || {};
  var owner = await env.DB.prepare(
    "SELECT sla.line_user_id FROM staff_line_accounts sla JOIN staff s " +
    "ON s.tenant_id=sla.tenant_id AND s.id=sla.staff_id " +
    "WHERE sla.tenant_id=?1 AND sla.status='active' AND s.status='active' " +
    "AND s.role IN ('owner','manager') ORDER BY CASE s.role WHEN 'owner' THEN 0 ELSE 1 END LIMIT 1"
  ).bind(env.TENANT_ID).first();
  if (!owner || !owner.line_user_id) return { ok: true, queued: false, reason: "owner_line_not_bound" };
  var content = [
    "已確認訂金的客戶提出變更時間需求，原預約尚未取消，請儘快聯絡處理。",
    "客戶：" + String(info.customerName || "客戶"),
    "服務：" + String(info.serviceName || "服務"),
    "希望變更至：" + String(info.requestedDate || "") + " " + String(info.requestedTime || ""),
    "請從業主端核對原預約與訂金後再安排改期，避免訂金爭議。"
  ].join("\n");
  var now = new Date().toISOString();
  var notificationId = crypto.randomUUID();
  var recentAfter = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  var inserted = await env.DB.prepare(
    "INSERT INTO notifications (id,tenant_id,booking_id,channel,template_code,recipient,content_snapshot,status,scheduled_at,created_at) " +
    "SELECT ?1,?2,?3,'line','paid_booking_reschedule_requested',?4,?5,'queued',?6,?6 " +
    "WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE tenant_id=?2 AND booking_id=?3 " +
    "AND template_code='paid_booking_reschedule_requested' AND content_snapshot=?5 AND created_at>=?7)"
  ).bind(notificationId, env.TENANT_ID, info.bookingId, owner.line_user_id,
    content, now, recentAfter).run();
  if (!inserted || !inserted.meta || Number(inserted.meta.changes) !== 1) {
    return { ok: true, queued: false, deduplicated: true };
  }
  var result = await env.DB.prepare(
    "SELECT id,tenant_id,content_snapshot,recipient AS line_user_id FROM notifications " +
    "WHERE tenant_id=?1 AND id=?2 AND status='queued'"
  ).bind(env.TENANT_ID, notificationId).all();
  await deliverLineRows(env, result.results || []);
  return { ok: true, queued: true, notificationId: notificationId };
}

export async function notifyOwnerDepositTransferReported(env, bookingId) {
  var owner = await env.DB.prepare(
    "SELECT sla.line_user_id FROM staff_line_accounts sla JOIN staff s " +
    "ON s.tenant_id=sla.tenant_id AND s.id=sla.staff_id " +
    "WHERE sla.tenant_id=?1 AND sla.status='active' AND s.status='active' " +
    "AND s.role IN ('owner','manager') ORDER BY CASE s.role WHEN 'owner' THEN 0 ELSE 1 END LIMIT 1"
  ).bind(env.TENANT_ID).first();
  if (!owner || !owner.line_user_id) {
    return { ok: true, queued: false, reason: "owner_line_not_bound" };
  }
  var booking = await env.DB.prepare(
    "SELECT b.id,b.customer_id,b.start_at,b.deposit_transfer_last5,c.display_name," +
    "COALESCE((SELECT group_concat(bi.service_name_snapshot, '、') FROM booking_items bi " +
    "WHERE bi.tenant_id=b.tenant_id AND bi.booking_id=b.id ORDER BY bi.sort_order),'') AS service_name " +
    "FROM bookings b JOIN customers c ON c.tenant_id=b.tenant_id AND c.id=b.customer_id " +
    "WHERE b.tenant_id=?1 AND b.id=?2 AND b.deposit_reported_at IS NOT NULL LIMIT 1"
  ).bind(env.TENANT_ID, String(bookingId || "")).first();
  if (!booking) return { ok: true, queued: false, reason: "deposit_report_not_found" };
  var appointment = formatTaipeiAppointment(booking.start_at);
  var content = [
    "客戶已回報訂金匯款，請進入業主端核對。",
    "客戶：" + String(booking.display_name || "客戶"),
    booking.service_name ? "服務項目：" + booking.service_name : "",
    appointment ? "預約時間：" + appointment.date + " " + appointment.time : "",
    "轉帳帳號末五碼：" + String(booking.deposit_transfer_last5 || "")
  ].filter(Boolean).join("\n");
  var now = new Date().toISOString();
  var notificationId = crypto.randomUUID();
  var inserted = await env.DB.prepare(
    "INSERT INTO notifications (id,tenant_id,customer_id,booking_id,channel,template_code," +
    "recipient,content_snapshot,status,scheduled_at,created_at) " +
    "SELECT ?1,?2,?3,?4,'line','deposit_transfer_reported_owner',?5,?6,'queued',?7,?7 " +
    "WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE tenant_id=?2 AND booking_id=?4 " +
    "AND template_code='deposit_transfer_reported_owner')"
  ).bind(notificationId, env.TENANT_ID, booking.customer_id, booking.id,
    owner.line_user_id, content, now).run();
  if (!inserted || !inserted.meta || Number(inserted.meta.changes) !== 1) {
    return { ok: true, queued: false, deduplicated: true };
  }
  var result = await env.DB.prepare(
    "SELECT id,tenant_id,content_snapshot,recipient AS line_user_id FROM notifications " +
    "WHERE tenant_id=?1 AND id=?2 AND status='queued'"
  ).bind(env.TENANT_ID, notificationId).all();
  var delivery = await deliverLineRows(env, result.results || []);
  return Object.assign({ ok: true, queued: true, notificationId: notificationId }, delivery);
}

export async function dispatchQueuedLineNotifications(env, limitInput, currentTime) {
  var limit = Math.max(1, Math.min(50, Number(limitInput) || 20));
  var now = new Date(currentTime == null ? Date.now() : currentTime);
  var retryBefore = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  var tomorrowRange = tomorrowTaipeiUtcRange(now);
  await env.DB.prepare(
    "UPDATE notifications SET status='cancelled',failed_at=NULL,error_code=NULL,error_message=NULL " +
    "WHERE channel='line' AND template_code='booking_tomorrow_reminder' " +
    "AND status IN ('queued','failed') AND NOT EXISTS (" +
    "SELECT 1 FROM bookings b WHERE b.tenant_id=notifications.tenant_id " +
    "AND b.id=notifications.booking_id AND b.status='confirmed' " +
    "AND b.start_at>=?1 AND b.start_at<?2)"
  ).bind(tomorrowRange.start, tomorrowRange.end).run();
  await env.DB.prepare(
    "UPDATE notifications SET status='cancelled',failed_at=NULL,error_code=NULL,error_message=NULL " +
    "WHERE channel='line' AND template_code='standard_care_follow_up_21d' " +
    "AND status IN ('queued','failed') AND EXISTS (" +
    "SELECT 1 FROM bookings original " +
    "JOIN booking_items original_item ON original_item.tenant_id=original.tenant_id " +
    "AND original_item.booking_id=original.id " +
    "JOIN bookings later ON later.tenant_id=original.tenant_id " +
    "AND later.customer_id=original.customer_id AND later.id<>original.id " +
    "JOIN booking_items later_item ON later_item.tenant_id=later.tenant_id " +
    "AND later_item.booking_id=later.id AND later_item.service_id=original_item.service_id " +
    "WHERE original.tenant_id=notifications.tenant_id AND original.id=notifications.booking_id " +
    "AND later.start_at>original.start_at AND later.status IN " +
    "('pending_review','pending_customer_confirmation','confirmed','checked_in','completed'))"
  ).bind().run();
  var result = await env.DB.prepare(
    "SELECT n.id, n.tenant_id, n.content_snapshot, " +
    "COALESCE(NULLIF(n.recipient,''),la.line_user_id) AS line_user_id " +
    "FROM notifications n " +
    "LEFT JOIN line_accounts la ON la.tenant_id=n.tenant_id AND la.customer_id=n.customer_id " +
    "WHERE n.channel = 'line' AND (" +
    "(n.status = 'queued' AND (n.scheduled_at IS NULL OR n.scheduled_at <= ?1)) OR " +
    "(n.status = 'failed' AND n.failed_at <= ?2)) " +
    "AND COALESCE(NULLIF(n.recipient,''),la.line_user_id) IS NOT NULL " +
    "ORDER BY n.created_at ASC LIMIT ?3"
  ).bind(now.toISOString(), retryBefore, limit).all();
  return deliverLineRows(env, result.results || []);
}
