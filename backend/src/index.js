/**
 * 美業工作室 — Cloudflare Workers API
 */
import {
  ensureNotionEnv,
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
  getTodayBookingsForOwner,
  getOwnerBookingsForMonth,
  getSettings,
  updateSettings,
  getServiceById
} from "./notion.js";
import { requireOwnerFromRequest } from "./owner-auth.js";
import {
  weekdayLabelFromIndex,
  buildAllSlotTimesForDay,
  computeDayAvailability,
  buildMonthAvailability,
  filterAvailableSlots,
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
          notion: Boolean(env.NOTION_TOKEN)
        }, corsHeaders);
      }

      if (url.pathname === "/api/settings" && request.method === "GET") {
        ensureNotionEnv(env);
        var settings = await getSettings(env);
        return jsonResponse(settings, corsHeaders);
      }

      if (url.pathname === "/api/services" && request.method === "GET") {
        ensureNotionEnv(env);
        var services = await listServices(env, true);
        return jsonResponse(services, corsHeaders);
      }

      if (url.pathname === "/api/slots/month" && request.method === "GET") {
        ensureNotionEnv(env);
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

        var monthTodayStr = getTaipeiDateString();
        var monthNowMinutes = getNowMinutesInTaipei();
        var monthDays = buildMonthAvailability(
          monthParam,
          monthWeeklySlots,
          monthService.durationMinutes,
          bookingsByDate,
          monthTodayStr,
          monthNowMinutes,
          function (d) { return weekdayLabelFromIndex(getTaipeiWeekdayIndex(d)); }
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
        ensureNotionEnv(env);
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
        var bookedTimes = bookings.map(function (b) { return b.time; });

        var todayStr = getTaipeiDateString();
        var nowMinutes = getNowMinutesInTaipei();
        var daySummary = computeDayAvailability({
          date: date,
          todayStr: todayStr,
          nowMinutes: nowMinutes,
          daySlots: daySlots,
          durationMinutes: service.durationMinutes,
          bookedTimes: bookedTimes
        });

        if (!daySlots.length) {
          return jsonResponse({ date: date, slots: [], message: "此日期未開放預約" }, corsHeaders);
        }

        var allTimes = buildAllSlotTimesForDay(daySlots, service.durationMinutes);
        var available = filterAvailableSlots(
          allTimes,
          bookedTimes,
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

      if (url.pathname === "/api/bookings" && request.method === "POST") {
        ensureNotionEnv(env);
        var bookBody = await readJson(request);
        var bookResult = await createBooking(env, bookBody);
        return jsonResponse(bookResult, corsHeaders);
      }

      if (url.pathname === "/api/bookings/me" && request.method === "GET") {
        ensureNotionEnv(env);
        var meUserId = url.searchParams.get("userId");
        if (!meUserId) {
          return jsonResponse({ ok: false, message: "缺少 userId" }, corsHeaders, 400);
        }
        var myBookings = await getUserBookings(env, meUserId);
        return jsonResponse(myBookings, corsHeaders);
      }

      if (url.pathname === "/api/bookings/cancel" && request.method === "POST") {
        ensureNotionEnv(env);
        var cancelBody = await readJson(request);
        var cancelResult = await cancelBooking(env, cancelBody.userId, cancelBody.bookingId);
        return jsonResponse(cancelResult, corsHeaders);
      }

      if (url.pathname === "/api/owner/bookings/month" && request.method === "GET") {
        ensureNotionEnv(env);
        await requireOwnerFromRequest(request, env);

        var month = url.searchParams.get("month");
        if (!month) {
          return jsonResponse({ ok: false, message: "缺少 month 參數（YYYY-MM）" }, corsHeaders, 400);
        }
        var monthBookings = await getOwnerBookingsForMonth(env, month);
        return jsonResponse(monthBookings, corsHeaders);
      }

      if (url.pathname === "/api/owner/today" && request.method === "GET") {
        ensureNotionEnv(env);
        await requireOwnerFromRequest(request, env);

        var targetDate = url.searchParams.get("date") || getTaipeiDateString();
        var todayList = await getTodayBookingsForOwner(env, targetDate);
        return jsonResponse({
          date: targetDate,
          bookings: todayList
        }, corsHeaders);
      }

      if (url.pathname === "/api/owner/services" && request.method === "GET") {
        ensureNotionEnv(env);
        await requireOwnerFromRequest(request, env);
        var allServices = await listServices(env, false);
        return jsonResponse(allServices, corsHeaders);
      }

      if (url.pathname === "/api/owner/services" && request.method === "POST") {
        ensureNotionEnv(env);
        var ownerCreateBody = await readJson(request);
        await requireOwnerFromRequest(request, env);
        var newService = await createService(env, ownerCreateBody);
        return jsonResponse({ ok: true, service: newService }, corsHeaders);
      }

      var servicePatchMatch = url.pathname.match(/^\/api\/owner\/services\/([^/]+)$/);
      if (servicePatchMatch && request.method === "PATCH") {
        ensureNotionEnv(env);
        var ownerPatchBody = await readJson(request);
        await requireOwnerFromRequest(request, env);
        var patched = await updateService(env, servicePatchMatch[1], ownerPatchBody);
        return jsonResponse({ ok: true, service: patched }, corsHeaders);
      }

      if (url.pathname === "/api/owner/slots" && request.method === "GET") {
        ensureNotionEnv(env);
        await requireOwnerFromRequest(request, env);
        var currentSlots = await listWeeklySlots(env);
        return jsonResponse(currentSlots, corsHeaders);
      }

      if (url.pathname === "/api/owner/slots" && request.method === "POST") {
        ensureNotionEnv(env);
        var slotsBody = await readJson(request);
        await requireOwnerFromRequest(request, env);
        var savedSlots = await replaceWeeklySlots(env, slotsBody.slots || []);
        return jsonResponse({ ok: true, slots: savedSlots }, corsHeaders);
      }

      if (url.pathname === "/api/owner/settings" && request.method === "GET") {
        ensureNotionEnv(env);
        await requireOwnerFromRequest(request, env);
        var ownerSettings = await getSettings(env);
        return jsonResponse(ownerSettings, corsHeaders);
      }

      if (url.pathname === "/api/owner/settings" && request.method === "PATCH") {
        ensureNotionEnv(env);
        var settingsBody = await readJson(request);
        await requireOwnerFromRequest(request, env);
        var updatedSettings = await updateSettings(env, settingsBody);
        return jsonResponse({ ok: true, settings: updatedSettings }, corsHeaders);
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
