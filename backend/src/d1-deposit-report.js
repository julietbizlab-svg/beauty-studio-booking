function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

export async function reportCustomerDepositTransfer(env, bookingId, userId, payload) {
  if (!env || !env.DB || !env.TENANT_ID) throw makeError("訂金回報服務設定不完整", 500);
  var input = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  var last5 = String(input.last5 || "").trim();
  if (!/^\d{5}$/.test(last5)) throw makeError("請輸入轉帳帳號末五碼", 400);
  var now = new Date().toISOString();
  var result = await env.DB.prepare(
    "UPDATE bookings SET deposit_transfer_last5 = ?1, deposit_reported_at = ?2, updated_at = ?2 " +
    "WHERE tenant_id = ?3 AND id = ?4 AND status = 'pending_customer_confirmation' " +
    "AND deposit_due_at IS NOT NULL AND deposit_due_at > ?2 AND EXISTS (" +
    "SELECT 1 FROM line_accounts la WHERE la.tenant_id = bookings.tenant_id " +
    "AND la.customer_id = bookings.customer_id AND la.line_user_id = ?5)"
  ).bind(last5, now, env.TENANT_ID, String(bookingId || ""), String(userId || "")).run();
  if (!result || !result.meta || !result.meta.changes) {
    throw makeError("此預約目前無法回報訂金，可能已逾期或狀態已變更", 400);
  }
  return { ok: true, last5: last5, reportedAt: now };
}
