/**
 * 資料 repository selector（v2）
 *
 * 依 env.DATA_BACKEND 在 Notion 與 D1 兩套 repository 之間切換：
 * - undefined／空字串／"notion" → notion.js（預設，維持現行行為）
 * - "d1" → d1-repository.js
 * - 其他值 → 丟 500 設定錯誤（訊息不含實際值或任何 secret）
 *
 * 所有 wrapper 每次呼叫時依 env 重新選擇 repository 後直接轉呼叫：
 * 不改參數、不改 DTO、不捕捉或隱藏 repository 拋出的錯誤。
 */
import * as notionRepository from "./notion.js";
import * as d1Repository from "./d1-repository.js";

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

function resolveRepository(env) {
  var backend = env && env.DATA_BACKEND != null ? String(env.DATA_BACKEND) : "";
  if (backend === "" || backend === "notion") {
    return notionRepository;
  }
  if (backend === "d1") {
    return d1Repository;
  }
  throw makeError("DATA_BACKEND 設定錯誤，僅支援 notion 或 d1", 500);
}

/** 目前生效的資料後端名稱（"notion" 或 "d1"），供 /api/health 顯示 */
export function getDataBackendName(env) {
  return resolveRepository(env) === d1Repository ? "d1" : "notion";
}

/** 依後端檢查對應環境設定：notion → ensureNotionEnv；d1 → ensureD1Env */
export function ensureDataEnv(env) {
  var repository = resolveRepository(env);
  if (repository === d1Repository) {
    return d1Repository.ensureD1Env(env);
  }
  return notionRepository.ensureNotionEnv(env);
}

// ── 資料函式 wrapper（簽名與各 repository 完全一致） ──────────

export function listServices(env, activeOnly) {
  return resolveRepository(env).listServices(env, activeOnly);
}

export function createService(env, data) {
  return resolveRepository(env).createService(env, data);
}

export function updateService(env, serviceId, data) {
  return resolveRepository(env).updateService(env, serviceId, data);
}

export function listWeeklySlots(env) {
  return resolveRepository(env).listWeeklySlots(env);
}

export function replaceWeeklySlots(env, slots) {
  return resolveRepository(env).replaceWeeklySlots(env, slots);
}

export function getActiveBookingsByDate(env, date) {
  return resolveRepository(env).getActiveBookingsByDate(env, date);
}

export function getActiveBookingsForMonth(env, month) {
  return resolveRepository(env).getActiveBookingsForMonth(env, month);
}

export function getUserBookings(env, userId) {
  return resolveRepository(env).getUserBookings(env, userId);
}

export function createBooking(env, payload) {
  return resolveRepository(env).createBooking(env, payload);
}

export function cancelBooking(env, userId, bookingId) {
  return resolveRepository(env).cancelBooking(env, userId, bookingId);
}

export function cancelBookingByOwner(env, bookingId, cancelReason) {
  return resolveRepository(env).cancelBookingByOwner(env, bookingId, cancelReason);
}

export function getTodayBookingsForOwner(env, date) {
  return resolveRepository(env).getTodayBookingsForOwner(env, date);
}

export function getOwnerBookingsForMonth(env, month) {
  return resolveRepository(env).getOwnerBookingsForMonth(env, month);
}

export function getOwnerCustomersFromBookings(env, queryText) {
  return resolveRepository(env).getOwnerCustomersFromBookings(env, queryText);
}

export function getOwnerCustomerBookings(env, userId) {
  return resolveRepository(env).getOwnerCustomerBookings(env, userId);
}

export function getSettings(env) {
  return resolveRepository(env).getSettings(env);
}

export function updateSettings(env, patch) {
  return resolveRepository(env).updateSettings(env, patch);
}

export function getServiceById(env, serviceId) {
  return resolveRepository(env).getServiceById(env, serviceId);
}

export function getServiceDurationMap(env, serviceIds) {
  return resolveRepository(env).getServiceDurationMap(env, serviceIds);
}

// ── 客戶 profile（僅 D1 支援；Notion 後端 fail closed） ─────────

function requireRepositoryFunction(env, name) {
  var repository = resolveRepository(env);
  if (typeof repository[name] !== "function") {
    throw makeError("目前資料後端不支援此功能", 501);
  }
  return repository[name];
}

export function getCustomerProfileByUserId(env, userId) {
  return requireRepositoryFunction(env, "getCustomerProfileByUserId")(env, userId);
}

export function updateCustomerByOwner(env, userId, patch) {
  return requireRepositoryFunction(env, "updateCustomerByOwner")(env, userId, patch);
}
