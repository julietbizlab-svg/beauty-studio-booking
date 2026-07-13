/**
 * 時段計算：依每週營業時段與服務時長，產生可預約時間點
 */

var WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

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

export function filterAvailableSlots(allSlots, bookedTimes, nowDateStr, nowMinutes) {
  var bookedSet = new Set(bookedTimes || []);

  return (allSlots || []).filter(function (slot) {
    if (bookedSet.has(slot)) {
      return false;
    }
    if (nowDateStr) {
      var slotMinutes = parseTimeToMinutes(slot);
      if (!isNaN(slotMinutes) && slotMinutes <= nowMinutes) {
        return false;
      }
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

/**
 * 單日可預約摘要（與 GET /api/slots 計算邏輯一致）
 */
export function computeDayAvailability(params) {
  var date = params.date;
  var todayStr = params.todayStr;
  var nowMinutes = params.nowMinutes;
  var daySlots = params.daySlots || [];
  var durationMinutes = params.durationMinutes;
  var bookedTimes = params.bookedTimes || [];

  if (date < todayStr) {
    return { bookable: false, slotCount: 0, reason: "past" };
  }

  if (!daySlots.length) {
    return { bookable: false, slotCount: 0, reason: "closed" };
  }

  var allTimes = buildAllSlotTimesForDay(daySlots, durationMinutes);
  var available = filterAvailableSlots(
    allTimes,
    bookedTimes,
    date === todayStr ? todayStr : null,
    date === todayStr ? nowMinutes : null
  );

  if (available.length > 0) {
    return { bookable: true, slotCount: available.length, reason: null };
  }

  if (date === todayStr) {
    var withoutTimeFilter = filterAvailableSlots(allTimes, bookedTimes, null, null);
    if (withoutTimeFilter.length > 0) {
      return { bookable: false, slotCount: 0, reason: "today_past" };
    }
  }

  return { bookable: false, slotCount: 0, reason: "full" };
}

export function buildMonthAvailability(month, weeklySlots, durationMinutes, bookingsByDate, todayStr, nowMinutes, getWeekdayLabelForDate) {
  var parts = month.split("-");
  var year = Number(parts[0]);
  var mon = Number(parts[1]);
  var daysInMonth = new Date(year, mon, 0).getDate();
  var days = {};

  for (var day = 1; day <= daysInMonth; day++) {
    var date = year + "-" + String(mon).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    var weekdayLabel = getWeekdayLabelForDate(date);
    var daySlots = weeklySlots.filter(function (s) { return s.weekday === weekdayLabel; });
    var dayBookings = bookingsByDate[date] || [];
    var bookedTimes = dayBookings.map(function (b) { return b.time; });

    days[date] = computeDayAvailability({
      date: date,
      todayStr: todayStr,
      nowMinutes: nowMinutes,
      daySlots: daySlots,
      durationMinutes: durationMinutes,
      bookedTimes: bookedTimes
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
