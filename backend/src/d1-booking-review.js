import { sniffImageType, MAX_PHOTO_BYTES } from "./d1-customer-photos.js";
import { enqueueBookingNotification } from "./d1-notifications.js";

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

function ensureEnv(env, needsBucket) {
  if (!env || !env.DB || !env.TENANT_ID) throw makeError("審核資料服務設定不完整", 500);
  if (needsBucket && !env.PHOTO_BUCKET) throw makeError("照片儲存空間尚未設定", 500);
}

function textValue(input, name, max) {
  var value = String(input == null ? "" : input).trim();
  if (value.length > max) throw makeError(name + "不可超過 " + max + " 字", 400);
  return value;
}

function dateValue(input) {
  var value = String(input == null ? "" : input).trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) !== value) {
    throw makeError("上次施作時間格式錯誤", 400);
  }
  return value;
}

async function customerBooking(env, bookingId, userId) {
  var row = await env.DB.prepare(
    "SELECT b.id, b.status FROM bookings b JOIN line_accounts la " +
    "ON la.tenant_id = b.tenant_id AND la.customer_id = b.customer_id " +
    "WHERE b.tenant_id = ?1 AND b.id = ?2 AND la.line_user_id = ?3"
  ).bind(env.TENANT_ID, String(bookingId || ""), String(userId || "")).first();
  if (!row) throw makeError("找不到此預約", 404);
  if (["pending_review", "pending_customer_confirmation"].indexOf(row.status) === -1) {
    throw makeError("此預約目前不接受補充審核資料", 400);
  }
  return row;
}

async function ownerBooking(env, bookingId) {
  var row = await env.DB.prepare(
    "SELECT id, status FROM bookings WHERE tenant_id = ?1 AND id = ?2"
  ).bind(env.TENANT_ID, String(bookingId || "")).first();
  if (!row) throw makeError("找不到此預約", 404);
  return row;
}

function intakeDto(row, photos, owner) {
  var bookingId = row && row.booking_id ? row.booking_id : "";
  return {
    surgeryHistory: row ? row.surgery_history || "" : "",
    diseaseHistory: row ? row.disease_history || "" : "",
    lastTreatmentAt: row ? row.last_treatment_at || null : null,
    customerNote: row ? row.customer_note || "" : "",
    photoRequested: Boolean(row && row.photo_requested),
    photoRequestNote: row ? row.photo_request_note || "" : "",
    surgeryHistoryRequested: Boolean(row && row.surgery_history_requested),
    diseaseHistoryRequested: Boolean(row && row.disease_history_requested),
    lastTreatmentRequested: Boolean(row && row.last_treatment_requested),
    questionRequestNote: row ? row.question_request_note || "" : "",
    submittedAt: row ? row.submitted_at || null : null,
    photos: (photos || []).map(function (photo) {
      return {
        photoId: photo.id,
        mimeType: photo.mime_type,
        byteSize: Number(photo.byte_size) || 0,
        createdAt: photo.created_at,
        contentPath: owner
          ? "/api/owner/bookings/" + encodeURIComponent(bookingId) +
            "/review-photos/" + encodeURIComponent(photo.id) + "/content"
          : ""
      };
    })
  };
}

async function readIntake(env, bookingId, owner) {
  var row = await env.DB.prepare(
    "SELECT booking_id, surgery_history, disease_history, last_treatment_at, " +
    "customer_note, photo_requested, photo_request_note, surgery_history_requested, " +
    "disease_history_requested, last_treatment_requested, question_request_note, " +
    "submitted_at, updated_at " +
    "FROM booking_review_intakes WHERE tenant_id = ?1 AND booking_id = ?2"
  ).bind(env.TENANT_ID, bookingId).first();
  var result = await env.DB.prepare(
    "SELECT id, booking_id, mime_type, byte_size, created_at FROM booking_review_photos " +
    "WHERE tenant_id = ?1 AND booking_id = ?2 AND deleted_at IS NULL ORDER BY created_at ASC"
  ).bind(env.TENANT_ID, bookingId).all();
  if (!row) row = { booking_id: bookingId };
  return { ok: true, intake: intakeDto(row, result.results || [], owner) };
}

export async function getCustomerBookingReview(env, bookingId, userId) {
  ensureEnv(env, false);
  await customerBooking(env, bookingId, userId);
  return readIntake(env, String(bookingId), false);
}

export async function updateCustomerBookingReview(env, bookingId, userId, payload) {
  ensureEnv(env, false);
  await customerBooking(env, bookingId, userId);
  var input = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  var surgery = textValue(input.surgeryHistory, "手術史", 2000);
  var disease = textValue(input.diseaseHistory, "疾病史", 2000);
  var lastTreatment = dateValue(input.lastTreatmentAt);
  var note = textValue(input.customerNote, "補充說明", 2000);
  var now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO booking_review_intakes " +
    "(booking_id, tenant_id, surgery_history, disease_history, last_treatment_at, " +
    "customer_note, submitted_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7) " +
    "ON CONFLICT(booking_id) DO UPDATE SET surgery_history = excluded.surgery_history, " +
    "disease_history = excluded.disease_history, last_treatment_at = excluded.last_treatment_at, " +
    "customer_note = excluded.customer_note, submitted_at = excluded.submitted_at, " +
    "updated_at = excluded.updated_at WHERE tenant_id = ?2"
  ).bind(String(bookingId), env.TENANT_ID, surgery, disease, lastTreatment, note, now).run();
  return readIntake(env, String(bookingId), false);
}

export async function getOwnerBookingReview(env, bookingId) {
  ensureEnv(env, false);
  await ownerBooking(env, bookingId);
  return readIntake(env, String(bookingId), true);
}

export async function getOwnerAiWorkQueue(env, nowInput) {
  ensureEnv(env, false);
  var now = nowInput instanceof Date ? nowInput : new Date(nowInput || Date.now());
  if (!Number.isFinite(now.getTime())) throw makeError("時間格式錯誤", 400);
  var riskAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  var result = await env.DB.prepare(
    "SELECT b.id, b.start_at, b.status, b.deposit_due_at, b.deposit_reported_at, " +
    "c.display_name, bi.service_name_snapshot, " +
    "COALESCE(i.photo_requested, 0) AS photo_requested, " +
    "COALESCE(i.surgery_history_requested, 0) AS surgery_history_requested, " +
    "COALESCE(i.disease_history_requested, 0) AS disease_history_requested, " +
    "COALESCE(i.last_treatment_requested, 0) AS last_treatment_requested, " +
    "(SELECT COUNT(*) FROM booking_review_photos p WHERE p.tenant_id = b.tenant_id " +
    "AND p.booking_id = b.id AND p.deleted_at IS NULL) AS photo_count " +
    "FROM bookings b JOIN customers c ON c.tenant_id = b.tenant_id AND c.id = b.customer_id " +
    "LEFT JOIN booking_review_intakes i ON i.tenant_id = b.tenant_id AND i.booking_id = b.id " +
    "LEFT JOIN booking_items bi ON bi.id = (SELECT bi2.id FROM booking_items bi2 " +
    "WHERE bi2.tenant_id = b.tenant_id AND bi2.booking_id = b.id " +
    "ORDER BY bi2.sort_order, bi2.created_at LIMIT 1) " +
    "WHERE b.tenant_id = ?1 AND b.status IN ('pending_review','pending_customer_confirmation') " +
    "ORDER BY CASE WHEN b.status = 'pending_customer_confirmation' THEN 0 ELSE 1 END, " +
    "b.deposit_due_at ASC, b.start_at ASC"
  ).bind(env.TENANT_ID).all();
  var items = (result.results || []).map(function (row) {
    var dueAt = row.deposit_due_at || null;
    return {
      bookingId: row.id,
      customerName: row.display_name || "客人",
      serviceName: row.service_name_snapshot || "服務",
      startAt: row.start_at,
      status: row.status,
      pendingReview: row.status === "pending_review",
      questionRequested: Boolean(row.surgery_history_requested ||
        row.disease_history_requested || row.last_treatment_requested),
      photoRequested: Boolean(row.photo_requested),
      photoCount: Number(row.photo_count) || 0,
      pendingDeposit: row.status === "pending_customer_confirmation",
      depositReported: Boolean(row.deposit_reported_at),
      depositDueAt: dueAt,
      deadlineRisk: Boolean(dueAt && dueAt <= riskAt)
    };
  });
  var counts = {
    pendingReview: 0,
    questionRequested: 0,
    photoRequested: 0,
    pendingDeposit: 0,
    deadlineRisk: 0
  };
  items.forEach(function (item) {
    Object.keys(counts).forEach(function (key) {
      if (item[key]) counts[key] += 1;
    });
  });
  return { ok: true, counts: counts, items: items, riskWindowHours: 6 };
}

export async function requestOwnerBookingReviewPhoto(env, bookingId, payload) {
  ensureEnv(env, false);
  var booking = await ownerBooking(env, bookingId);
  if (["pending_review", "pending_customer_confirmation"].indexOf(booking.status) === -1) {
    throw makeError("此預約目前不接受補件要求", 400);
  }
  var input = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  var hasPhotoPatch = typeof input.photoRequested === "boolean";
  var hasQuestionPatch = typeof input.surgeryHistoryRequested === "boolean" ||
    typeof input.diseaseHistoryRequested === "boolean" ||
    typeof input.lastTreatmentRequested === "boolean";
  if (!hasPhotoPatch && !hasQuestionPatch) throw makeError("缺少補件需求", 400);
  var note = textValue(input.photoRequestNote, "照片需求說明", 500);
  if (hasPhotoPatch && input.photoRequested && !note) throw makeError("請填寫需要的照片內容", 400);
  var questionNote = textValue(input.questionRequestNote, "問題補充說明", 500);
  var surgeryRequested = input.surgeryHistoryRequested === true;
  var diseaseRequested = input.diseaseHistoryRequested === true;
  var lastTreatmentRequested = input.lastTreatmentRequested === true;
  if (hasQuestionPatch && !surgeryRequested && !diseaseRequested && !lastTreatmentRequested) {
    throw makeError("請至少選擇一個需要客人補答的問題", 400);
  }
  var existing = await env.DB.prepare(
    "SELECT photo_requested, photo_request_note, surgery_history_requested, " +
    "disease_history_requested, last_treatment_requested, question_request_note " +
    "FROM booking_review_intakes WHERE tenant_id = ?1 AND booking_id = ?2"
  ).bind(env.TENANT_ID, String(bookingId)).first();
  var photoRequested = hasPhotoPatch
    ? input.photoRequested === true
    : Boolean(existing && existing.photo_requested);
  var photoNote = hasPhotoPatch ? note : existing && existing.photo_request_note || "";
  if (!hasQuestionPatch) {
    surgeryRequested = Boolean(existing && existing.surgery_history_requested);
    diseaseRequested = Boolean(existing && existing.disease_history_requested);
    lastTreatmentRequested = Boolean(existing && existing.last_treatment_requested);
    questionNote = existing && existing.question_request_note || "";
  }
  var now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO booking_review_intakes " +
    "(booking_id, tenant_id, photo_requested, photo_request_note, " +
    "surgery_history_requested, disease_history_requested, last_treatment_requested, " +
    "question_request_note, updated_at) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(booking_id) DO UPDATE SET " +
    "photo_requested = excluded.photo_requested, photo_request_note = excluded.photo_request_note, " +
    "surgery_history_requested = excluded.surgery_history_requested, " +
    "disease_history_requested = excluded.disease_history_requested, " +
    "last_treatment_requested = excluded.last_treatment_requested, " +
    "question_request_note = excluded.question_request_note, updated_at = excluded.updated_at " +
    "WHERE tenant_id = ?2"
  ).bind(
    String(bookingId), env.TENANT_ID,
    photoRequested ? 1 : 0, photoNote,
    surgeryRequested ? 1 : 0, diseaseRequested ? 1 : 0, lastTreatmentRequested ? 1 : 0,
    questionNote, now
  ).run();
  if (hasPhotoPatch && input.photoRequested) {
    await enqueueBookingNotification(env, String(bookingId), "review_photo_requested");
  }
  if (hasQuestionPatch) {
    await enqueueBookingNotification(env, String(bookingId), "review_answers_requested");
  }
  return readIntake(env, String(bookingId), true);
}

export async function uploadCustomerBookingReviewPhoto(env, bookingId, userId, bytes, declaredMime) {
  ensureEnv(env, true);
  await customerBooking(env, bookingId, userId);
  var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!data.length || data.length > MAX_PHOTO_BYTES) throw makeError("照片大小不符合限制", 400);
  var mime = sniffImageType(data);
  if (!mime || (declaredMime && declaredMime !== mime)) throw makeError("照片格式不支援", 400);
  var count = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM booking_review_photos " +
    "WHERE tenant_id = ?1 AND booking_id = ?2 AND deleted_at IS NULL"
  ).bind(env.TENANT_ID, String(bookingId)).first();
  if (Number(count && count.count) >= 3) throw makeError("每筆預約最多上傳 3 張照片", 400);
  var photoId = crypto.randomUUID();
  var objectKey = "booking-review-photos/" + env.TENANT_ID + "/" + crypto.randomUUID();
  var now = new Date().toISOString();
  await env.PHOTO_BUCKET.put(objectKey, data, { httpMetadata: { contentType: mime } });
  try {
    await env.DB.prepare(
      "INSERT INTO booking_review_photos " +
      "(id, tenant_id, booking_id, object_key, mime_type, byte_size, created_at) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    ).bind(photoId, env.TENANT_ID, String(bookingId), objectKey, mime, data.length, now).run();
  } catch (error) {
    try { await env.PHOTO_BUCKET.delete(objectKey); } catch (ignore) {}
    throw error;
  }
  return { ok: true, photo: { photoId: photoId, mimeType: mime, byteSize: data.length, createdAt: now } };
}

export async function getOwnerBookingReviewPhotoContent(env, bookingId, photoId) {
  ensureEnv(env, true);
  await ownerBooking(env, bookingId);
  var row = await env.DB.prepare(
    "SELECT object_key, mime_type FROM booking_review_photos " +
    "WHERE tenant_id = ?1 AND booking_id = ?2 AND id = ?3 AND deleted_at IS NULL"
  ).bind(env.TENANT_ID, String(bookingId), String(photoId)).first();
  if (!row) throw makeError("找不到此照片", 404);
  var object = await env.PHOTO_BUCKET.get(row.object_key);
  if (!object || !object.body) throw makeError("照片暫時無法讀取", 404);
  return { body: object.body, mimeType: row.mime_type };
}
