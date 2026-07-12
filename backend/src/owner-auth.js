/**
 * 業主權限驗證
 */
import {
  extractIdTokenFromRequest,
  verifyLineIdToken
} from "./liff-verify.js";

export function parseOwnerUserIds(raw) {
  if (!raw || typeof raw !== "string") {
    return [];
  }
  return raw
    .split(/[,\s]+/)
    .map(function (id) { return id.trim(); })
    .filter(Boolean);
}

export function isOwnerUser(env, userId) {
  if (!userId) {
    return false;
  }
  var allowed = parseOwnerUserIds(env.OWNER_LINE_USER_IDS);
  return allowed.indexOf(userId) !== -1;
}

export function requireOwner(env, userId) {
  if (!isOwnerUser(env, userId)) {
    var error = new Error("無業主管理權限");
    error.status = 403;
    throw error;
  }
}

/**
 * 從 request 驗證業主身分（fail closed）
 * @returns {Promise<string>} 已驗證的 owner userId
 */
export async function requireOwnerFromRequest(request, env) {
  var idToken = extractIdTokenFromRequest(request);
  var verified = await verifyLineIdToken(idToken, env);

  if (!isOwnerUser(env, verified.userId)) {
    var forbidden = new Error("無業主管理權限");
    forbidden.status = 403;
    throw forbidden;
  }

  return verified.userId;
}

export function getTaipeiDateString(date) {
  var d = date || new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

export function getTaipeiWeekdayIndex(dateStr) {
  var parts = dateStr.split("-");
  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return date.getDay();
}
