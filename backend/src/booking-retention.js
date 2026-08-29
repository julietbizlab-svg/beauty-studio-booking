const CUSTOMER_CANCEL_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;

function scheduledIso(scheduledTime) {
  var value = Number(scheduledTime);
  var date = Number.isFinite(value) ? new Date(value) : new Date();
  return date.toISOString();
}

export function customerCancelCutoffIso(scheduledTime) {
  return new Date(
    new Date(scheduledIso(scheduledTime)).getTime() - CUSTOMER_CANCEL_RETENTION_MS
  ).toISOString();
}

async function deletePrivateReviewPhotos(env, tenantId, bookingId) {
  var photos = await env.DB.prepare(
    "SELECT object_key FROM booking_review_photos " +
    "WHERE tenant_id=?1 AND booking_id=?2"
  ).bind(tenantId, bookingId).all();
  var keys = (photos.results || []).map(function (row) {
    return String(row.object_key || "").trim();
  }).filter(Boolean);
  if (!keys.length) return;
  if (!env.PHOTO_BUCKET || typeof env.PHOTO_BUCKET.delete !== "function") {
    throw new Error("取消預約照片儲存設定不完整");
  }
  await env.PHOTO_BUCKET.delete(keys);
}

export async function purgeExpiredCustomerCancelledBookings(env, scheduledTime) {
  if (!env || !env.DB) throw new Error("取消預約清理資料庫設定不完整");
  var cutoff = customerCancelCutoffIso(scheduledTime);
  var due = await env.DB.prepare(
    "SELECT id, tenant_id FROM bookings " +
    "WHERE status='cancelled_by_customer' AND cancelled_at<?1 " +
    "ORDER BY cancelled_at ASC LIMIT ?2"
  ).bind(cutoff, CLEANUP_BATCH_SIZE).all();
  var deleted = 0;

  for (const row of (due.results || [])) {
    await deletePrivateReviewPhotos(env, row.tenant_id, row.id);
    var results = await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM booking_review_photos WHERE tenant_id=?1 AND booking_id=?2"
      ).bind(row.tenant_id, row.id),
      env.DB.prepare(
        "UPDATE customer_photo_sets SET booking_id=NULL, updated_at=?3 " +
        "WHERE tenant_id=?1 AND booking_id=?2"
      ).bind(row.tenant_id, row.id, scheduledIso(scheduledTime)),
      env.DB.prepare(
        "DELETE FROM bookings WHERE tenant_id=?1 AND id=?2 " +
        "AND status='cancelled_by_customer' AND cancelled_at<?3"
      ).bind(row.tenant_id, row.id, cutoff)
    ]);
    var bookingDelete = results && results[2];
    deleted += Number(bookingDelete && bookingDelete.meta && bookingDelete.meta.changes || 0);
  }
  return { ok: true, cutoff: cutoff, scanned: (due.results || []).length, deleted: deleted };
}
