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
import { DEFAULT_NOTICE_DAYS } from "./booking-notice-policy.js";

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

function requireD1ScheduleFunction(env, name) {
  var repository = resolveRepository(env);
  if (repository !== d1Repository || typeof repository[name] !== "function") {
    throw makeError("指定日期休假功能僅支援 v2 D1", 501);
  }
  return repository[name];
}

export function listClosedDates(env, month) {
  return requireD1ScheduleFunction(env, "listClosedDates")(env, month);
}

export function isDateClosed(env, date) {
  return requireD1ScheduleFunction(env, "isDateClosed")(env, date);
}

export function setDateClosed(env, date, closed) {
  return requireD1ScheduleFunction(env, "setDateClosed")(env, date, closed);
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

export function upsertCustomer(env, payload) {
  return resolveRepository(env).upsertCustomer(env, payload);
}

export function createBooking(env, payload) {
  return resolveRepository(env).createBooking(env, payload);
}

export function cancelBooking(env, userId, bookingId) {
  return resolveRepository(env).cancelBooking(env, userId, bookingId);
}

export function requestPaidBookingReschedule(env, userId, bookingId, payload) {
  return requireRepositoryFunction(env, "requestPaidBookingReschedule")(
    env, userId, bookingId, payload
  );
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

export function listCustomerAlbum(env, customerId) {
  var repository = resolveRepository(env);
  if (repository !== d1Repository || typeof repository.listCustomerAlbum !== "function") {
    throw makeError("目前資料後端不支援客戶相簿", 501);
  }
  return repository.listCustomerAlbum(env, customerId);
}

export function getCustomerAlbumPhotoContent(env, customerId, source, photoId) {
  var repository = resolveRepository(env);
  if (repository !== d1Repository || typeof repository.getCustomerAlbumPhotoContent !== "function") {
    throw makeError("目前資料後端不支援客戶相簿", 501);
  }
  return repository.getCustomerAlbumPhotoContent(env, customerId, source, photoId);
}

export async function getSettings(env) {
  var settings = await resolveRepository(env).getSettings(env);
  if (resolveRepository(env) === notionRepository) {
    settings.bookingMinNoticeDays = DEFAULT_NOTICE_DAYS;
    settings.cancellationMinNoticeDays = DEFAULT_NOTICE_DAYS;
  }
  return settings;
}

export async function updateSettings(env, patch) {
  var input = patch || {};
  if (resolveRepository(env) === notionRepository) {
    if (input.bookingMinNoticeDays !== undefined ||
        input.cancellationMinNoticeDays !== undefined) {
      throw makeError("目前資料後端不支援此功能", 501);
    }
  }
  return resolveRepository(env).updateSettings(env, input);
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

export function getOwnerCustomerById(env, customerId) {
  return requireRepositoryFunction(env, "getOwnerCustomerById")(env, customerId);
}

export function updateCustomerByOwnerById(env, customerId, patch) {
  return requireRepositoryFunction(env, "updateCustomerByOwnerById")(env, customerId, patch);
}

// ── 客戶 CSV 匯入（僅 D1 支援；Notion 後端 fail closed） ────────

export function previewCustomerImport(env, payload) {
  return requireRepositoryFunction(env, "previewCustomerImport")(env, payload);
}

export function commitCustomerImport(env, payload) {
  return requireRepositoryFunction(env, "commitCustomerImport")(env, payload);
}

// ── 客戶 LINE 認領邀請（僅 D1 支援；Notion 後端 fail closed） ──

export function createCustomerClaimInvite(env, customerId) {
  return requireRepositoryFunction(env, "createCustomerClaimInvite")(env, customerId);
}

export function getCustomerClaimInvite(env, customerId) {
  return requireRepositoryFunction(env, "getCustomerClaimInvite")(env, customerId);
}

export function revokeCustomerClaimInvite(env, customerId) {
  return requireRepositoryFunction(env, "revokeCustomerClaimInvite")(env, customerId);
}

export function claimCustomerInvite(env, params) {
  return requireRepositoryFunction(env, "claimCustomerInvite")(env, params);
}

// ── 客戶前後對比照片（僅 D1 支援；Notion 後端 fail closed） ──

export function listCustomerPhotoSets(env, customerId) {
  return requireRepositoryFunction(env, "listCustomerPhotoSets")(env, customerId);
}

export function createCustomerPhotoSet(env, customerId, data) {
  return requireRepositoryFunction(env, "createCustomerPhotoSet")(env, customerId, data);
}

export function updateCustomerPhotoSet(env, customerId, setId, data) {
  return requireRepositoryFunction(env, "updateCustomerPhotoSet")(env, customerId, setId, data);
}

export function deleteCustomerPhotoSet(env, customerId, setId) {
  return requireRepositoryFunction(env, "deleteCustomerPhotoSet")(env, customerId, setId);
}

export function uploadCustomerComparisonPhoto(env, customerId, setId, params) {
  return requireRepositoryFunction(env, "uploadCustomerComparisonPhoto")(
    env, customerId, setId, params
  );
}

export function getCustomerPhotoContent(env, customerId, photoId) {
  return requireRepositoryFunction(env, "getCustomerPhotoContent")(env, customerId, photoId);
}

export function deleteCustomerComparisonPhoto(env, customerId, photoId) {
  return requireRepositoryFunction(env, "deleteCustomerComparisonPhoto")(
    env, customerId, photoId
  );
}

export function applyBookingStatusTransition(env, params) {
  return requireRepositoryFunction(env, "applyBookingStatusTransition")(env, params);
}

export function applyOwnerGeneralBookingStatusTransition(env, params) {
  return requireRepositoryFunction(env, "applyOwnerGeneralBookingStatusTransition")(env, params);
}

export function expireOverdueDepositBookings(env, nowInput) {
  return requireRepositoryFunction(env, "expireOverdueDepositBookings")(env, nowInput);
}

export function expireOverdueDepositBookingsForAllTenants(env, nowInput) {
  return requireRepositoryFunction(env, "expireOverdueDepositBookingsForAllTenants")(env, nowInput);
}

export function rescheduleBookingByOwner(env, bookingId, payload) {
  return requireRepositoryFunction(env, "rescheduleBookingByOwner")(env, bookingId, payload);
}

export function listOwnerRescheduleSlots(env, bookingId, date) {
  return requireRepositoryFunction(env, "listOwnerRescheduleSlots")(env, bookingId, date);
}

export function listOwnerAiDailySummaryItems(env, date) {
  return requireRepositoryFunction(env, "listOwnerAiDailySummaryItems")(env, date);
}

export function getOwnerAiMessageDraftContext(env, bookingId) {
  return requireRepositoryFunction(env, "getOwnerAiMessageDraftContext")(env, bookingId);
}

export function createCustomerAiInquiry(env, input) {
  return requireRepositoryFunction(env, "createCustomerAiInquiry")(env, input);
}

export function countDailyCustomerAiInquiries(env, lineUserId) {
  return requireRepositoryFunction(env, "countDailyCustomerAiInquiries")(
    env, lineUserId
  );
}

export function listCustomerAiInquiries(env, lineUserId) {
  return requireRepositoryFunction(env, "listCustomerAiInquiries")(
    env, lineUserId
  );
}

export function listOwnerAiInquiries(env) {
  return requireRepositoryFunction(env, "listOwnerAiInquiries")(env);
}

export function updateOwnerAiInquiryStatus(env, inquiryId, status) {
  return requireRepositoryFunction(env, "updateOwnerAiInquiryStatus")(
    env, inquiryId, status
  );
}

export function sendOwnerAiInquiryReply(env, inquiryId, ownerId, input) {
  return requireRepositoryFunction(env, "sendOwnerAiInquiryReply")(
    env, inquiryId, ownerId, input
  );
}

export function getCustomerBookingReview(env, bookingId, userId) {
  return requireRepositoryFunction(env, "getCustomerBookingReview")(env, bookingId, userId);
}

export function updateCustomerBookingReview(env, bookingId, userId, payload) {
  return requireRepositoryFunction(env, "updateCustomerBookingReview")(
    env, bookingId, userId, payload
  );
}

export function getOwnerBookingReview(env, bookingId) {
  return requireRepositoryFunction(env, "getOwnerBookingReview")(env, bookingId);
}

export function getOwnerAiWorkQueue(env) {
  return requireRepositoryFunction(env, "getOwnerAiWorkQueue")(env);
}

export function exportPaidCustomerData(env) {
  return requireRepositoryFunction(env, "exportPaidCustomerData")(env);
}

export function exportPlatformCustomerData(env, tenantId) {
  return requireRepositoryFunction(env, "exportPlatformCustomerData")(env, tenantId);
}

export function requestOwnerBookingReviewPhoto(env, bookingId, payload) {
  return requireRepositoryFunction(env, "requestOwnerBookingReviewPhoto")(
    env, bookingId, payload
  );
}

export function uploadCustomerBookingReviewPhoto(env, bookingId, userId, bytes, mimeType) {
  return requireRepositoryFunction(env, "uploadCustomerBookingReviewPhoto")(
    env, bookingId, userId, bytes, mimeType
  );
}

export function getOwnerBookingReviewPhotoContent(env, bookingId, photoId) {
  return requireRepositoryFunction(env, "getOwnerBookingReviewPhotoContent")(
    env, bookingId, photoId
  );
}
