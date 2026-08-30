function httpError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

function safeAnswers(value) {
  try { return JSON.parse(value || "{}"); } catch (ignore) { return {}; }
}

function dto(row, photos) {
  return {
    id: row.id,
    status: row.status,
    currentStep: row.current_step,
    answers: safeAnswers(row.answers_json),
    manualReviewRequired: Boolean(row.manual_review_required),
    bookingRoute: row.booking_route,
    submittedAt: row.submitted_at || null,
    reviewedAt: row.reviewed_at || null,
    updatedAt: row.updated_at
    ,customerName: row.customer_name || "LINE 客人"
    ,latestInquiryId: row.latest_inquiry_id || ""
    ,photoRequested: Boolean(row.photo_requested)
    ,photoRequestNote: row.photo_request_note || ""
    ,photos: photos || []
  };
}

export async function listOwnerBrowIntakes(env) {
  var result = await env.DB.prepare(
    "SELECT bi.id,bi.status,bi.current_step,bi.answers_json,bi.manual_review_required," +
    "bi.booking_route,bi.submitted_at,bi.reviewed_at,bi.updated_at," +
    "bi.photo_requested,bi.photo_request_note," +
    "COALESCE(c.display_name,la.display_name,'LINE 客人') AS customer_name " +
    ",(SELECT q.id FROM ai_customer_inquiries q WHERE q.tenant_id=bi.tenant_id " +
    "AND q.line_user_id=bi.line_user_id ORDER BY q.created_at DESC,q.id DESC LIMIT 1) " +
    "AS latest_inquiry_id " +
    "FROM brow_intake_sessions bi " +
    "LEFT JOIN line_accounts la ON la.tenant_id=bi.tenant_id AND la.line_user_id=bi.line_user_id " +
    "LEFT JOIN customers c ON c.tenant_id=bi.tenant_id AND c.id=la.customer_id " +
    "WHERE bi.tenant_id=?1 AND bi.status IN ('pending_human_review','need_more_information'," +
    "'temporarily_unavailable','contact_manually','approved') " +
    "AND NOT EXISTS (SELECT 1 FROM assessment_sessions s WHERE s.tenant_id=bi.tenant_id " +
    "AND s.line_user_id=bi.line_user_id AND s.status='approved') " +
    "AND NOT EXISTS (SELECT 1 FROM line_accounts current_la JOIN bookings approved_b " +
    "ON approved_b.tenant_id=current_la.tenant_id " +
    "AND approved_b.customer_id=current_la.customer_id " +
    "WHERE current_la.tenant_id=bi.tenant_id AND current_la.line_user_id=bi.line_user_id " +
    "AND approved_b.review_accepted_at IS NOT NULL) " +
    "ORDER BY CASE bi.status WHEN 'pending_human_review' THEN 0 ELSE 1 END,bi.updated_at DESC LIMIT 100"
  ).bind(env.TENANT_ID).all();
  return Promise.all((result.results || []).map(async function (row) {
    var photos = await env.DB.prepare(
      "SELECT id,kind,mime_type,byte_size,created_at FROM brow_intake_photos " +
      "WHERE tenant_id=?1 AND session_id=?2 ORDER BY created_at"
    ).bind(env.TENANT_ID, row.id).all();
    return dto(row, (photos.results || []).map(function (photo) {
      return { photoId: photo.id, kind: photo.kind, mimeType: photo.mime_type,
        byteSize: Number(photo.byte_size) || 0, createdAt: photo.created_at };
    }));
  }));
}

export async function reviewOwnerBrowIntake(env, id, input) {
  var statusMap = {
    approved: "approved",
    need_more_information: "need_more_information",
    temporarily_unavailable: "temporarily_unavailable",
    contact_manually: "contact_manually"
  };
  var status = statusMap[String(input && input.status || "")];
  if (!status) throw httpError("不支援的審核狀態", 400);
  var message = String(input && input.message || "").trim();
  if (message.length > 1000) throw httpError("補充資料說明不可超過 1000 字", 400);
  if (status === "need_more_information" && !message) throw httpError("請填寫需要補充的資料", 400);
  var photoRequested = status === "need_more_information" && /照片|相片|拍照/.test(message);
  var now = new Date().toISOString();
  var result = await env.DB.prepare(
    "UPDATE brow_intake_sessions SET status=?1,reviewed_at=?2,updated_at=?2," +
    "photo_requested=?3,photo_request_note=?4 " +
    "WHERE tenant_id=?5 AND id=?6 AND status IN ('pending_human_review','need_more_information'," +
    "'temporarily_unavailable','contact_manually','approved')"
  ).bind(status, now, photoRequested ? 1 : 0, photoRequested ? message : "",
    env.TENANT_ID, String(id || "")).run();
  if (!result.meta || Number(result.meta.changes) !== 1) throw httpError("找不到評估案件", 404);
  return { ok: true, id: String(id), status: status, reviewedAt: now };
}
