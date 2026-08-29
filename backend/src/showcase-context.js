function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 500;
  return error;
}

/**
 * 公開展示頁只能使用後端預先設定的固定展示工作室；前端不傳 tenant ID，
 * 避免使用者藉由修改請求跨租戶讀寫資料。
 */
export function scopeCustomerShowcaseEnv(request, env) {
  var context = String(request.headers.get("X-Beauty-Showcase") || "").trim();
  if (context !== "flagship" && context !== "standard") return env;

  if (context === "standard") {
    if (!env.STANDARD_SHOWCASE_TENANT_ID ||
        !env.STANDARD_SHOWCASE_LOCATION_ID ||
        !env.STANDARD_SHOWCASE_STAFF_ID) {
      throw makeError("標準展示工作室尚未設定", 503);
    }
    return Object.assign({}, env, {
      TENANT_ID: env.STANDARD_SHOWCASE_TENANT_ID,
      LOCATION_ID: env.STANDARD_SHOWCASE_LOCATION_ID,
      STAFF_ID: env.STANDARD_SHOWCASE_STAFF_ID
    });
  }

  if (!env.FLAGSHIP_SHOWCASE_TENANT_ID ||
      !env.FLAGSHIP_SHOWCASE_LOCATION_ID ||
      !env.FLAGSHIP_SHOWCASE_STAFF_ID) {
    throw makeError("旗艦展示工作室尚未設定", 503);
  }

  return Object.assign({}, env, {
    TENANT_ID: env.FLAGSHIP_SHOWCASE_TENANT_ID,
    LOCATION_ID: env.FLAGSHIP_SHOWCASE_LOCATION_ID,
    STAFF_ID: env.FLAGSHIP_SHOWCASE_STAFF_ID
  });
}
