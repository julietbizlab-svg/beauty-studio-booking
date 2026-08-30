import { sniffImageType, MAX_PHOTO_BYTES } from "./d1-customer-photos.js";

function makeError(message, status) {
  var error = new Error(message); error.status = status || 400; return error;
}
function ensureEnv(env, bucket) {
  if (!env || !env.DB || !env.TENANT_ID) throw makeError("霧眉評估服務設定不完整", 500);
  if (bucket && !env.PHOTO_BUCKET) throw makeError("照片儲存空間尚未設定", 500);
}
function photoDto(row, owner) {
  return { photoId: row.id, kind: row.kind, mimeType: row.mime_type,
    byteSize: Number(row.byte_size) || 0, createdAt: row.created_at,
    contentPath: owner ? "/api/owner/brow-intakes/" + encodeURIComponent(row.session_id) +
      "/photos/" + encodeURIComponent(row.id) + "/content" : "" };
}
async function sessionForCustomer(env, userId) {
  var row = await env.DB.prepare(
    "SELECT id,status,photo_requested,photo_request_note FROM brow_intake_sessions " +
    "WHERE tenant_id=?1 AND line_user_id=?2"
  ).bind(env.TENANT_ID, String(userId || "")).first();
  if (!row) throw makeError("尚無霧眉評估案件", 404);
  return row;
}
async function photosForSession(env, sessionId, owner) {
  var result = await env.DB.prepare(
    "SELECT id,session_id,kind,mime_type,byte_size,created_at FROM brow_intake_photos " +
    "WHERE tenant_id=?1 AND session_id=?2 ORDER BY CASE kind WHEN 'front' THEN 0 WHEN 'left' THEN 1 ELSE 2 END"
  ).bind(env.TENANT_ID, sessionId).all();
  return (result.results || []).map(function (row) { return photoDto(row, owner); });
}
export async function getCustomerBrowIntake(env, userId) {
  ensureEnv(env, false);
  var row = await sessionForCustomer(env, userId);
  return { ok: true, intake: { status: row.status, photoRequested: Boolean(row.photo_requested),
    photoRequestNote: row.photo_request_note || "", photos: await photosForSession(env, row.id, false) } };
}
export async function uploadCustomerBrowIntakePhoto(env, userId, kindInput, bytes, declaredMime) {
  ensureEnv(env, true);
  var kind = String(kindInput || "");
  if (["front", "left", "right"].indexOf(kind) === -1) throw makeError("照片角度錯誤", 400);
  var session = await sessionForCustomer(env, userId);
  if (!session.photo_requested || session.status !== "need_more_information") {
    throw makeError("目前沒有需要補上傳照片", 400);
  }
  var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!data.length || data.length > MAX_PHOTO_BYTES) throw makeError("照片大小不符合限制", 400);
  var mime = sniffImageType(data);
  if (!mime || (declaredMime && declaredMime !== mime)) throw makeError("照片格式不支援", 400);
  var existing = await env.DB.prepare(
    "SELECT id FROM brow_intake_photos WHERE tenant_id=?1 AND session_id=?2 AND kind=?3"
  ).bind(env.TENANT_ID, session.id, kind).first();
  if (existing) throw makeError("此角度照片已上傳", 409);
  var id = crypto.randomUUID();
  var key = "brow-intake-photos/" + env.TENANT_ID + "/" + crypto.randomUUID();
  var now = new Date().toISOString();
  await env.PHOTO_BUCKET.put(key, data, { httpMetadata: { contentType: mime } });
  try {
    await env.DB.prepare(
      "INSERT INTO brow_intake_photos (id,tenant_id,session_id,kind,object_key,mime_type,byte_size,created_at) " +
      "VALUES (?1,?2,?3,?4,?5,?6,?7,?8)"
    ).bind(id, env.TENANT_ID, session.id, kind, key, mime, data.length, now).run();
  } catch (error) { try { await env.PHOTO_BUCKET.delete(key); } catch (ignore) {} throw error; }
  return { ok: true, photo: { photoId: id, kind: kind, mimeType: mime, byteSize: data.length, createdAt: now } };
}
export async function getOwnerBrowIntakePhotoContent(env, sessionId, photoId) {
  ensureEnv(env, true);
  var row = await env.DB.prepare(
    "SELECT object_key,mime_type FROM brow_intake_photos WHERE tenant_id=?1 AND session_id=?2 AND id=?3"
  ).bind(env.TENANT_ID, String(sessionId || ""), String(photoId || "")).first();
  if (!row) throw makeError("找不到照片", 404);
  var object = await env.PHOTO_BUCKET.get(row.object_key);
  if (!object) throw makeError("照片檔案不存在", 404);
  return { body: object.body, mimeType: row.mime_type };
}
