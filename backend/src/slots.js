/**
 * 時段計算：依每週營業時段與服務時長，產生可預約時間點；
 * 並以時間區間排除與現有預約重疊的開始時間（長時服務連續空檔）。
 */

import { isSlotStartBookable } from "./booking-notice-policy.js";

var WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

/** 既有預約查不到服務時長時的保守占用（分鐘） */
export var CONSERVATIVE_BUSY_DURATION_MINUTES = 180;

/** Owner 改期可用時段固定步進（分鐘）；候選開始時間僅允許 :00／:30 */
export var OWNER_RESCHEDULE_SLOT_STEP_MINUTES = 30;

export function weekdayLabelFromIndex(index) {
  return WEEKDAY_LABELS[index] || "";
}

export function parseTimeToMinutes(timeStr) {
  if (!timeStr) {
    return NaN;
  }
  var parts = String(timeStr).trim().split(":");
  if (parts.length < 2) {
    return NaN;
  }
  return Number(parts[0]) * 60 + Number(parts[1]);
}

export function formatMinutesToTime(minutes) {
  var h = Math.floor(minutes / 60);
  var m = minutes % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

export function buildSlotTimes(startTime, endTime, durationMinutes) {
  var start = parseTimeToMinutes(startTime);
  var end = parseTimeToMinutes(endTime);
  var duration = Number(durationMinutes) || 60;

  if (isNaN(start) || isNaN(end) || duration <= 0 || start >= end) {
    return [];
  }

  var slots = [];
  for (var t = start; t + duration <= end; t += duration) {
    slots.push(formatMinutesToTime(t));
  }
  return slots;
}

/**
 * 以固定 step 產生候選開始時間；每個候選須滿足 start+duration <= 營業結束。
 * Owner 改期使用 step=30，與服務時長解耦。
 */
export function buildSlotTimesWithStep(startTime, endTime, durationMinutes, stepMinutes) {
  var start = parseTimeToMinutes(startTime);
  var end = parseTimeToMinutes(endTime);
  var duration = Number(durationMinutes) || 60;
  var step = Number(stepMinutes) || OWNER_RESCHEDULE_SLOT_STEP_MINUTES;

  if (isNaN(start) || isNaN(end) || duration <= 0 || step <= 0 || start >= end) {
    return [];
  }

  var slots = [];
  for (var t = start; t + duration <= end; t += step) {
    slots.push(formatMinutesToTime(t));
  }
  return slots;
}

/**
 * 將 UTC booking 區間裁切到指定台北日 [dayStartUtc, dayEndUtc)（半開），
 * 再轉為該日牆鐘分鐘 [0, 1440] 的半開 busy interval。
 * 用於 Owner 改期 slots：正確處理前一天跨入、當天跨出、整日涵蓋。
 * 分鐘轉換：start 用 floor、end 用 ceil，保守涵蓋含秒／毫秒的實際重疊。
 * 無效日期、end<=start、或與當日無重疊 → null。
 */
export function buildBusyIntervalClippedToDay(startAtUtc, endAtUtc, dayStartUtc, dayEndUtc) {
  var startMs = Date.parse(String(startAtUtc || ""));
  var endMs = Date.parse(String(endAtUtc || ""));
  var dayStartMs = Date.parse(String(dayStartUtc || ""));
  var dayEndMs = Date.parse(String(dayEndUtc || ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  if (!Number.isFinite(dayStartMs) || !Number.isFinite(dayEndMs) || dayEndMs <= dayStartMs) {
    return null;
  }
  // [start, end) ∩ [dayStart, dayEnd)
  var clippedStart = Math.max(startMs, dayStartMs);
  var clippedEnd = Math.min(endMs, dayEndMs);
  if (clippedStart >= clippedEnd) {
    return null;
  }
  var startMinutes = Math.floor((clippedStart - dayStartMs) / 60000);
  var endMinutes = Math.ceil((clippedEnd - dayStartMs) / 60000);
  if (startMinutes < 0) {
    startMinutes = 0;
  }
  if (endMinutes > 1440) {
    endMinutes = 1440;
  }
  if (endMinutes <= startMinutes) {
    return null;
  }
  return { start: startMinutes, end: endMinutes };
}

/**
 * 半開區間 [start, end) 是否重疊。
 * 首尾相接不算重疊（例如 10:00–11:00 與 11:00–12:00）。
 */
export function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

/**
 * 解析查不到時長時的保守占用長度。
 */
export function resolveBusyDurationMinutes(knownDuration, fallbackDurationMinutes) {
  var known = Number(knownDuration);
  if (known > 0) {
    return known;
  }
  var fallback = Number(fallbackDurationMinutes);
  if (fallback > 0) {
    return Math.max(fallback, CONSERVATIVE_BUSY_DURATION_MINUTES);
  }
  return CONSERVATIVE_BUSY_DURATION_MINUTES;
}

/**
 * 由開始時間與時長建立 { start, end }（分鐘）；無效則回 null。
 */
export function toBusyInterval(startTime, durationMinutes) {
  var start = parseTimeToMinutes(startTime);
  var duration = Number(durationMinutes);
  if (isNaN(start) || !(duration > 0)) {
    return null;
  }
  return { start: start, end: start + duration };
}

/**
 * 同日已確認預約 → busy intervals。
 * durationByServiceId: { [serviceId]: minutes }
 * 查不到時長 → 用 resolveBusyDurationMinutes 保守處理。
 */
export function buildBusyIntervalsFromBookings(bookings, durationByServiceId, fallbackDurationMinutes) {
  var map = durationByServiceId || {};
  var intervals = [];

  (bookings || []).forEach(function (booking) {
    if (!booking || !booking.time) {
      return;
    }
    var known = booking.serviceId ? map[booking.serviceId] : null;
    var duration = resolveBusyDurationMinutes(known, fallbackDurationMinutes);
    var interval = toBusyInterval(booking.time, duration);
    if (interval) {
      intervals.push(interval);
    }
  });

  return intervals;
}

/**
 * 候選開始時刻 + 服務時長，是否與任一 busy 區間重疊。
 */
export function candidateOverlapsBusy(startTime, durationMinutes, busyIntervals) {
  var candidate = toBusyInterval(startTime, durationMinutes);
  if (!candidate) {
    return true;
  }
  var list = busyIntervals || [];
  for (var i = 0; i < list.length; i++) {
    var busy = list[i];
    if (!busy) {
      continue;
    }
    if (rangesOverlap(candidate.start, candidate.end, busy.start, busy.end)) {
      return true;
    }
  }
  return false;
}

/**
 * 過濾可預約開始時間：排除已過時刻、與 busy 區間重疊者。
 */
export function filterAvailableSlots(allSlots, durationMinutes, busyIntervals, nowDateStr, nowMinutes) {
  var duration = Number(durationMinutes) || 60;

  return (allSlots || []).filter(function (slot) {
    if (nowDateStr) {
      var slotMinutes = parseTimeToMinutes(slot);
      if (!isNaN(slotMinutes) && slotMinutes <= nowMinutes) {
        return false;
      }
    }
    if (candidateOverlapsBusy(slot, duration, busyIntervals)) {
      return false;
    }
    return true;
  });
}

export function buildAllSlotTimesForDay(daySlots, durationMinutes) {
  var allTimes = [];
  (daySlots || []).forEach(function (slot) {
    var times = buildSlotTimes(slot.startTime, slot.endTime, durationMinutes);
    allTimes = allTimes.concat(times);
  });
  return Array.from(new Set(allTimes)).sort();
}

export function buildAllSlotTimesForDayWithStep(daySlots, durationMinutes, stepMinutes) {
  var allTimes = [];
  (daySlots || []).forEach(function (slot) {
    var times = buildSlotTimesWithStep(
      slot.startTime,
      slot.endTime,
      durationMinutes,
      stepMinutes
    );
    allTimes = allTimes.concat(times);
  });
  return Array.from(new Set(allTimes)).sort();
}

/**
 * 依業主設定的提前預約天數過濾時段（精確天數 × 24h）。
 * days=0 仍排除已開始／已過去時段。
 */
export function filterSlotsByBookingNotice(allSlots, dateStr, noticeDays, nowUtc) {
  var now = nowUtc || new Date();
  return (allSlots || []).filter(function (slot) {
    return isSlotStartBookable(dateStr, slot, noticeDays, now);
  });
}

/**
 * 單日可預約摘要（與 GET /api/slots 計算邏輯一致）
 * params.busyIntervals: [{ start, end }, ...]
 * params.minNoticeDays: 業主設定提前預約天數（可選）
 * params.nowUtc: 用於 min notice 計算的現在時間（可選，預設 new Date()）
 */
export function computeDayAvailability(params) {
  var date = params.date;
  var todayStr = params.todayStr;
  var nowMinutes = params.nowMinutes;
  var daySlots = params.daySlots || [];
  var durationMinutes = params.durationMinutes;
  var busyIntervals = params.busyIntervals || [];
  var minNoticeDays = params.minNoticeDays;
  var nowUtc = params.nowUtc || new Date();

  if (date < todayStr) {
    return { bookable: false, slotCount: 0, reason: "past" };
  }

  if (!daySlots.length) {
    return { bookable: false, slotCount: 0, reason: "closed" };
  }

  var allTimes = buildAllSlotTimesForDay(daySlots, durationMinutes);
  var afterNotice = minNoticeDays != null
    ? filterSlotsByBookingNotice(allTimes, date, minNoticeDays, nowUtc)
    : allTimes;
  var available = filterAvailableSlots(
    afterNotice,
    durationMinutes,
    busyIntervals,
    date === todayStr ? todayStr : null,
    date === todayStr ? nowMinutes : null
  );

  if (available.length > 0) {
    return { bookable: true, slotCount: available.length, reason: null };
  }

  if (date === todayStr) {
    var withoutTimeFilter = filterAvailableSlots(
      afterNotice,
      durationMinutes,
      busyIntervals,
      null,
      null
    );
    if (withoutTimeFilter.length > 0) {
      return { bookable: false, slotCount: 0, reason: "today_past" };
    }
  }

  if (minNoticeDays != null && afterNotice.length === 0 && allTimes.length > 0) {
    return { bookable: false, slotCount: 0, reason: "min_notice" };
  }

  return { bookable: false, slotCount: 0, reason: "full" };
}

/**
 * durationByServiceId / fallbackBusyDuration：供同日已確認預約建立 busy intervals。
 */
export function buildMonthAvailability(
  month,
  weeklySlots,
  durationMinutes,
  bookingsByDate,
  todayStr,
  nowMinutes,
  getWeekdayLabelForDate,
  durationByServiceId,
  fallbackBusyDuration,
  minNoticeDays,
  nowUtc
) {
  var parts = month.split("-");
  var year = Number(parts[0]);
  var mon = Number(parts[1]);
  var daysInMonth = new Date(year, mon, 0).getDate();
  var days = {};
  var fallback = fallbackBusyDuration != null
    ? fallbackBusyDuration
    : Math.max(Number(durationMinutes) || 60, CONSERVATIVE_BUSY_DURATION_MINUTES);
  var now = nowUtc || new Date();

  for (var day = 1; day <= daysInMonth; day++) {
    var date = year + "-" + String(mon).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    var weekdayLabel = getWeekdayLabelForDate(date);
    var daySlots = weeklySlots.filter(function (s) { return s.weekday === weekdayLabel; });
    var dayBookings = bookingsByDate[date] || [];
    var busyIntervals = buildBusyIntervalsFromBookings(
      dayBookings,
      durationByServiceId,
      fallback
    );

    days[date] = computeDayAvailability({
      date: date,
      todayStr: todayStr,
      nowMinutes: nowMinutes,
      daySlots: daySlots,
      durationMinutes: durationMinutes,
      busyIntervals: busyIntervals,
      minNoticeDays: minNoticeDays,
      nowUtc: now
    });
  }

  return days;
}

export function getNowMinutesInTaipei() {
  var parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  var hour = 0;
  var minute = 0;
  parts.forEach(function (p) {
    if (p.type === "hour") hour = Number(p.value);
    if (p.type === "minute") minute = Number(p.value);
  });
  return hour * 60 + minute;
}
