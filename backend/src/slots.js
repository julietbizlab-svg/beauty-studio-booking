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
