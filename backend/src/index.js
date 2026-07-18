/**
 * 美業工作室 — Cloudflare Workers API
 */
import {
  ensureDataEnv,
  getDataBackendName,
  listServices,
  createService,
  updateService,
  listWeeklySlots,
  replaceWeeklySlots,
  getActiveBookingsByDate,
  getActiveBookingsForMonth,
  getUserBookings,
  createBooking,
  cancelBooking,
  cancelBookingByOwner,
  getTodayBookingsForOwner,
  getOwnerBookingsForMonth,
  getOwnerCustomersFromBookings,
  getOwnerCustomerBookings,
  getSettings,
  updateSettings,
  getServiceById,
  getServiceDurationMap,
  getCustomerProfileByUserId,
  updateCustomerByOwner,
  previewCustomerImport,
  commitCustomerImport
} from "./data-repository.js";
import { requireOwnerFromRequest } from "./owner-auth.js";
import { requireCustomerFromRequest } from "./liff-verify.js";
import {
  weekdayLabelFromIndex,
  buildAllSlotTimesForDay,
  computeDayAvailability,
  buildMonthAvailability,
  filterAvailableSlots,
  buildBusyIntervalsFromBookings,
  CONSERVATIVE_BUSY_DURATION_MINUTES,
  getNowMinutesInTaipei
} from "./slots.js";
import { getTaipeiDateString, getTaipeiWeekdayIndex } from "./owner-auth.js";

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      if (url.pathname === "/api/health") {
        return jsonResponse({
          ok: true,
          studio: env.STUDIO_NAME || "美業工作室",
          notion: Boolean(env.NOTION_TOKEN),
          dataBackend: getDataBackendName(env)
        }, corsHeaders);
      }

      if (url.pathname === "/api/settings" && request.method === "GET") {
        ensureDataEnv(env);
        var settings = await getSettings(env);
        return jsonResponse(settings, corsHeaders);
      }

      if (url.pathname === "/api/services" && request.method === "GET") {
        ensureDataEnv(env);
        var services = await listServices(env, true);
        return jsonResponse(services, corsHeaders);
      }

      if (url.pathname === "/api/slots/month" && request.method === "GET") {
        ensureDataEnv(env);
        var monthParam = url.searchParams.get("month");
        var monthServiceId = url.searchParams.get("serviceId");

        if (!monthParam) {
          return jsonResponse({ ok: false, message: "缺少 month 參數（YYYY-MM）" }, corsHeaders, 400);
        }
        if (!monthServiceId) {
          return jsonResponse({ ok: false, message: "缺少 serviceId 參數" }, corsHeaders, 400);
        }

        var monthService = await getServiceById(env, monthServiceId);
        if (monthService.status !== "上架") {
          return jsonResponse({ ok: false, message: "服務不存在或已下架" }, corsHeaders, 404);
        }

        var monthWeeklySlots = await listWeeklySlots(env);
        var monthBookingsResult = await getActiveBookingsForMonth(env, monthParam);
        var bookingsByDate = {};
        monthBookingsResult.bookings.forEach(function (b) {
          if (!bookingsByDate[b.date]) {
            bookingsByDate[b.date] = [];
          }
          bookingsByDate[b.date].push(b);
        });

        var monthDurationMap = await getServiceDurationMap(
          env,
          monthBookingsResult.bookings.map(function (b) { return b.serviceId; })
        );
        var monthFallbackBusy = Math.max(
          Number(monthService.durationMinutes) || 60,
          CONSERVATIVE_BUSY_DURATION_MINUTES
        );

        var monthTodayStr = getTaipeiDateString();
        var monthNowMinutes = getNowMinutesInTaipei();
        var monthDays = buildMonthAvailability(
          monthParam,
          monthWeeklySlots,
          monthService.durationMinutes,
          bookingsByDate,
          monthTodayStr,
          monthNowMinutes,
          function (d) { return weekdayLabelFromIndex(getTaipeiWeekdayIndex(d)); },
          monthDurationMap,
          monthFallbackBusy
        );

        return jsonResponse({
          ok: true,
          month: monthBookingsResult.range.month,
          serviceId: monthServiceId,
          durationMinutes: monthService.durationMinutes,
          days: monthDays
        }, corsHeaders);
      }

      if (url.pathname === "/api/slots" && request.method === "GET") {
        ensureDataEnv(env);
        var date = url.searchParams.get("date");
        var serviceId = url.searchParams.get("serviceId");

        if (!date) {
          return jsonResponse({ ok: false, message: "缺少 date 參數（YYYY-MM-DD）" }, corsHeaders, 400);
        }
        if (!serviceId) {
          return jsonResponse({ ok: false, message: "缺少 serviceId 參數" }, corsHeaders, 400);
        }

        var service = await getServiceById(env, serviceId);
        var weekdayIndex = getTaipeiWeekdayIndex(date);
        var weekdayLabel = weekdayLabelFromIndex(weekdayIndex);
        var weeklySlots = await listWeeklySlots(env);
        var daySlots = weeklySlots.filter(function (s) { return s.weekday === weekdayLabel; });

        var bookings = await getActiveBookingsByDate(env, date);
        var durationMap = await getServiceDurationMap(
          env,
          bookings.map(function (b) { return b.serviceId; })
        );
        var fallbackBusy = Math.max(
          Number(service.durationMinutes) || 60,
          CONSERVATIVE_BUSY_DURATION_MINUTES
        );
        var busyIntervals = buildBusyIntervalsFromBookings(
          bookings,
          durationMap,
          fallbackBusy
        );

        var todayStr = getTaipeiDateString();
        var nowMinutes = getNowMinutesInTaipei();
        var daySummary = computeDayAvailability({
          date: date,
          todayStr: todayStr,
          nowMinutes: nowMinutes,
          daySlots: daySlots,
          durationMinutes: service.durationMinutes,
          busyIntervals: busyIntervals
        });

        if (!daySlots.length) {
          return jsonResponse({ date: date, slots: [], message: "此日期未開放預約" }, corsHeaders);
        }

        var allTimes = buildAllSlotTimesForDay(daySlots, service.durationMinutes);
        var available = filterAvailableSlots(
          allTimes,
          service.durationMinutes,
          busyIntervals,
          date === todayStr ? todayStr : null,
          date === todayStr ? nowMinutes : null
        );

        return jsonResponse({
          date: date,
          serviceId: serviceId,
          durationMinutes: service.durationMinutes,
          slots: available,
          bookable: daySummary.bookable,
          reason: daySummary.reason
        }, corsHeaders);
      }

      // 客人 API：一律以驗證後 token 的 sub 為 userId，
      // body／query 中的 userId 一律忽略，不能覆蓋已驗證身分。
      if (url.pathname === "/api/bookings" && request.method === "POST") {
        ensureDataEnv(env);
        var bookCustomer = await requireCustomerFromRequest(request, env);
        var bookBody = await readJson(request);
        // LINE 身分與 LINE profile metadata（暱稱、頭像）一律以
        // requireCustomerFromRequest 驗證結果為唯一可信來源；
        // client body 的同名欄位不可優先、不可進入 SQL bind。
        var bookResult = await createBooking(
          env,
          Object.assign({}, bookBody, {
            userId: bookCustomer.userId,
            displayName: bookCustomer.name,
            lineDisplayName: bookCustomer.name,
            lineNickname: bookCustomer.name,
            picture: bookCustomer.picture,
            pictureUrl: bookCustomer.picture
          })
        );
        return jsonResponse(bookResult, corsHeaders);
      }

      if (url.pathname === "/api/bookings/me" && request.method === "GET") {
        ensureDataEnv(env);
        var meCustomer = await requireCustomerFromRequest(request, env);
        var myBookings = await getUserBookings(env, meCustomer.userId);
        return jsonResponse(myBookings, corsHeaders);
      }

      if (url.pathname === "/api/bookings/cancel" && request.method === "POST") {
        ensureDataEnv(env);
        var cancelCustomer = await requireCustomerFromRequest(request, env);
        var cancelBody = await readJson(request);
        var cancelResult = await cancelBooking(env, cancelCustomer.userId, cancelBody.bookingId);
        return jsonResponse(cancelResult, corsHeaders);
      }

      if (url.pathname === "/api/customer/me" && request.method === "GET") {
        ensureDataEnv(env);
        var profileCustomer = await requireCustomerFromRequest(request, env);
        var profile = await getCustomerProfileByUserId(env, profileCustomer.userId);
        return jsonResponse({
          ok: true,
          exists: profile.exists,
          customer: profile.customer
        }, corsHeaders);
      }

      if (url.pathname === "/api/owner/bookings/cancel" && request.method === "POST") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var ownerCancelBody = await readJson(request);
        var ownerCancelResult = await cancelBookingByOwner(
          env,
          ownerCancelBody.bookingId,
          ownerCancelBody.reason || ownerCancelBody.cancelReason
        );
        return jsonResponse(ownerCancelResult, corsHeaders);
      }

      if (url.pathname === "/api/owner/bookings/month" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);

        var month = url.searchParams.get("month");
        if (!month) {
          return jsonResponse({ ok: false, message: "缺少 month 參數（YYYY-MM）" }, corsHeaders, 400);
        }
        var monthBookings = await getOwnerBookingsForMonth(env, month);
        return jsonResponse(monthBookings, corsHeaders);
      }

      if (url.pathname === "/api/owner/today" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);

        var targetDate = url.searchParams.get("date") || getTaipeiDateString();
        var todayList = await getTodayBookingsForOwner(env, targetDate);
        return jsonResponse({
          date: targetDate,
          bookings: todayList
        }, corsHeaders);
      }

      if (url.pathname === "/api/owner/services" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var allServices = await listServices(env, false);
        return jsonResponse(allServices, corsHeaders);
      }

      if (url.pathname === "/api/owner/services" && request.method === "POST") {
        ensureDataEnv(env);
        var ownerCreateBody = await readJson(request);
        await requireOwnerFromRequest(request, env);
        var newService = await createService(env, ownerCreateBody);
        return jsonResponse({ ok: true, service: newService }, corsHeaders);
      }

      var servicePatchMatch = url.pathname.match(/^\/api\/owner\/services\/([^/]+)$/);
      if (servicePatchMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        var ownerPatchBody = await readJson(request);
        await requireOwnerFromRequest(request, env);
        var patched = await updateService(env, servicePatchMatch[1], ownerPatchBody);
        return jsonResponse({ ok: true, service: patched }, corsHeaders);
      }

      if (url.pathname === "/api/owner/slots" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var currentSlots = await listWeeklySlots(env);
        return jsonResponse(currentSlots, corsHeaders);
      }

      if (url.pathname === "/api/owner/slots" && request.method === "POST") {
        ensureDataEnv(env);
        var slotsBody = await readJson(request);
        await requireOwnerFromRequest(request, env);
        var savedSlots = await replaceWeeklySlots(env, slotsBody.slots || []);
        return jsonResponse({ ok: true, slots: savedSlots }, corsHeaders);
      }

      if (url.pathname === "/api/owner/settings" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var ownerSettings = await getSettings(env);
        return jsonResponse(ownerSettings, corsHeaders);
      }

      if (url.pathname === "/api/owner/settings" && request.method === "PATCH") {
        ensureDataEnv(env);
        var settingsBody = await readJson(request);
        await requireOwnerFromRequest(request, env);
        var updatedSettings = await updateSettings(env, settingsBody);
        return jsonResponse({ ok: true, settings: updatedSettings }, corsHeaders);
      }

      if (url.pathname === "/api/owner/customers" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var customerQuery = url.searchParams.get("q") || "";
        var customerList = await getOwnerCustomersFromBookings(env, customerQuery);
        return jsonResponse(customerList, corsHeaders);
      }

      // 客戶 CSV 匯入：不 log CSV、canonicalString 或完整電話；
      // 回應中的電話只出現在 maskedPreview 遮罩值
      if (url.pathname === "/api/owner/customers/import/preview" && request.method === "POST") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var importPreviewBody = await readJson(request);
        var importPreview = await previewCustomerImport(env, importPreviewBody);
        return jsonResponse(importPreview, corsHeaders);
      }

      if (url.pathname === "/api/owner/customers/import/commit" && request.method === "POST") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var importCommitBody = await readJson(request);
        var importCommit = await commitCustomerImport(env, importCommitBody);
        return jsonResponse(importCommit, corsHeaders);
      }

      var ownerCustomerPatchMatch = url.pathname.match(/^\/api\/owner\/customers\/([^/]+)$/);
      if (ownerCustomerPatchMatch && request.method === "PATCH") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var ownerCustomerBody = await readJson(request);
        var updatedCustomer = await updateCustomerByOwner(
          env,
          decodeURIComponent(ownerCustomerPatchMatch[1]),
          ownerCustomerBody
        );
        return jsonResponse(updatedCustomer, corsHeaders);
      }

      if (url.pathname === "/api/owner/customer-bookings" && request.method === "GET") {
        ensureDataEnv(env);
        await requireOwnerFromRequest(request, env);
        var customerUserId = url.searchParams.get("userId");
        if (!customerUserId) {
          return jsonResponse({ ok: false, message: "缺少 userId" }, corsHeaders, 400);
        }
        var customerBookings = await getOwnerCustomerBookings(env, customerUserId);
        return jsonResponse(customerBookings, corsHeaders);
      }

      return jsonResponse({ ok: false, message: "找不到此 API 路徑" }, corsHeaders, 404);
    } catch (error) {
      var status = error.status || 500;
      var message = error.message || "伺服器發生錯誤";
      return jsonResponse({ ok: false, message: message }, corsHeaders, status);
    }
  }
};

async function readJson(request) {
  try {
    return await request.json();
  } catch (ignore) {
    throw Object.assign(new Error("請求格式錯誤，需為 JSON"), { status: 400 });
  }
}

function jsonResponse(data, corsHeaders, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders)
  });
}
