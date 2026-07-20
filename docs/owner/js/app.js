/**
 * 業主端管理主程式
 */
(function () {
  "use strict";

  var WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

  var state = {
    user: null,
    calendarMonth: "",
    selectedDate: "",
    monthDays: {},
    services: [],
    slots: [],
    settings: null,
    editingServiceId: null,
    customers: [],
    customerQuery: "",
    selectedCustomer: null,
    customerSearchTimer: null
  };

  var els = {};

  function $(id) { return document.getElementById(id); }

  function setStatus(type, message) {
    var el = els.status;
    if (!message) {
      el.className = "status hidden";
      el.textContent = "";
      return;
    }
    el.className = "status " + type;
    el.textContent = message;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDateZh(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    return p[0] + "/" + p[1] + "/" + p[2];
  }

  function getTodayIso() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  function getWeekdayLabel(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return "週" + WEEKDAYS[date.getDay()];
  }

  function pad2(num) {
    return String(num).padStart(2, "0");
  }

  function getCurrentMonthIso() {
    return getTodayIso().slice(0, 7);
  }

  function formatMonthTitle(month) {
    var parts = month.split("-");
    return parts[0] + "年" + Number(parts[1]) + "月";
  }

  function addMonths(month, delta) {
    var parts = month.split("-");
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1 + delta, 1);
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1);
  }

  function buildCalendarCells(month) {
    var parts = month.split("-");
    var year = Number(parts[0]);
    var mon = Number(parts[1]);
    var firstDow = new Date(year, mon - 1, 1).getDay();
    var daysInMonth = new Date(year, mon, 0).getDate();
    var cells = [];

    for (var i = 0; i < firstDow; i++) {
      cells.push({ empty: true });
    }
    for (var day = 1; day <= daysInMonth; day++) {
      cells.push({
        empty: false,
        date: year + "-" + pad2(mon) + "-" + pad2(day)
      });
    }
    return cells;
  }

  function getDayData(date) {
    return state.monthDays[date] || { confirmedCount: 0, canceledCount: 0, bookings: [] };
  }

  function updateBookingDateSummary() {
    var date = state.selectedDate;
    if (!els.bookingDateSummary || !date) {
      return;
    }
    var dayData = getDayData(date);
    var total = dayData.bookings.length;
    els.bookingDateSummary.textContent =
      formatDateZh(date) + "（" + getWeekdayLabel(date) + "）預約 — 共 " + total + " 筆";
  }

  function renderCalendar() {
    if (!els.calendarGrid) {
      return;
    }
    var month = state.calendarMonth;
    var today = getTodayIso();
    if (els.calendarMonthLabel) {
      els.calendarMonthLabel.textContent = formatMonthTitle(month);
    }

    var cells = buildCalendarCells(month);
    els.calendarGrid.innerHTML = cells.map(function (cell) {
      if (cell.empty) {
        return '<div class="calendar-cell calendar-cell--empty"></div>';
      }
      var dayData = getDayData(cell.date);
      var classes = ["calendar-day"];
      if (cell.date === state.selectedDate) {
        classes.push("calendar-day--selected");
      }
      if (cell.date === today) {
        classes.push("calendar-day--today");
      }
      if (dayData.confirmedCount > 0) {
        classes.push("calendar-day--has-confirmed");
      }
      var dayNum = Number(cell.date.split("-")[2]);
      var dot = dayData.confirmedCount > 0 ? '<span class="calendar-dot"></span>' : "";
      return (
        '<button type="button" class="' + classes.join(" ") + '" data-date="' + cell.date + '">' +
          '<span class="calendar-day-num">' + dayNum + "</span>" +
          dot +
        "</button>"
      );
    }).join("");

    els.calendarGrid.querySelectorAll(".calendar-day").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectBookingDate(btn.getAttribute("data-date"));
      });
    });
  }

  var cancelModalState = { bookingId: "" };
  var transitionBusy = false;
  var rescheduleBusy = false;
  var rescheduleModalState = {
    bookingId: "",
    customerName: "",
    serviceName: "",
    date: "",
    time: ""
  };

  var OWNER_STAFF_TRANSITION_UI = {
    checked_in: {
      label: "客人報到",
      requiresConfirm: false,
      successMessage: "已標記客人報到"
    },
    completed: {
      label: "標記完成",
      requiresConfirm: true,
      confirmMessage: "確定將此預約標記為已完成？",
      successMessage: "已標記預約完成"
    },
    confirmed: {
      label: "升級為正式確認",
      requiresConfirm: false,
      successMessage: "已升級為正式確認"
    },
    no_show: {
      label: "未到",
      requiresConfirm: true,
      confirmMessage: "確定將此預約標記為未到？",
      successMessage: "已標記客人未到"
    }
  };

  function getOwnerStaffTransitionActions(internalStatus) {
    var allowedByStatus = {
      confirmed: ["checked_in", "no_show"],
      checked_in: ["completed"],
      pending: ["confirmed", "checked_in"]
    };
    var targets = allowedByStatus[internalStatus] || [];
    return targets.map(function (toStatus) {
      var ui = OWNER_STAFF_TRANSITION_UI[toStatus] || { label: toStatus };
      return {
        toStatus: toStatus,
        label: ui.label,
        requiresConfirm: !!ui.requiresConfirm,
        confirmMessage: ui.confirmMessage || "",
        successMessage: ui.successMessage || "已更新預約狀態"
      };
    });
  }

  function ownerBookingCardClass(booking) {
    if (booking.status === "已取消") return "booking-card--cancelled";
    if (booking.internalStatus === "no_show" || booking.status === "未到") {
      return "booking-card--noshow";
    }
    if (booking.internalStatus === "completed") return "booking-card--completed";
    return "booking-card--confirmed";
  }

  function ownerBookingStatusClass(booking) {
    if (booking.status === "已取消") return "booking-status cancelled";
    if (booking.internalStatus === "no_show" || booking.status === "未到") {
      return "booking-status noshow";
    }
    if (booking.internalStatus === "completed") return "booking-status completed";
    if (booking.internalStatus === "checked_in") return "booking-status checked-in";
    return "booking-status confirmed";
  }

  function ownerBookingStatusLabel(booking) {
    if (booking.statusLabel) return booking.statusLabel;
    return booking.status || "已確認";
  }

  async function submitBookingTransition(bookingId, action) {
    if (transitionBusy || !bookingId || !action) return;
    if (action.requiresConfirm &&
        !confirm(action.confirmMessage || "確定要更新此預約狀態？")) {
      return;
    }
    transitionBusy = true;
    renderDayBookings();
    setStatus("info", "更新狀態中…");
    try {
      await window.ownerApi.transitionBookingStatus(bookingId, action.toStatus);
      setStatus("success", action.successMessage || "已更新預約狀態");
      await refreshCalendarBookings();
    } catch (error) {
      setStatus("error", error.message);
    } finally {
      transitionBusy = false;
      renderDayBookings();
    }
  }

  function renderDayBookings() {
    var container = els.todayList;
    var date = state.selectedDate;
    updateBookingDateSummary();

    if (!date) {
      container.innerHTML = '<div class="empty">請選擇日期</div>';
      return;
    }

    var bookings = getDayData(date).bookings;
    if (!bookings.length) {
      container.innerHTML = '<div class="empty">' + formatDateZh(date) + " 尚無預約</div>";
      return;
    }

    var sorted = sortOwnerDayBookings(bookings);
    container.innerHTML = sorted.map(function (b) {
      var isCancelled = b.status === "已取消";
      var isNoShow = b.internalStatus === "no_show" || b.status === "未到";
      var cardClass = "card booking-card " + ownerBookingCardClass(b);
      var statusClass = ownerBookingStatusClass(b);
      var reasonLine = isCancelled && b.cancelReason
        ? '<p class="booking-cancel-reason">取消原因：' + escapeHtml(b.cancelReason) + "</p>"
        : "";
      var cancelBtn = (!isCancelled && !isNoShow)
        ? '<button type="button" class="btn btn-danger btn-cancel-booking" data-cancel-id="' +
          escapeHtml(b.id) + '">取消預約</button>'
        : "";
      var transitionActions = (!isCancelled && !isNoShow)
        ? getOwnerStaffTransitionActions(b.internalStatus)
        : [];
      var transitionBtns = transitionActions.map(function (action) {
        var disabledAttr = (transitionBusy || rescheduleBusy) ? " disabled" : "";
        return (
          '<button type="button" class="btn btn-primary btn-small btn-transition-booking"' +
          disabledAttr +
          ' data-transition-id="' + escapeHtml(b.id) + '"' +
          ' data-transition-to="' + escapeHtml(action.toStatus) + '">' +
          escapeHtml(action.label) +
          "</button>"
        );
      }).join("");
      // 首版僅 confirmed 可改期；不把 customerId／staffId 等放入 DOM
      var rescheduleBtn = (b.internalStatus === "confirmed")
        ? '<button type="button" class="btn btn-small btn-reschedule-booking"' +
          ((transitionBusy || rescheduleBusy) ? " disabled" : "") +
          ' data-reschedule-id="' + escapeHtml(b.id) + '">改期</button>'
        : "";
      var actionRow = (transitionBtns || rescheduleBtn || cancelBtn)
        ? '<div class="booking-card-actions">' + transitionBtns + rescheduleBtn + cancelBtn + "</div>"
        : "";
      return (
        '<div class="' + cardClass + '">' +
          '<div class="booking-card-head">' +
            '<span class="booking-time">' + escapeHtml(b.time) + '</span>' +
            '<span class="' + statusClass + '">' + escapeHtml(ownerBookingStatusLabel(b)) + '</span>' +
          '</div>' +
          '<h3 class="booking-service">' + escapeHtml(b.serviceName || "服務") + '</h3>' +
          '<p class="booking-customer">' + escapeHtml(b.customerName || "客人") + '</p>' +
          (b.phone
            ? '<p class="booking-phone">電話：' + escapeHtml(b.phone) + '</p>'
            : "") +
          (b.birthday
            ? '<p class="booking-birthday">生日：' + escapeHtml(formatDateZh(b.birthday)) + '</p>'
            : "") +
          '<p class="booking-date-line">' + formatDateZh(b.date || date) + '</p>' +
          reasonLine +
          actionRow +
        '</div>'
      );
    }).join("");

    container.querySelectorAll("[data-cancel-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (transitionBusy || rescheduleBusy) return;
        var id = btn.getAttribute("data-cancel-id");
        var booking = sorted.find(function (b) { return b.id === id; });
        openOwnerCancelModal(booking || { id: id, date: date });
      });
    });

    container.querySelectorAll("[data-transition-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (transitionBusy || rescheduleBusy || btn.disabled) return;
        var id = btn.getAttribute("data-transition-id");
        var toStatus = btn.getAttribute("data-transition-to");
        var booking = sorted.find(function (b) { return b.id === id; });
        var actions = getOwnerStaffTransitionActions(
          booking && booking.internalStatus ? booking.internalStatus : ""
        );
        var action = actions.find(function (item) { return item.toStatus === toStatus; });
        if (!action) return;
        submitBookingTransition(id, action);
      });
    });

    container.querySelectorAll("[data-reschedule-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (transitionBusy || rescheduleBusy || btn.disabled) return;
        var id = btn.getAttribute("data-reschedule-id");
        var booking = sorted.find(function (b) { return b.id === id; });
        if (!booking || booking.internalStatus !== "confirmed") return;
        openOwnerRescheduleModal(booking);
      });
    });
  }

  function sortOwnerDayBookings(bookings) {
    return (bookings || []).slice().sort(function (a, b) {
      function rank(booking) {
        if (booking.status === "已取消") return 2;
        if (booking.internalStatus === "no_show" || booking.status === "未到") return 2;
        if (booking.internalStatus === "completed") return 1;
        return 0;
      }
      var aRank = rank(a);
      var bRank = rank(b);
      if (aRank !== bRank) return aRank - bRank;

      var aTime = String(a.time || "");
      var bTime = String(b.time || "");
      if (aTime < bTime) return -1;
      if (aTime > bTime) return 1;

      var aDate = String(a.date || "");
      var bDate = String(b.date || "");
      if (aDate < bDate) return -1;
      if (aDate > bDate) return 1;
      return 0;
    });
  }

  var cancelModalState = { bookingId: "" };

  function openOwnerCancelModal(booking) {
    cancelModalState.bookingId = booking.id || "";
    if (!cancelModalState.bookingId) return;
    els.ownerCancelSummary.textContent =
      (booking.customerName || "客人") + "｜" +
      (booking.serviceName || "服務") + "｜" +
      formatDateZh(booking.date || state.selectedDate) + " " +
      (booking.time || "");
    els.ownerCancelReasonPreset.value = "";
    els.ownerCancelReasonOther.value = "";
    els.ownerCancelOtherWrap.hidden = true;
    els.ownerCancelModal.classList.remove("hidden");
  }

  function closeOwnerCancelModal() {
    cancelModalState.bookingId = "";
    els.ownerCancelModal.classList.add("hidden");
  }

  function getOwnerCancelReasonInput() {
    var preset = els.ownerCancelReasonPreset.value;
    if (!preset) return "";
    if (preset === "其他原因") {
      return els.ownerCancelReasonOther.value.trim();
    }
    return preset;
  }

  async function submitOwnerCancel() {
    var bookingId = cancelModalState.bookingId;
    var reason = getOwnerCancelReasonInput();
    if (!bookingId) return;
    if (!reason) {
      setStatus("error", "請填寫取消原因");
      return;
    }
    if (!confirm("確定要取消這筆預約嗎？取消後客人會看到原因。")) {
      return;
    }
    setStatus("info", "取消預約中…");
    try {
      await window.ownerApi.cancelBooking(bookingId, reason);
      closeOwnerCancelModal();
      setStatus("success", "已取消預約");
      await refreshCalendarBookings();
    } catch (error) {
      setStatus("error", error.message);
    }
  }

  function normalizeRescheduleTimeInput(value) {
    var match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(String(value || "").trim());
    if (!match) return "";
    return match[1] + ":" + match[2];
  }

  /** 前端僅擋明顯過去／無效時間；後端仍是唯一權威 */
  function isObviouslyPastTaipeiDateTime(dateStr, timeStr) {
    var start = new Date(dateStr + "T" + timeStr + ":00+08:00");
    if (isNaN(start.getTime())) return true;
    return start.getTime() <= Date.now();
  }

  function setRescheduleModalControlsBusy(busy) {
    rescheduleBusy = !!busy;
    if (els.ownerRescheduleConfirm) els.ownerRescheduleConfirm.disabled = rescheduleBusy;
    if (els.ownerRescheduleDismiss) els.ownerRescheduleDismiss.disabled = rescheduleBusy;
    if (els.ownerRescheduleDate) els.ownerRescheduleDate.disabled = rescheduleBusy;
    if (els.ownerRescheduleTime) els.ownerRescheduleTime.disabled = rescheduleBusy;
    renderDayBookings();
  }

  function openOwnerRescheduleModal(booking) {
    if (!booking || !booking.id || booking.internalStatus !== "confirmed") return;
    rescheduleModalState.bookingId = String(booking.id);
    rescheduleModalState.customerName = booking.customerName || "客人";
    rescheduleModalState.serviceName = booking.serviceName || "服務";
    rescheduleModalState.date = booking.date || state.selectedDate || "";
    rescheduleModalState.time = booking.time || "";
    // textContent 避免 XSS；不把完整 booking JSON 放入 DOM
    els.ownerRescheduleSummary.textContent =
      rescheduleModalState.customerName + "｜" +
      rescheduleModalState.serviceName + "｜" +
      formatDateZh(rescheduleModalState.date) + " " +
      rescheduleModalState.time;
    els.ownerRescheduleDate.value = "";
    els.ownerRescheduleTime.value = "";
    setRescheduleModalControlsBusy(false);
    els.ownerRescheduleModal.classList.remove("hidden");
  }

  function closeOwnerRescheduleModal() {
    if (rescheduleBusy) return;
    rescheduleModalState.bookingId = "";
    rescheduleModalState.customerName = "";
    rescheduleModalState.serviceName = "";
    rescheduleModalState.date = "";
    rescheduleModalState.time = "";
    if (els.ownerRescheduleDate) els.ownerRescheduleDate.value = "";
    if (els.ownerRescheduleTime) els.ownerRescheduleTime.value = "";
    if (els.ownerRescheduleSummary) els.ownerRescheduleSummary.textContent = "";
    els.ownerRescheduleModal.classList.add("hidden");
  }

  async function submitOwnerReschedule() {
    if (rescheduleBusy) return;
    var bookingId = rescheduleModalState.bookingId;
    if (!bookingId) return;

    var newDate = String(els.ownerRescheduleDate.value || "").trim();
    var newTime = normalizeRescheduleTimeInput(els.ownerRescheduleTime.value);
    if (!newDate) {
      setStatus("error", "請選擇新的預約日期");
      return;
    }
    if (!newTime) {
      setStatus("error", "請選擇新的預約時間");
      return;
    }
    if (isObviouslyPastTaipeiDateTime(newDate, newTime)) {
      setStatus("error", "無法改期至已開始或已過去的時段");
      return;
    }

    var confirmMessage =
      "確定將預約改期？\n" +
      "原時段：" + formatDateZh(rescheduleModalState.date) + " " + rescheduleModalState.time + "\n" +
      "新時段：" + formatDateZh(newDate) + " " + newTime;
    if (!confirm(confirmMessage)) {
      return;
    }

    setRescheduleModalControlsBusy(true);
    setStatus("info", "改期處理中…");
    try {
      await window.ownerApi.rescheduleBooking(bookingId, newDate, newTime);
      setRescheduleModalControlsBusy(false);
      closeOwnerRescheduleModal();
      await refreshCalendarBookings();
      setStatus("success", "改期成功");
    } catch (error) {
      setStatus("error", error && error.message ? error.message : "改期失敗");
      setRescheduleModalControlsBusy(false);
    }
  }

  function selectBookingDate(date) {
    state.selectedDate = date;
    renderCalendar();
    renderDayBookings();
  }

  function getDefaultDateForMonth(month) {
    if (month === getCurrentMonthIso()) {
      return getTodayIso();
    }
    return month + "-01";
  }

  async function loadMonthBookings(month, selectDate) {
    setStatus("info", "載入月曆中…");
    try {
      var result = await window.ownerApi.getBookingsForMonth(month);
      state.calendarMonth = result.month || month;
      state.monthDays = result.days || {};
      state.selectedDate = selectDate || getDefaultDateForMonth(state.calendarMonth);
      setStatus("");
      renderCalendar();
      renderDayBookings();
    } catch (error) {
      setStatus("error", error.message);
    }
  }

  function shiftCalendarMonth(delta) {
    var newMonth = addMonths(state.calendarMonth, delta);
    loadMonthBookings(newMonth, getDefaultDateForMonth(newMonth))
      .catch(function (e) { setStatus("error", e.message); });
  }

  function goToTodayOnCalendar() {
    var today = getTodayIso();
    loadMonthBookings(getCurrentMonthIso(), today)
      .catch(function (e) { setStatus("error", e.message); });
  }

  async function refreshCalendarBookings() {
    await loadMonthBookings(state.calendarMonth, state.selectedDate);
  }

  function renderServices() {
    var container = els.serviceList;
    if (!state.services.length) {
      container.innerHTML = '<div class="empty">尚無服務項目</div>';
      return;
    }
    container.innerHTML = state.services.map(function (s) {
      var badge = s.status === "上架" ? "on" : "off";
      return (
        '<div class="card">' +
          '<h3>' + escapeHtml(s.name) + ' <span class="badge ' + badge + '">' + escapeHtml(s.status) + '</span></h3>' +
          '<p>' + s.durationMinutes + ' 分鐘' + (s.price ? ' · NT$ ' + s.price : '') + '</p>' +
          '<p>' + escapeHtml(s.description || "") + '</p>' +
          '<div class="service-actions">' +
            '<button type="button" class="btn btn-small" data-edit="' + s.id + '">編輯</button>' +
            '<button type="button" class="btn btn-small" data-toggle="' + s.id + '">' +
              (s.status === "上架" ? "下架" : "上架") +
            '</button>' +
          '</div>' +
        '</div>'
      );
    }).join("");

    container.querySelectorAll("[data-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        startEditService(btn.getAttribute("data-edit"));
      });
    });
    container.querySelectorAll("[data-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        toggleService(btn.getAttribute("data-toggle"));
      });
    });
  }

  function renderSlotEditor() {
    var container = els.slotEditor;
    var rows = state.slots.length ? state.slots : [{ weekday: "一", startTime: "10:00", endTime: "18:00" }];

    container.innerHTML = rows.map(function (slot, index) {
      var weekdayOptions = WEEKDAYS.map(function (d) {
        var selected = slot.weekday === d ? " selected" : "";
        return '<option value="' + d + '"' + selected + '>週' + d + '</option>';
      }).join("");
      return (
        '<div class="slot-row" data-index="' + index + '">' +
          '<select class="slot-weekday">' + weekdayOptions + '</select>' +
          '<input type="time" class="slot-start" value="' + escapeHtml(slot.startTime || "10:00") + '">' +
          '<input type="time" class="slot-end" value="' + escapeHtml(slot.endTime || "18:00") + '">' +
          '<button type="button" class="btn btn-small slot-remove">刪</button>' +
        '</div>'
      );
    }).join("") + '<button type="button" class="btn btn-small" id="add-slot-row">＋ 新增時段</button>';

    container.querySelectorAll(".slot-remove").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".slot-row");
        row.parentNode.removeChild(row);
      });
    });

    $("add-slot-row").addEventListener("click", function () {
      state.slots.push({ weekday: "一", startTime: "10:00", endTime: "18:00" });
      renderSlotEditor();
    });
  }

  function collectSlotsFromEditor() {
    var rows = els.slotEditor.querySelectorAll(".slot-row");
    var slots = [];
    rows.forEach(function (row) {
      slots.push({
        weekday: row.querySelector(".slot-weekday").value,
        startTime: row.querySelector(".slot-start").value,
        endTime: row.querySelector(".slot-end").value,
        status: "開放"
      });
    });
    return slots;
  }

  function fillSettingsForm() {
    var s = state.settings || {};
    els.brandName.value = s.brandName || "";
    els.primaryColor.value = s.primaryColor || "#E8B4B8";
    els.announcement.value = s.announcement || "";
    els.cancelPolicy.value = s.cancelPolicy || "";
    if (els.bookingMinNoticeDays) {
      els.bookingMinNoticeDays.value = s.bookingMinNoticeDays != null ? String(s.bookingMinNoticeDays) : "1";
    }
    if (els.cancellationMinNoticeDays) {
      els.cancellationMinNoticeDays.value = s.cancellationMinNoticeDays != null
        ? String(s.cancellationMinNoticeDays)
        : "1";
    }
    els.depositEnabled.checked = Boolean(s.depositEnabled);
    els.depositAmount.value = s.depositAmount != null && s.depositAmount !== "" ? s.depositAmount : "";
    els.bankName.value = s.bankName || "";
    els.bankCode.value = s.bankCode || "";
    els.bankAccount.value = s.bankAccount || "";
    els.bankAccountName.value = s.bankAccountName || "";
    els.depositNote.value = s.depositNote || "";
    updateDepositFieldsState();
  }

  function updateDepositFieldsState() {
    var on = els.depositEnabled.checked;
    if (els.depositFields) {
      els.depositFields.style.opacity = on ? "1" : "0.55";
    }
    [
      els.depositAmount,
      els.bankName,
      els.bankCode,
      els.bankAccount,
      els.bankAccountName,
      els.depositNote
    ].forEach(function (input) {
      if (input) input.disabled = !on;
    });
  }

  function clearServiceForm() {
    state.editingServiceId = null;
    els.svcName.value = "";
    els.svcDuration.value = "60";
    els.svcPrice.value = "";
    els.svcDesc.value = "";
    els.svcSort.value = "0";
    els.svcSubmit.textContent = "新增服務";
  }

  function startEditService(id) {
    var svc = state.services.find(function (s) { return s.id === id; });
    if (!svc) return;
    state.editingServiceId = id;
    els.svcName.value = svc.name;
    els.svcDuration.value = svc.durationMinutes;
    els.svcPrice.value = svc.price || "";
    els.svcDesc.value = svc.description || "";
    els.svcSort.value = svc.sortOrder || 0;
    els.svcSubmit.textContent = "儲存修改";
    switchTab("services");
    window.scrollTo(0, 0);
  }

  async function loadToday() {
    var month = state.calendarMonth || getCurrentMonthIso();
    var date = state.selectedDate || getTodayIso();
    await loadMonthBookings(month, date);
  }

  async function loadServices() {
    state.services = await window.ownerApi.getServices(state.user.userId);
    renderServices();
  }

  async function loadSlots() {
    state.slots = await window.ownerApi.getSlots(state.user.userId);
    renderSlotEditor();
  }

  async function loadSettings() {
    state.settings = await window.ownerApi.getSettings(state.user.userId);
    fillSettingsForm();
    if (state.settings.brandName) {
      els.brand.textContent = state.settings.brandName + " · 管理";
    }
  }

  async function handleServiceSubmit() {
    var data = {
      name: els.svcName.value.trim(),
      durationMinutes: Number(els.svcDuration.value) || 60,
      price: els.svcPrice.value ? Number(els.svcPrice.value) : null,
      description: els.svcDesc.value.trim(),
      sortOrder: Number(els.svcSort.value) || 0,
      status: "上架"
    };
    if (!data.name) {
      setStatus("error", "請填寫服務名稱");
      return;
    }
    setStatus("info", "儲存中…");
    try {
      if (state.editingServiceId) {
        await window.ownerApi.updateService(state.user.userId, state.editingServiceId, data);
        setStatus("success", "服務已更新");
      } else {
        await window.ownerApi.createService(state.user.userId, data);
        setStatus("success", "服務已新增");
      }
      clearServiceForm();
      await loadServices();
    } catch (error) {
      setStatus("error", error.message);
    }
  }

  async function toggleService(id) {
    var svc = state.services.find(function (s) { return s.id === id; });
    if (!svc) return;
    var newStatus = svc.status === "上架" ? "下架" : "上架";
    try {
      await window.ownerApi.updateService(state.user.userId, id, { status: newStatus });
      await loadServices();
    } catch (error) {
      setStatus("error", error.message);
    }
  }

  async function handleSaveSlots() {
    var slots = collectSlotsFromEditor();
    setStatus("info", "儲存營業時段中…");
    try {
      await window.ownerApi.saveSlots(state.user.userId, slots);
      state.slots = slots;
      setStatus("success", "營業時段已更新");
    } catch (error) {
      setStatus("error", error.message);
    }
  }

  function parseNoticeDaysInput(raw, label) {
    var text = String(raw == null ? "" : raw).trim();
    if (text === "") {
      throw new Error("請填寫「" + label + "」");
    }
    var n = Number(text);
    if (!Number.isInteger(n) || n < 0 || n > 30) {
      throw new Error("「" + label + "」須為 0～30 的整數");
    }
    return n;
  }

  async function handleSaveSettings() {
    var depositEnabled = els.depositEnabled.checked;
    var payload = {
      brandName: els.brandName.value.trim(),
      primaryColor: els.primaryColor.value.trim(),
      announcement: els.announcement.value.trim(),
      cancelPolicy: els.cancelPolicy.value.trim(),
      depositEnabled: depositEnabled,
      depositAmount: els.depositAmount.value === "" ? null : Number(els.depositAmount.value),
      bankName: els.bankName.value.trim(),
      bankCode: els.bankCode.value.trim(),
      bankAccount: els.bankAccount.value.trim(),
      bankAccountName: els.bankAccountName.value.trim(),
      depositNote: els.depositNote.value.trim()
    };

    try {
      payload.bookingMinNoticeDays = parseNoticeDaysInput(
        els.bookingMinNoticeDays ? els.bookingMinNoticeDays.value : "",
        "客戶最晚預約時間"
      );
      payload.cancellationMinNoticeDays = parseNoticeDaysInput(
        els.cancellationMinNoticeDays ? els.cancellationMinNoticeDays.value : "",
        "客戶最晚取消時間"
      );
    } catch (validationError) {
      setStatus("error", validationError.message);
      return;
    }

    if (depositEnabled) {
      if (!payload.bankAccount || !payload.bankAccountName) {
        setStatus("error", "開啟訂金時請填寫帳號與戶名");
        return;
      }
      if (!(payload.depositAmount > 0)) {
        setStatus("error", "開啟訂金時訂金金額須大於 0");
        return;
      }
    }

    setStatus("info", "儲存設定中…");
    if (els.saveSettings) {
      if (els.saveSettings._savingInProgress) return;
      els.saveSettings._savingInProgress = true;
      els.saveSettings.disabled = true;
    }
    try {
      await window.ownerApi.updateSettings(state.user.userId, payload);
      await loadSettings();
      setStatus("success", "店面設定已更新");
    } catch (error) {
      var message = (error && error.message) ? error.message : "儲存設定失敗，請稍後再試";
      if (/儲存失敗|伺服器回應錯誤|Failed to fetch|NetworkError/i.test(message)) {
        message = "儲存設定失敗：" + message + "。請確認已填寫必填訂金欄位（金額、帳號、戶名），或稍後再試。";
      }
      setStatus("error", message);
    } finally {
      if (els.saveSettings) {
        els.saveSettings._savingInProgress = false;
        els.saveSettings.disabled = false;
      }
    }
  }

  function showCustomerListView() {
    els.customerListView.classList.remove("hidden");
    els.customerDetailView.classList.add("hidden");
    state.selectedCustomer = null;
    // 返回名單即丟棄記憶體中的一次性邀請連結與照片 object URL
    resetClaimInviteState();
    resetPhotoSection();
  }

  function showCustomerDetailView() {
    els.customerListView.classList.add("hidden");
    els.customerDetailView.classList.remove("hidden");
  }

  function renderCustomerList() {
    var container = els.customerList;
    var customers = state.customers || [];

    if (!customers.length) {
      container.innerHTML = state.customerQuery
        ? '<div class="empty">找不到符合的客戶</div>'
        : '<div class="empty">目前尚無客戶資料，可從預約或 CSV 匯入建立</div>';
      return;
    }

    container.innerHTML = customers.map(function (c) {
      return (
        '<button type="button" class="card customer-card" data-customer-id="' + escapeHtml(c.customerId) + '">' +
          '<div class="customer-card-head">' +
            '<span class="customer-name">' + escapeHtml(c.customerName || "客人") + '</span>' +
            '<span class="customer-count">預約 ' + Number(c.bookingCount || 0) + ' 次</span>' +
          '</div>' +
          (c.phone
            ? '<p class="customer-meta">電話：' + escapeHtml(c.phone) + "</p>"
            : '<p class="customer-meta muted">電話：未填寫</p>') +
          (c.birthday
            ? '<p class="customer-meta">生日：' + escapeHtml(formatDateZh(c.birthday)) + "</p>"
            : "") +
          (c.lastBookingDate
            ? '<p class="customer-meta">最近預約：' + escapeHtml(formatDateZh(c.lastBookingDate)) + "</p>"
            : "") +
        "</button>"
      );
    }).join("");

    container.querySelectorAll("[data-customer-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openCustomerDetail(btn.getAttribute("data-customer-id")).catch(function (e) {
          setStatus("error", e.message);
        });
      });
    });
  }

  async function loadCustomers(query) {
    var q = String(query == null ? state.customerQuery : query).trim();
    state.customerQuery = q;
    setStatus("info", "載入客戶名單…");
    var data = await window.ownerApi.getCustomers(q);
    state.customers = (data && data.customers) || [];
    renderCustomerList();
    setStatus("");
  }

  function renderCustomerDetailHeader(detail) {
    // LINE 狀態只以 linkedLine 布林呈現，不顯示 LINE userId
    var lineBadge = detail.linkedLine === true
      ? '<span class="line-status line-status--linked">已綁定 LINE</span>'
      : '<span class="line-status line-status--unlinked">未綁定 LINE</span>';
    els.customerDetailHeader.innerHTML =
      '<h3 class="customer-name">' + escapeHtml(detail.customerName || "客人") + "</h3>" +
      '<p class="customer-meta">' + lineBadge + "</p>" +
      (detail.phone
        ? '<p class="customer-meta">電話：' + escapeHtml(detail.phone) + "</p>"
        : '<p class="customer-meta muted">電話：未填寫</p>') +
      (detail.birthday
        ? '<p class="customer-meta">生日：' + escapeHtml(formatDateZh(detail.birthday)) + "</p>"
        : '<p class="customer-meta muted">生日：未填寫</p>') +
      (detail.note
        ? '<p class="customer-meta">特別事項：' + escapeHtml(detail.note) + "</p>"
        : "");
  }

  function renderCustomerBookings(bookings) {
    var container = els.customerBookingList;
    if (!bookings || !bookings.length) {
      container.innerHTML = '<div class="empty">此客戶尚無預約紀錄</div>';
      return;
    }

    container.innerHTML = bookings.map(function (b) {
      var isCancelled = b.status === "已取消";
      var cardClass = "card booking-card" + (isCancelled ? " booking-card--cancelled" : " booking-card--confirmed");
      var statusClass = isCancelled ? "booking-status cancelled" : "booking-status confirmed";
      var reasonLine = isCancelled && b.cancelReason
        ? '<p class="booking-cancel-reason">取消原因：' + escapeHtml(b.cancelReason) + "</p>"
        : "";
      return (
        '<div class="' + cardClass + '">' +
          '<div class="booking-card-head">' +
            '<span class="booking-time">' + escapeHtml(formatDateZh(b.date)) + " " + escapeHtml(b.time || "") + "</span>" +
            '<span class="' + statusClass + '">' + escapeHtml(b.status || "") + "</span>" +
          "</div>" +
          '<h3 class="booking-service">' + escapeHtml(b.serviceName || "服務") + "</h3>" +
          reasonLine +
        "</div>"
      );
    }).join("");
  }

  var CUSTOMER_NOTE_MAX_LENGTH = 2000;

  function updateCustomerNoteCount() {
    if (!els.customerEditNote || !els.customerEditNoteCount) return;
    els.customerEditNoteCount.textContent =
      els.customerEditNote.value.length + " / " + CUSTOMER_NOTE_MAX_LENGTH;
  }

  function fillCustomerEditForm(detail) {
    if (!els.customerEditName || !els.customerEditPhone || !els.customerEditBirthday) return;
    els.customerEditName.value = detail.customerName || "";
    els.customerEditPhone.value = detail.phone || "";
    els.customerEditBirthday.value = detail.birthday || "";
    if (els.customerEditNote) {
      els.customerEditNote.value = detail.note || "";
      updateCustomerNoteCount();
    }
  }

  async function openCustomerDetail(customerId) {
    if (!customerId) return;
    setStatus("info", "載入客戶資料…");
    var data = await window.ownerApi.getCustomerById(customerId);
    state.selectedCustomer = data;
    renderCustomerDetailHeader(data || {});
    fillCustomerEditForm(data || {});
    renderCustomerBookings((data && data.bookings) || []);
    // 切換客戶時清除記憶體中的一次性邀請連結
    resetClaimInviteState();
    await refreshClaimInviteSection(data || {});
    // 切換客戶時 revoke 舊的照片 object URL 再載入新客戶照片
    resetPhotoSection();
    photoState.customerId = (data && data.customerId) || "";
    await refreshPhotoSets();
    showCustomerDetailView();
    setStatus("");
  }

  // ──────────────── LINE 認領邀請 ────────────────
  //
  // 安全規則：原始邀請 token 只存在本畫面的記憶體狀態
  // （claimInviteState.claimUrl），不寫入 localStorage、sessionStorage、
  // console 或 data attribute；離開詳情或切換客戶即清除。
  // GET 只回狀態，永遠拿不回原始 token。QR Code 以本機 vendored
  // qrcode-generator 於 canvas 繪製，不呼叫任何第三方 QR 服務。

  var claimInviteState = {
    customerId: "",
    claimUrl: "",
    invite: null,
    busy: false
  };

  var CLAIM_STATUS_LABELS = {
    active: "邀請有效",
    claimed: "已完成認領",
    revoked: "邀請已撤銷",
    expired: "邀請已過期"
  };

  function getClaimBaseUrl() {
    var config = window.BEAUTY_CONFIG || {};
    if (!config.CLAIM_ENABLED || !config.CUSTOMER_APP_URL) {
      return null;
    }
    return String(config.CUSTOMER_APP_URL);
  }

  function resetClaimInviteState() {
    claimInviteState.customerId = "";
    claimInviteState.claimUrl = "";
    claimInviteState.invite = null;
    claimInviteState.busy = false;
    if (els.claimInviteResult) {
      els.claimInviteResult.hidden = true;
    }
    if (els.claimInviteLink) {
      els.claimInviteLink.value = "";
    }
    if (els.claimInviteCopy) {
      els.claimInviteCopy.textContent = "複製連結";
    }
    clearClaimQr();
  }

  function clearClaimQr() {
    var canvas = els.claimInviteQr;
    if (!canvas || typeof canvas.getContext !== "function") return;
    var ctx = canvas.getContext("2d");
    if (ctx && canvas.width && canvas.height) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    canvas.width = 0;
    canvas.height = 0;
  }

  /** 以本機 qrcode-generator 在 canvas 繪製 QR（含 4 模組 quiet zone） */
  function drawClaimQr(url) {
    var canvas = els.claimInviteQr;
    if (typeof window.qrcode !== "function" ||
        !canvas || typeof canvas.getContext !== "function") {
      return;
    }
    var qr = window.qrcode(0, "M");
    qr.addData(url);
    qr.make();
    var count = qr.getModuleCount();
    var scale = 6;
    var margin = 4;
    var size = (count + margin * 2) * scale;
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    for (var row = 0; row < count; row++) {
      for (var col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale);
        }
      }
    }
  }

  function formatClaimExpiry(expiresAt) {
    if (!expiresAt) return "";
    var date = new Date(expiresAt);
    if (isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }

  function renderClaimInviteStatus(detail) {
    if (!els.claimInviteStatus) return;
    var invite = claimInviteState.invite;

    if (detail && detail.linkedLine === true) {
      els.claimInviteStatus.innerHTML =
        '<p class="claim-status-line"><span class="line-status line-status--linked">已綁定 LINE</span>' +
        " 此客戶已完成綁定，無需認領邀請。</p>";
      if (els.claimInviteCreate) els.claimInviteCreate.hidden = true;
      if (els.claimInviteRevoke) els.claimInviteRevoke.hidden = true;
      return;
    }

    if (!getClaimBaseUrl()) {
      els.claimInviteStatus.innerHTML =
        '<p class="claim-status-line muted">此環境未啟用 LINE 認領邀請。</p>';
      if (els.claimInviteCreate) els.claimInviteCreate.hidden = true;
      if (els.claimInviteRevoke) els.claimInviteRevoke.hidden = true;
      return;
    }

    var statusHtml;
    var hasActive = invite && invite.status === "active";
    if (!invite) {
      statusHtml = '<p class="claim-status-line muted">目前沒有邀請。</p>';
    } else {
      var label = CLAIM_STATUS_LABELS[invite.status] || invite.status;
      var expiry = invite.status === "active" && invite.expiresAt
        ? "，有效期限至 " + escapeHtml(formatClaimExpiry(invite.expiresAt))
        : "";
      statusHtml =
        '<p class="claim-status-line">' +
        '<span class="claim-status claim-status--' + escapeHtml(invite.status) + '">' +
        escapeHtml(label) + "</span>" + expiry + "</p>";
    }
    els.claimInviteStatus.innerHTML = statusHtml;

    if (els.claimInviteCreate) {
      els.claimInviteCreate.hidden = false;
      els.claimInviteCreate.disabled = claimInviteState.busy;
      els.claimInviteCreate.textContent = hasActive ? "重新產生邀請連結" : "建立邀請連結";
    }
    if (els.claimInviteRevoke) {
      els.claimInviteRevoke.hidden = !hasActive;
      els.claimInviteRevoke.disabled = claimInviteState.busy;
    }
  }

  async function refreshClaimInviteSection(detail) {
    if (!els.claimInviteCard) return;
    claimInviteState.customerId = (detail && detail.customerId) || "";

    if (detail && detail.linkedLine === true) {
      renderClaimInviteStatus(detail);
      return;
    }
    if (!getClaimBaseUrl()) {
      renderClaimInviteStatus(detail);
      return;
    }
    try {
      var result = await window.ownerApi.getClaimInvite(claimInviteState.customerId);
      claimInviteState.invite = (result && result.invite) || null;
    } catch (error) {
      claimInviteState.invite = null;
    }
    renderClaimInviteStatus(detail);
  }

  async function handleClaimInviteCreate() {
    var customerId = claimInviteState.customerId;
    var baseUrl = getClaimBaseUrl();
    if (!customerId || !baseUrl || claimInviteState.busy) return;

    var hasActive = claimInviteState.invite &&
      claimInviteState.invite.status === "active";
    if (hasActive) {
      var ok = confirm(
        "確定要重新產生邀請連結嗎？\n" +
        "舊的邀請連結與 QR Code 會立即失效，客戶必須改用新連結。"
      );
      if (!ok) return;
    }

    claimInviteState.busy = true;
    renderClaimInviteStatus(state.selectedCustomer);
    setStatus("info", "建立邀請連結中…");
    try {
      var result = await window.ownerApi.createClaimInvite(customerId);
      claimInviteState.invite = (result && result.invite) || null;
      // 原始 token 只在此刻取得，僅存在記憶體中的完整連結。
      // 一律放在 URL fragment（#claim=）：fragment 不會送到伺服器，
      // 不進 Pages 存取紀錄，也不會出現在 Referer。
      var token = (result && result.claimToken) || "";
      claimInviteState.claimUrl = token
        ? baseUrl + "#claim=" + encodeURIComponent(token)
        : "";
      if (els.claimInviteLink) {
        els.claimInviteLink.value = claimInviteState.claimUrl;
      }
      if (els.claimInviteResult) {
        els.claimInviteResult.hidden = !claimInviteState.claimUrl;
      }
      if (els.claimInviteCopy) {
        els.claimInviteCopy.textContent = "複製連結";
      }
      if (claimInviteState.claimUrl) {
        drawClaimQr(claimInviteState.claimUrl);
      }
      setStatus("success", "邀請連結已建立，請於期限內提供給客戶");
    } catch (error) {
      setStatus("error", error.message || "建立邀請失敗，請稍後再試");
    } finally {
      claimInviteState.busy = false;
      renderClaimInviteStatus(state.selectedCustomer);
    }
  }

  async function handleClaimInviteRevoke() {
    var customerId = claimInviteState.customerId;
    if (!customerId || claimInviteState.busy) return;
    if (!confirm("確定要撤銷邀請嗎？已發出的連結與 QR Code 將立即失效。")) {
      return;
    }
    claimInviteState.busy = true;
    renderClaimInviteStatus(state.selectedCustomer);
    setStatus("info", "撤銷邀請中…");
    try {
      await window.ownerApi.revokeClaimInvite(customerId);
      claimInviteState.claimUrl = "";
      if (els.claimInviteLink) els.claimInviteLink.value = "";
      if (els.claimInviteResult) els.claimInviteResult.hidden = true;
      clearClaimQr();
      claimInviteState.busy = false;
      await refreshClaimInviteSection(state.selectedCustomer);
      setStatus("success", "邀請已撤銷");
    } catch (error) {
      claimInviteState.busy = false;
      renderClaimInviteStatus(state.selectedCustomer);
      setStatus("error", error.message || "撤銷邀請失敗，請稍後再試");
    }
  }

  function handleClaimInviteCopy() {
    var url = claimInviteState.claimUrl;
    if (!url || !els.claimInviteCopy) return;
    var clipboard = window.navigator && window.navigator.clipboard;
    if (clipboard && clipboard.writeText) {
      clipboard.writeText(url).then(function () {
        els.claimInviteCopy.textContent = "已複製";
      }).catch(function () {
        els.claimInviteCopy.textContent = "請長按連結手動複製";
      });
      return;
    }
    els.claimInviteCopy.textContent = "請長按連結手動複製";
  }

  // ──────────────── 前後對比照片 ────────────────
  //
  // 安全規則：
  // - 圖片一律以帶 owner Authorization 的 authenticated fetch 取回
  //   blob，再以 URL.createObjectURL 顯示；不把 token 或 object key
  //   放進 img src query，不存 localStorage／sessionStorage。
  // - 離開客戶詳情、切換客戶或重新 render 時 revokeObjectURL。
  // - 上傳前一律在本機以 Canvas 重新編碼（移除 EXIF／GPS metadata、
  //   長邊縮至 2000px、JPEG 品質 0.88、透明背景鋪白）；
  //   無法安全解碼時停止並提示，絕不直接上傳原始檔案。

  var PHOTO_MAX_DIMENSION = 2000;
  var PHOTO_JPEG_QUALITY = 0.88;
  var PHOTO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

  var PHOTO_KIND_LABELS = { before: "Before（施術前）", after: "After（施術後）" };

  var photoState = {
    customerId: "",
    sets: [],
    objectUrls: [],
    busy: false
  };

  var photoLightboxState = {
    objectUrl: null,
    savedBodyOverflow: ""
  };

  function revokeLightboxObjectUrl() {
    if (photoLightboxState.objectUrl && window.URL &&
        typeof window.URL.revokeObjectURL === "function") {
      try {
        window.URL.revokeObjectURL(photoLightboxState.objectUrl);
      } catch (ignore) {}
    }
    photoLightboxState.objectUrl = null;
  }

  function closePhotoLightbox() {
    if (els.photoLightbox) {
      els.photoLightbox.classList.add("hidden");
    }
    revokeLightboxObjectUrl();
    if (document.body) {
      document.body.style.overflow = photoLightboxState.savedBodyOverflow || "";
    }
    photoLightboxState.savedBodyOverflow = "";
    if (els.photoLightboxImg) {
      els.photoLightboxImg.src = "";
      els.photoLightboxImg.hidden = true;
      els.photoLightboxImg.alt = "";
    }
    if (els.photoLightboxStatus) {
      els.photoLightboxStatus.hidden = false;
      els.photoLightboxStatus.textContent = "照片載入中…";
    }
    if (els.photoLightboxTitle) {
      els.photoLightboxTitle.textContent = "";
    }
  }

  function openPhotoLightbox(photoId, kindShort) {
    if (!photoId || !photoState.customerId || !els.photoLightbox) return;
    var openingFresh = els.photoLightbox.classList.contains("hidden");
    revokeLightboxObjectUrl();

    var titleText = "查看 " + kindShort + " 完整照片";
    if (els.photoLightboxTitle) {
      els.photoLightboxTitle.textContent = titleText;
    }
    if (els.photoLightboxStatus) {
      els.photoLightboxStatus.hidden = false;
      els.photoLightboxStatus.textContent = "照片載入中…";
    }
    if (els.photoLightboxImg) {
      els.photoLightboxImg.hidden = true;
      els.photoLightboxImg.src = "";
      els.photoLightboxImg.alt = titleText;
    }
    els.photoLightbox.classList.remove("hidden");
    if (openingFresh && document.body) {
      photoLightboxState.savedBodyOverflow = document.body.style.overflow || "";
      document.body.style.overflow = "hidden";
    }
    if (els.photoLightboxClose && typeof els.photoLightboxClose.focus === "function") {
      els.photoLightboxClose.focus();
    }

    window.ownerApi.fetchComparisonPhotoBlob(photoState.customerId, photoId)
      .then(function (blob) {
        if (!els.photoLightbox || els.photoLightbox.classList.contains("hidden")) return;
        if (!window.URL || typeof window.URL.createObjectURL !== "function") {
          if (els.photoLightboxStatus) {
            els.photoLightboxStatus.textContent = "照片載入失敗，請稍後再試";
          }
          return;
        }
        var objectUrl = window.URL.createObjectURL(blob);
        photoLightboxState.objectUrl = objectUrl;
        if (els.photoLightboxImg) {
          els.photoLightboxImg.src = objectUrl;
          els.photoLightboxImg.hidden = false;
        }
        if (els.photoLightboxStatus) {
          els.photoLightboxStatus.hidden = true;
        }
      })
      .catch(function () {
        if (!els.photoLightbox || els.photoLightbox.classList.contains("hidden")) return;
        if (els.photoLightboxStatus) {
          els.photoLightboxStatus.hidden = false;
          els.photoLightboxStatus.textContent = "照片載入失敗，請稍後再試";
        }
        if (els.photoLightboxImg) {
          els.photoLightboxImg.hidden = true;
        }
      });
  }

  function revokePhotoObjectUrls() {
    if (window.URL && typeof window.URL.revokeObjectURL === "function") {
      photoState.objectUrls.forEach(function (objectUrl) {
        try {
          window.URL.revokeObjectURL(objectUrl);
        } catch (ignore) {}
      });
    }
    photoState.objectUrls = [];
  }

  function resetPhotoSection() {
    closePhotoLightbox();
    revokePhotoObjectUrls();
    photoState.customerId = "";
    photoState.sets = [];
    photoState.busy = false;
    if (els.photoSetList) {
      els.photoSetList.innerHTML = "";
    }
    if (els.photoSetTitle) els.photoSetTitle.value = "";
    if (els.photoSetDate) els.photoSetDate.value = "";
  }

  function formatPhotoBytes(bytes) {
    var n = Number(bytes) || 0;
    if (n >= 1024 * 1024) {
      return (n / (1024 * 1024)).toFixed(1) + " MB";
    }
    return Math.max(1, Math.round(n / 1024)) + " KB";
  }

  function renderPhotoSlot(set, kind) {
    var photo = set[kind];
    var ref = set.setId + ":" + kind;
    var kindShort = kind === "before" ? "Before" : "After";
    var html =
      '<div class="photo-slot">' +
      '<p class="photo-slot-label">' + PHOTO_KIND_LABELS[kind] + "</p>";

    if (photo) {
      html +=
        '<button type="button" class="photo-view-btn" data-photo-view="' + escapeHtml(photo.photoId) + '" ' +
        'data-photo-kind="' + escapeHtml(kindShort) + '" ' +
        'aria-label="查看 ' + escapeHtml(kindShort) + ' 完整照片">' +
        '<img class="photo-img" data-photo-img="' + escapeHtml(photo.photoId) + '" alt="" aria-hidden="true">' +
        "</button>" +
        '<p class="photo-load-error" data-photo-error="' + escapeHtml(photo.photoId) + '" hidden>照片載入失敗，請重新整理</p>' +
        '<p class="photo-meta">' +
        escapeHtml(formatPhotoBytes(photo.byteSize)) +
        (photo.width && photo.height
          ? "・" + photo.width + "×" + photo.height
          : "") +
        "</p>" +
        '<div class="photo-slot-actions">' +
        '<button type="button" class="btn btn-small" data-photo-select="' + escapeHtml(ref) + '">取代照片</button>' +
        '<button type="button" class="btn btn-small btn-danger" data-photo-delete="' + escapeHtml(photo.photoId) + '">刪除照片</button>' +
        "</div>";
    } else {
      html +=
        '<p class="photo-empty">尚未上傳</p>' +
        '<div class="photo-slot-actions">' +
        '<button type="button" class="btn btn-small" data-photo-select="' + escapeHtml(ref) + '">選擇照片</button>' +
        "</div>";
    }

    html +=
      '<input type="file" class="photo-file-input" accept="image/jpeg,image/png,image/webp" ' +
      'data-photo-file="' + escapeHtml(ref) + '" hidden aria-label="' +
      escapeHtml(PHOTO_KIND_LABELS[kind]) + '選擇檔案">' +
      "</div>";
    return html;
  }

  function renderPhotoSets() {
    if (!els.photoSetList) return;
    closePhotoLightbox();
    revokePhotoObjectUrls();

    if (!photoState.sets.length) {
      els.photoSetList.innerHTML =
        '<div class="empty">尚未建立前後對比照片</div>';
      return;
    }

    els.photoSetList.innerHTML = photoState.sets.map(function (set) {
      return (
        '<div class="card photo-set">' +
        '<div class="photo-set-head">' +
        '<div class="photo-set-info">' +
        '<p class="photo-set-title-text">' +
        escapeHtml(set.title || "未命名照片組") + "</p>" +
        '<p class="photo-set-meta">' +
        (set.capturedAt ? "拍攝日期：" + escapeHtml(set.capturedAt) + "　" : "") +
        "建立於 " + escapeHtml(String(set.createdAt || "").slice(0, 10)) +
        "</p>" +
        "</div>" +
        '<button type="button" class="btn btn-small btn-danger" data-photo-set-delete="' +
        escapeHtml(set.setId) + '">刪除整組</button>' +
        "</div>" +
        '<div class="photo-compare">' +
        renderPhotoSlot(set, "before") +
        renderPhotoSlot(set, "after") +
        "</div>" +
        "</div>"
      );
    }).join("");

    bindPhotoSetEvents();
    loadPhotoImages();
  }

  /** 以 authenticated fetch 取 blob → object URL；不在 img src 帶 token */
  function loadPhotoImages() {
    if (!els.photoSetList) return;
    var images = els.photoSetList.querySelectorAll("[data-photo-img]");
    images.forEach(function (img) {
      var photoId = img.getAttribute("data-photo-img");
      window.ownerApi.fetchComparisonPhotoBlob(photoState.customerId, photoId)
        .then(function (blob) {
          if (!window.URL || typeof window.URL.createObjectURL !== "function") return;
          var objectUrl = window.URL.createObjectURL(blob);
          photoState.objectUrls.push(objectUrl);
          img.src = objectUrl;
        })
        .catch(function () {
          img.hidden = true;
          var viewBtn = img.closest
            ? img.closest(".photo-view-btn")
            : null;
          if (!viewBtn && els.photoSetList) {
            var buttons = els.photoSetList.querySelectorAll("[data-photo-view]");
            buttons.forEach(function (btn) {
              if (btn.getAttribute("data-photo-view") === photoId) {
                viewBtn = btn;
              }
            });
          }
          if (viewBtn) {
            viewBtn.disabled = true;
          }
          var errors = els.photoSetList.querySelectorAll("[data-photo-error]");
          errors.forEach(function (errorEl) {
            if (errorEl.getAttribute("data-photo-error") === photoId) {
              errorEl.hidden = false;
            }
          });
        });
    });
  }

  function findPhotoFileInput(ref) {
    if (!els.photoSetList) return null;
    var inputs = els.photoSetList.querySelectorAll("[data-photo-file]");
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].getAttribute("data-photo-file") === ref) {
        return inputs[i];
      }
    }
    return null;
  }

  function bindPhotoSetEvents() {
    els.photoSetList.querySelectorAll("[data-photo-view]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        openPhotoLightbox(
          btn.getAttribute("data-photo-view"),
          btn.getAttribute("data-photo-kind") || "照片"
        );
      });
    });
    els.photoSetList.querySelectorAll("[data-photo-select]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = findPhotoFileInput(btn.getAttribute("data-photo-select"));
        if (input && typeof input.click === "function") {
          input.click();
        }
      });
    });
    els.photoSetList.querySelectorAll("[data-photo-file]").forEach(function (input) {
      input.addEventListener("change", function () {
        var ref = String(input.getAttribute("data-photo-file") || "");
        var parts = ref.split(":");
        handlePhotoFileChange(parts[0], parts[1], input).catch(function (e) {
          setStatus("error", e.message);
        });
      });
    });
    els.photoSetList.querySelectorAll("[data-photo-delete]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        handlePhotoDelete(btn.getAttribute("data-photo-delete")).catch(function (e) {
          setStatus("error", e.message);
        });
      });
    });
    els.photoSetList.querySelectorAll("[data-photo-set-delete]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        handlePhotoSetDelete(btn.getAttribute("data-photo-set-delete")).catch(function (e) {
          setStatus("error", e.message);
        });
      });
    });
  }

  async function refreshPhotoSets() {
    if (!els.photoSetList || !photoState.customerId) return;
    try {
      var result = await window.ownerApi.listPhotoSets(photoState.customerId);
      photoState.sets = (result && result.photoSets) || [];
      renderPhotoSets();
    } catch (error) {
      photoState.sets = [];
      revokePhotoObjectUrls();
      els.photoSetList.innerHTML =
        '<div class="empty">照片載入失敗：' + escapeHtml(error.message || "") + "</div>";
    }
  }

  /**
   * 本機 Canvas 重新編碼：解碼 → 縮至長邊 2000px → 白底鋪透明 →
   * 輸出 JPEG（品質 0.88）。重新編碼後不含 EXIF／GPS metadata。
   * 無法安全解碼時丟錯，不上傳原始檔案。
   */
  async function reencodePhotoForUpload(file) {
    if (typeof window.createImageBitmap !== "function") {
      throw new Error("此瀏覽器不支援安全的圖片處理，請改用其他裝置上傳");
    }
    var bitmap;
    try {
      bitmap = await window.createImageBitmap(file);
    } catch (ignore) {
      throw new Error("無法讀取此圖片，請改用 JPEG、PNG 或 WebP 檔案");
    }

    var scale = Math.min(
      1,
      PHOTO_MAX_DIMENSION / Math.max(bitmap.width || 1, bitmap.height || 1)
    );
    var width = Math.max(1, Math.round((bitmap.width || 1) * scale));
    var height = Math.max(1, Math.round((bitmap.height || 1) * scale));

    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("圖片處理失敗，請稍後再試");
    }
    // 透明背景鋪白後輸出 JPEG
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (typeof bitmap.close === "function") {
      bitmap.close();
    }

    var blob = await new Promise(function (resolve) {
      canvas.toBlob(resolve, "image/jpeg", PHOTO_JPEG_QUALITY);
    });
    if (!blob) {
      throw new Error("圖片處理失敗，請稍後再試");
    }
    return { blob: blob, width: width, height: height };
  }

  async function handlePhotoFileChange(setId, kind, input) {
    var file = input.files && input.files[0];
    input.value = "";
    if (!file || !setId || (kind !== "before" && kind !== "after")) return;
    if (photoState.busy) return;

    photoState.busy = true;
    setStatus("info", "處理照片中…");
    try {
      var processed = await reencodePhotoForUpload(file);
      if (processed.blob.size > PHOTO_MAX_UPLOAD_BYTES) {
        throw new Error("處理後圖片仍超過 5 MB，請改用較小的照片");
      }
      setStatus("info", "上傳照片中…");
      await window.ownerApi.uploadComparisonPhoto(
        photoState.customerId, setId, kind, processed.blob,
        { width: processed.width, height: processed.height }
      );
      setStatus("success", "照片已上傳");
      await refreshPhotoSets();
    } catch (error) {
      setStatus("error", error.message || "照片上傳失敗，請稍後再試");
    } finally {
      photoState.busy = false;
    }
  }

  async function handlePhotoDelete(photoId) {
    if (!photoId || photoState.busy) return;
    if (!confirm("確定要刪除這張照片嗎？刪除後無法復原。")) return;

    photoState.busy = true;
    setStatus("info", "刪除照片中…");
    try {
      await window.ownerApi.deleteComparisonPhoto(photoState.customerId, photoId);
      setStatus("success", "照片已刪除");
      await refreshPhotoSets();
    } catch (error) {
      setStatus("error", error.message || "刪除照片失敗，請稍後再試");
    } finally {
      photoState.busy = false;
    }
  }

  async function handlePhotoSetDelete(setId) {
    if (!setId || photoState.busy) return;
    if (!confirm("確定要刪除整組前後對比照片嗎？組內照片會一併刪除，無法復原。")) {
      return;
    }

    photoState.busy = true;
    setStatus("info", "刪除照片組中…");
    try {
      await window.ownerApi.deletePhotoSet(photoState.customerId, setId);
      setStatus("success", "照片組已刪除");
      await refreshPhotoSets();
    } catch (error) {
      setStatus("error", error.message || "刪除照片組失敗，請稍後再試");
    } finally {
      photoState.busy = false;
    }
  }

  async function handlePhotoSetCreate() {
    if (!photoState.customerId || photoState.busy) return;
    photoState.busy = true;
    if (els.photoSetCreateBtn) els.photoSetCreateBtn.disabled = true;
    setStatus("info", "建立照片組中…");
    try {
      await window.ownerApi.createPhotoSet(photoState.customerId, {
        title: els.photoSetTitle ? els.photoSetTitle.value.trim() : "",
        capturedAt: els.photoSetDate ? els.photoSetDate.value.trim() : ""
      });
      if (els.photoSetTitle) els.photoSetTitle.value = "";
      if (els.photoSetDate) els.photoSetDate.value = "";
      setStatus("success", "照片組已建立");
      await refreshPhotoSets();
    } catch (error) {
      setStatus("error", error.message || "建立照片組失敗，請稍後再試");
    } finally {
      photoState.busy = false;
      if (els.photoSetCreateBtn) els.photoSetCreateBtn.disabled = false;
    }
  }

  async function handleSaveCustomerEdit() {
    var detail = state.selectedCustomer;
    if (!detail || !detail.customerId) return;
    var payload = {
      customerName: els.customerEditName.value.trim(),
      phone: els.customerEditPhone.value.trim(),
      birthday: els.customerEditBirthday.value.trim(),
      note: els.customerEditNote ? els.customerEditNote.value.trim() : ""
    };
    if (!payload.customerName) {
      setStatus("error", "請填寫姓名");
      return;
    }
    // 電話允許空白（CSV 匯入客戶可能沒有電話），格式由後端驗證
    if (payload.note.length > CUSTOMER_NOTE_MAX_LENGTH) {
      setStatus("error", "客戶特別事項最長 " + CUSTOMER_NOTE_MAX_LENGTH + " 字");
      return;
    }
    setStatus("info", "儲存客戶資料中…");
    try {
      await window.ownerApi.updateCustomerById(detail.customerId, payload);
      await openCustomerDetail(detail.customerId);
      await loadCustomers(state.customerQuery);
      showCustomerDetailView();
      setStatus("success", "客戶資料已更新");
    } catch (error) {
      setStatus("error", error.message || "儲存客戶資料失敗，請稍後再試");
    }
  }

  // ──────────────── 客戶 CSV 匯入 ────────────────
  //
  // 安全規則：CSV 只以 FileReader 在本機讀成文字後直接送 preview／commit API，
  // 不記錄 CSV 內容；畫面上只渲染後端回傳的 maskedPreview（遮罩電話），
  // 前端不自行判斷 DB 重複，一律以後端 preview／commit 結果為準。

  var IMPORT_TARGETS = [
    { key: "name", label: "姓名" },
    { key: "phone", label: "電話" },
    { key: "birthday", label: "生日" },
    { key: "note", label: "備註" },
    { key: "customer_no", label: "會員／客戶編號" }
  ];

  // 與後端 customer-import.js 的常見標頭別名一致，只用於預設帶入，
  // 實際對應仍以使用者選擇＋後端驗證為準
  var IMPORT_ALIASES = {
    name: ["name", "姓名", "名字", "客戶姓名"],
    phone: ["phone", "電話", "手機", "手機號碼", "聯絡電話"],
    birthday: ["birthday", "生日", "出生日期"],
    note: ["note", "備註", "特別事項", "客戶備註"],
    customer_no: ["customer_no", "客戶編號", "會員編號"]
  };

  var OUTCOME_LABELS = {
    willCreate: "可建立",
    skipped: "略過",
    conflict: "衝突",
    error: "錯誤"
  };

  var importState = {
    csvText: "",
    header: [],
    canonicalHash: "",
    previewErrors: 0,
    previewing: false,
    committing: false
  };

  /** 只解析 CSV 第一個 record 當標頭（支援 BOM、CRLF、quoted 欄位） */
  function parseCsvHeaderLine(csvText) {
    var text = String(csvText || "");
    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
    var header = [];
    var field = "";
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; continue; }
          inQuotes = false;
          continue;
        }
        field += ch;
        continue;
      }
      if (ch === '"' && field === "") { inQuotes = true; continue; }
      if (ch === ",") { header.push(field.trim()); field = ""; continue; }
      if (ch === "\r" || ch === "\n") { break; }
      field += ch;
    }
    header.push(field.trim());
    // 空白標頭無法作為對應來源，直接不列入下拉選單
    return header.filter(function (h) { return h !== ""; });
  }

  function importMappingSelects() {
    return IMPORT_TARGETS.map(function (target) {
      return { key: target.key, el: $("import-map-" + target.key) };
    });
  }

  function resetImportPreviewState() {
    importState.canonicalHash = "";
    importState.previewErrors = 0;
    if (els.importSummary) {
      els.importSummary.innerHTML = "";
      els.importSummary.classList.add("hidden");
    }
    if (els.importPreviewList) {
      els.importPreviewList.innerHTML = "";
    }
    if (els.importResult) {
      els.importResult.innerHTML = "";
      els.importResult.classList.add("hidden");
    }
    updateImportButtons();
  }

  function updateImportButtons() {
    if (els.importPreviewBtn) {
      els.importPreviewBtn.disabled =
        importState.previewing || !importState.csvText;
    }
    if (els.importCommitBtn) {
      els.importCommitBtn.disabled =
        importState.committing ||
        !importState.canonicalHash ||
        importState.previewErrors > 0;
    }
  }

  function autoDetectImportColumn(targetKey, header, usedIndexes) {
    var aliases = IMPORT_ALIASES[targetKey];
    for (var i = 0; i < header.length; i++) {
      if (usedIndexes[i]) continue;
      var normalized = header[i].trim().toLowerCase();
      if (aliases.indexOf(normalized) !== -1 ||
          aliases.indexOf(header[i].trim()) !== -1) {
        return i;
      }
    }
    return -1;
  }

  function renderImportMapping(header) {
    var usedIndexes = {};
    importMappingSelects().forEach(function (item) {
      if (!item.el) return;
      var autoIndex = autoDetectImportColumn(item.key, header, usedIndexes);
      if (autoIndex !== -1) {
        usedIndexes[autoIndex] = true;
      }
      item.el.innerHTML =
        '<option value="">不匯入此欄</option>' +
        header.map(function (h, index) {
          var selected = index === autoIndex ? " selected" : "";
          return '<option value="' + escapeHtml(h) + '"' + selected + ">" +
            escapeHtml(h) + "</option>";
        }).join("");
    });
    if (els.importMapping) {
      els.importMapping.classList.remove("hidden");
    }
  }

  /** 讀取欄位對應；錯誤時回傳 { error }，姓名必選、來源欄不可重複 */
  function collectImportMapping() {
    var mapping = {};
    var usedSource = {};
    var duplicated = null;
    importMappingSelects().forEach(function (item) {
      var value = item.el ? item.el.value : "";
      mapping[item.key] = value || "";
      if (value) {
        if (usedSource[value]) {
          duplicated = value;
        }
        usedSource[value] = true;
      }
    });
    if (!mapping.name) {
      return { error: "請選擇姓名對應的來源欄位" };
    }
    if (duplicated) {
      return { error: "來源欄「" + duplicated + "」不可同時對應多個目標欄位" };
    }
    return { mapping: mapping };
  }

  function handleImportFileChange() {
    var input = els.importFile;
    var file = input && input.files && input.files[0];

    importState.csvText = "";
    importState.header = [];
    resetImportPreviewState();
    if (els.importMapping) {
      els.importMapping.classList.add("hidden");
    }

    if (!file) {
      updateImportButtons();
      return;
    }
    if (!/\.csv$/i.test(file.name)) {
      setStatus("error", "請選擇 .csv 檔案");
      input.value = "";
      updateImportButtons();
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      importState.csvText = String(reader.result || "");
      importState.header = parseCsvHeaderLine(importState.csvText);
      if (!importState.header.length) {
        setStatus("error", "讀不到 CSV 標頭列，請確認檔案內容");
        importState.csvText = "";
        updateImportButtons();
        return;
      }
      renderImportMapping(importState.header);
      updateImportButtons();
      setStatus("");
    };
    reader.onerror = function () {
      setStatus("error", "讀取檔案失敗，請重新選擇");
      importState.csvText = "";
      updateImportButtons();
    };
    reader.readAsText(file);
  }

  function renderImportSummary(summary, options) {
    if (!els.importSummary) return;
    var opts = options || {};
    var items = [
      { label: "總列數", value: summary.total },
      { label: opts.committed ? "已建立" : "可建立",
        value: opts.committed ? summary.created : summary.willCreate,
        cls: "import-stat--willCreate" },
      { label: "略過", value: summary.skipped, cls: "import-stat--skipped" },
      { label: "衝突", value: summary.conflicts, cls: "import-stat--conflict" }
    ];
    if (!opts.committed) {
      items.push({ label: "錯誤", value: summary.errors, cls: "import-stat--error" });
    }
    items.push({ label: "警告", value: summary.warnings, cls: "import-stat--warning" });

    els.importSummary.innerHTML = items.map(function (item) {
      return '<span class="import-stat ' + (item.cls || "") + '">' +
        item.label + " " + Number(item.value || 0) + "</span>";
    }).join("");
    els.importSummary.classList.remove("hidden");
  }

  function renderImportPreviewRows(rows) {
    if (!els.importPreviewList) return;
    els.importPreviewList.innerHTML = (rows || []).map(function (row) {
      var outcome = row.outcome || "";
      var label = OUTCOME_LABELS[outcome] || outcome;
      var preview = row.maskedPreview || {};
      var messages = []
        .concat(row.errors || [])
        .concat(row.conflicts || [])
        .concat(row.warnings || []);
      var metaParts = [];
      if (preview.phone) metaParts.push("電話 " + preview.phone);
      if (preview.birthday) metaParts.push("生日 " + preview.birthday);
      if (preview.customerNo) metaParts.push("編號 " + preview.customerNo);
      if (preview.note) metaParts.push("備註 " + preview.note);
      return (
        '<div class="import-row import-row--' + escapeHtml(outcome) + '">' +
          '<div class="import-row-head">' +
            '<span class="import-row-no">第 ' + Number(row.rowNumber) + " 列</span>" +
            '<span class="import-row-name">' + escapeHtml(preview.name || "") + "</span>" +
            '<span class="import-outcome import-outcome--' + escapeHtml(outcome) + '">' +
              escapeHtml(label) + "</span>" +
          "</div>" +
          (metaParts.length
            ? '<p class="import-row-meta">' + escapeHtml(metaParts.join("｜")) + "</p>"
            : "") +
          messages.map(function (message) {
            return '<p class="import-row-message">' + escapeHtml(message) + "</p>";
          }).join("") +
        "</div>"
      );
    }).join("");
  }

  async function handleImportPreview() {
    if (!importState.csvText || importState.previewing) return;
    var collected = collectImportMapping();
    if (collected.error) {
      setStatus("error", collected.error);
      return;
    }
    resetImportPreviewState();
    importState.previewing = true;
    updateImportButtons();
    setStatus("info", "產生匯入預覽中…");
    try {
      var result = await window.ownerApi.previewCustomerImport(
        importState.csvText,
        collected.mapping
      );
      importState.canonicalHash = (result && result.canonicalHash) || "";
      importState.previewErrors =
        (result && result.summary && result.summary.errors) || 0;
      renderImportSummary((result && result.summary) || {});
      renderImportPreviewRows((result && result.rows) || []);
      if (importState.previewErrors > 0) {
        setStatus("error",
          "預覽有 " + importState.previewErrors + " 列錯誤，請修正 CSV 後重新選擇檔案");
      } else {
        setStatus("success", "預覽完成，請確認後執行匯入");
      }
    } catch (error) {
      setStatus("error", error.message || "產生預覽失敗，請稍後再試");
    } finally {
      importState.previewing = false;
      updateImportButtons();
    }
  }

  async function handleImportCommit() {
    if (importState.committing) return;
    if (!importState.canonicalHash || importState.previewErrors > 0) {
      setStatus("error", "請先產生沒有錯誤的預覽，才能確認匯入");
      return;
    }
    var collected = collectImportMapping();
    if (collected.error) {
      setStatus("error", collected.error);
      return;
    }
    var confirmed = confirm(
      "確定要匯入嗎？\n" +
      "只會建立「可建立」的客戶；略過與衝突列不會建立。\n" +
      "匯入後無法由此畫面自動復原。"
    );
    if (!confirmed) return;

    importState.committing = true;
    updateImportButtons();
    if (els.importCommitBtn) {
      els.importCommitBtn.textContent = "匯入處理中…";
    }
    setStatus("info", "匯入中，請勿關閉頁面…");
    try {
      var result = await window.ownerApi.commitCustomerImport(
        importState.csvText,
        collected.mapping,
        importState.canonicalHash
      );
      var summary = (result && result.summary) || {};
      renderImportSummary(summary, { committed: true });
      if (result && result.rows) {
        renderImportPreviewRows(result.rows);
      }
      if (els.importResult) {
        var lines = [];
        if (result && result.alreadyImported) {
          lines.push("此批次先前已匯入過，本次未重複建立任何客戶。");
        } else {
          lines.push("匯入完成，已建立 " + Number(summary.created || 0) + " 位客戶。");
        }
        lines.push(
          "總列數 " + Number(summary.total || 0) +
          "、略過 " + Number(summary.skipped || 0) +
          "、衝突 " + Number(summary.conflicts || 0) +
          "、警告 " + Number(summary.warnings || 0) + "。"
        );
        els.importResult.innerHTML = lines.map(function (line) {
          return "<p>" + escapeHtml(line) + "</p>";
        }).join("");
        els.importResult.classList.remove("hidden");
      }
      // 已匯入的批次不可重複 commit
      importState.canonicalHash = "";
      setStatus("success",
        result && result.alreadyImported ? "此批次先前已匯入" : "匯入完成");
      await loadCustomers(state.customerQuery);
    } catch (error) {
      setStatus("error", error.message || "匯入失敗，請稍後再試");
    } finally {
      importState.committing = false;
      if (els.importCommitBtn) {
        els.importCommitBtn.textContent = "確認匯入";
      }
      updateImportButtons();
    }
  }

  function handleImportMappingChange() {
    // 對應改變後原 canonicalHash 失效，必須重新預覽
    if (importState.canonicalHash) {
      resetImportPreviewState();
      setStatus("info", "欄位對應已變更，請重新產生預覽");
    }
  }

  function scheduleCustomerSearch() {
    if (state.customerSearchTimer) {
      clearTimeout(state.customerSearchTimer);
    }
    state.customerSearchTimer = setTimeout(function () {
      loadCustomers(els.customerSearch.value).catch(function (e) {
        setStatus("error", e.message);
      });
    }, 350);
  }

  function switchTab(tabName) {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-tab") === tabName);
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.toggle("active", p.getAttribute("data-panel") === tabName);
    });

    if (tabName === "customers") {
      showCustomerListView();
      loadCustomers(els.customerSearch ? els.customerSearch.value : "").catch(function (e) {
        setStatus("error", e.message);
      });
    }
  }

  function cacheElements() {
    els.status = $("status");
    els.brand = $("brand");
    els.todayList = $("today-list");
    els.calendarGrid = $("calendar-grid");
    els.calendarMonthLabel = $("calendar-month-label");
    els.bookingDateSummary = $("booking-date-summary");
    els.serviceList = $("service-list");
    els.slotEditor = $("slot-editor");
    els.brandName = $("brand-name");
    els.primaryColor = $("primary-color");
    els.announcement = $("announcement");
    els.cancelPolicy = $("cancel-policy");
    els.bookingMinNoticeDays = $("booking-min-notice-days");
    els.cancellationMinNoticeDays = $("cancellation-min-notice-days");
    els.saveSettings = $("save-settings");
    els.depositEnabled = $("deposit-enabled");
    els.depositFields = $("deposit-fields");
    els.depositAmount = $("deposit-amount");
    els.bankName = $("bank-name");
    els.bankCode = $("bank-code");
    els.bankAccount = $("bank-account");
    els.bankAccountName = $("bank-account-name");
    els.depositNote = $("deposit-note");
    els.svcName = $("svc-name");
    els.svcDuration = $("svc-duration");
    els.svcPrice = $("svc-price");
    els.svcDesc = $("svc-desc");
    els.svcSort = $("svc-sort");
    els.svcSubmit = $("svc-submit");
    els.ownerCancelModal = $("owner-cancel-modal");
    els.ownerCancelSummary = $("owner-cancel-summary");
    els.ownerCancelReasonPreset = $("owner-cancel-reason-preset");
    els.ownerCancelReasonOther = $("owner-cancel-reason-other");
    els.ownerCancelOtherWrap = $("owner-cancel-other-wrap");
    els.ownerRescheduleModal = $("owner-reschedule-modal");
    els.ownerRescheduleSummary = $("owner-reschedule-summary");
    els.ownerRescheduleDate = $("owner-reschedule-date");
    els.ownerRescheduleTime = $("owner-reschedule-time");
    els.ownerRescheduleDismiss = $("owner-reschedule-dismiss");
    els.ownerRescheduleConfirm = $("owner-reschedule-confirm");
    els.customerListView = $("customer-list-view");
    els.customerDetailView = $("customer-detail-view");
    els.customerSearch = $("customer-search");
    els.customerList = $("customer-list");
    els.customerDetailHeader = $("customer-detail-header");
    els.customerBookingList = $("customer-booking-list");
    els.customerEditName = $("customer-edit-name");
    els.customerEditPhone = $("customer-edit-phone");
    els.customerEditBirthday = $("customer-edit-birthday");
    els.customerEditNote = $("customer-edit-note");
    els.customerEditNoteCount = $("customer-edit-note-count");
    els.customerEditSave = $("customer-edit-save");
    els.claimInviteCard = $("claim-invite-card");
    els.claimInviteStatus = $("claim-invite-status");
    els.claimInviteCreate = $("claim-invite-create");
    els.claimInviteRevoke = $("claim-invite-revoke");
    els.claimInviteResult = $("claim-invite-result");
    els.claimInviteLink = $("claim-invite-link");
    els.claimInviteCopy = $("claim-invite-copy");
    els.claimInviteQr = $("claim-invite-qr");
    els.photoSetsCard = $("photo-sets-card");
    els.photoSetTitle = $("photo-set-title");
    els.photoSetDate = $("photo-set-date");
    els.photoSetCreateBtn = $("photo-set-create-btn");
    els.photoSetList = $("photo-set-list");
    els.photoLightbox = $("photo-lightbox");
    els.photoLightboxClose = $("photo-lightbox-close");
    els.photoLightboxBody = $("photo-lightbox-body");
    els.photoLightboxStatus = $("photo-lightbox-status");
    els.photoLightboxImg = $("photo-lightbox-img");
    els.photoLightboxTitle = $("photo-lightbox-title");
    els.importFile = $("import-file");
    els.importMapping = $("import-mapping");
    els.importPreviewBtn = $("import-preview-btn");
    els.importCommitBtn = $("import-commit-btn");
    els.importSummary = $("import-summary");
    els.importPreviewList = $("import-preview-list");
    els.importResult = $("import-result");
  }

  function bindEvents() {
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        switchTab(tab.getAttribute("data-tab"));
      });
    });
    $("calendar-prev").addEventListener("click", function () {
      shiftCalendarMonth(-1);
    });
    $("calendar-next").addEventListener("click", function () {
      shiftCalendarMonth(1);
    });
    $("booking-today-btn").addEventListener("click", function () {
      goToTodayOnCalendar();
    });
    $("refresh-today").addEventListener("click", function () {
      refreshCalendarBookings().catch(function (e) { setStatus("error", e.message); });
    });
    els.svcSubmit.addEventListener("click", handleServiceSubmit);
    $("cancel-edit").addEventListener("click", clearServiceForm);
    $("save-slots").addEventListener("click", handleSaveSlots);
    $("save-settings").addEventListener("click", handleSaveSettings);
    els.depositEnabled.addEventListener("change", updateDepositFieldsState);
    $("owner-cancel-dismiss").addEventListener("click", closeOwnerCancelModal);
    $("owner-cancel-confirm").addEventListener("click", function () {
      submitOwnerCancel().catch(function (e) { setStatus("error", e.message); });
    });
    els.ownerCancelReasonPreset.addEventListener("change", function () {
      els.ownerCancelOtherWrap.hidden = els.ownerCancelReasonPreset.value !== "其他原因";
    });
    els.ownerCancelModal.addEventListener("click", function (event) {
      if (event.target === els.ownerCancelModal) {
        closeOwnerCancelModal();
      }
    });
    $("owner-reschedule-dismiss").addEventListener("click", closeOwnerRescheduleModal);
    $("owner-reschedule-confirm").addEventListener("click", function () {
      submitOwnerReschedule().catch(function (e) { setStatus("error", e.message); });
    });
    els.ownerRescheduleModal.addEventListener("click", function (event) {
      if (event.target === els.ownerRescheduleModal) {
        closeOwnerRescheduleModal();
      }
    });
    if (els.photoLightboxClose) {
      els.photoLightboxClose.addEventListener("click", closePhotoLightbox);
    }
    if (els.photoLightbox) {
      els.photoLightbox.addEventListener("click", function (event) {
        if (event.target === els.photoLightbox || event.target === els.photoLightboxBody) {
          closePhotoLightbox();
        }
      });
    }
    if (document.addEventListener) {
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && els.photoLightbox &&
            !els.photoLightbox.classList.contains("hidden")) {
          closePhotoLightbox();
        }
      });
    }
    $("customer-search-btn").addEventListener("click", function () {
      loadCustomers(els.customerSearch.value).catch(function (e) {
        setStatus("error", e.message);
      });
    });
    els.customerSearch.addEventListener("input", scheduleCustomerSearch);
    els.customerSearch.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        if (state.customerSearchTimer) clearTimeout(state.customerSearchTimer);
        loadCustomers(els.customerSearch.value).catch(function (e) {
          setStatus("error", e.message);
        });
      }
    });
    $("customer-back-btn").addEventListener("click", function () {
      showCustomerListView();
    });
    if (els.customerEditSave) {
      els.customerEditSave.addEventListener("click", function () {
        handleSaveCustomerEdit().catch(function (e) { setStatus("error", e.message); });
      });
    }
    if (els.customerEditNote) {
      els.customerEditNote.addEventListener("input", updateCustomerNoteCount);
    }
    if (els.claimInviteCreate) {
      els.claimInviteCreate.addEventListener("click", function () {
        handleClaimInviteCreate().catch(function (e) { setStatus("error", e.message); });
      });
    }
    if (els.claimInviteRevoke) {
      els.claimInviteRevoke.addEventListener("click", function () {
        handleClaimInviteRevoke().catch(function (e) { setStatus("error", e.message); });
      });
    }
    if (els.claimInviteCopy) {
      els.claimInviteCopy.addEventListener("click", handleClaimInviteCopy);
    }
    if (els.photoSetCreateBtn) {
      els.photoSetCreateBtn.addEventListener("click", function () {
        handlePhotoSetCreate().catch(function (e) { setStatus("error", e.message); });
      });
    }
    if (els.importFile) {
      els.importFile.addEventListener("change", handleImportFileChange);
    }
    if (els.importPreviewBtn) {
      els.importPreviewBtn.addEventListener("click", function () {
        handleImportPreview().catch(function (e) { setStatus("error", e.message); });
      });
    }
    if (els.importCommitBtn) {
      els.importCommitBtn.addEventListener("click", function () {
        handleImportCommit().catch(function (e) { setStatus("error", e.message); });
      });
    }
    importMappingSelects().forEach(function (item) {
      if (item.el) {
        item.el.addEventListener("change", handleImportMappingChange);
      }
    });
  }

  async function boot() {
    cacheElements();
    bindEvents();
    setStatus("info", "登入中…");

    try {
      await window.beautyLiffReady;
      state.user = window.beautyUser;
      if (!state.user || !state.user.userId) {
        throw new Error("無法取得 LINE 身分");
      }
      if (!window.ownerApi.isConfigured()) {
        throw new Error("API 尚未設定");
      }

      await loadSettings();
      var today = getTodayIso();
      await loadMonthBookings(getCurrentMonthIso(), today);
      await loadServices();
      await loadSlots();
      setStatus("");
    } catch (error) {
      setStatus("error", error.message || "發生未知錯誤");
    }
  }

  boot();
})();
