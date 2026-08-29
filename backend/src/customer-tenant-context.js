function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

var ENTRY_KEY_PATTERN = /^[a-f0-9]{64}$/;
var entryCache = new Map();
var CACHE_MS = 5 * 60 * 1000;

export function normalizeCustomerEntryKey(value) {
  var key = String(value || "").trim().toLowerCase();
  return ENTRY_KEY_PATTERN.test(key) ? key : "";
}

/**
 * 公開客戶入口只接受不可猜測的 entry key。後端查表後才套用 tenant、
 * default location 與 owner staff；前端永遠不能直接指定 tenant ID。
 */
export async function scopeCustomerTenantEnv(request, env) {
  var rawKey = request.headers.get("X-Beauty-Studio-Entry") || "";
  if (!rawKey) return env;
  if (!env || !env.DB) throw makeError("客戶入口資料庫尚未設定", 503);

  var key = normalizeCustomerEntryKey(rawKey);
  if (!key) throw makeError("客戶入口無效", 404);

  var cached = entryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Object.assign({}, env, cached.context);
  }

  var row = await env.DB.prepare(
    "SELECT t.id AS tenant_id, l.id AS location_id, s.id AS staff_id " +
    "FROM tenant_settings entry " +
    "JOIN tenants t ON t.id=entry.tenant_id AND t.status IN ('active','trial') " +
    "JOIN locations l ON l.tenant_id=t.id AND l.is_default=1 AND l.status='active' " +
    "JOIN staff s ON s.tenant_id=t.id AND s.location_id=l.id " +
    "AND s.role='owner' AND s.status='active' AND s.booking_enabled=1 " +
    "WHERE entry.setting_key='customer_entry_key' AND entry.setting_value=?1 " +
    "LIMIT 1"
  ).bind(key).first();

  if (!row || !row.tenant_id || !row.location_id || !row.staff_id) {
    throw makeError("找不到此工作室客戶入口", 404);
  }

  var context = {
    TENANT_ID: row.tenant_id,
    LOCATION_ID: row.location_id,
    STAFF_ID: row.staff_id
  };
  entryCache.set(key, { context: context, expiresAt: Date.now() + CACHE_MS });
  return Object.assign({}, env, context);
}
