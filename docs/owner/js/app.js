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
    editingServiceId: null
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

    container.innerHTML = bookings.map(function (b) {
      var isCancelled = b.status === "已取消";
      var cardClass = "card booking-card" + (isCancelled ? " booking-card--cancelled" : "");
      var statusClass = isCancelled ? "booking-status cancelled" : "booking-status confirmed";
      return (
        '<div class="' + cardClass + '">' +
          '<div class="booking-card-head">' +
            '<span class="booking-time">' + escapeHtml(b.time) + '</span>' +
            '<span class="' + statusClass + '">' + escapeHtml(b.status || "已確認") + '</span>' +
          '</div>' +
          '<h3 class="booking-service">' + escapeHtml(b.serviceName || "服務") + '</h3>' +
          '<p class="booking-customer">' + escapeHtml(b.customerName || "客人") + '</p>' +
          '<p class="booking-date-line">' + formatDateZh(b.date || date) + '</p>' +
        '</div>'
      );
    }).join("");
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
    try {
      await window.ownerApi.updateSettings(state.user.userId, payload);
      await loadSettings();
      setStatus("success", "店面設定已更新");
    } catch (error) {
      setStatus("error", error.message);
    }
  }

  function switchTab(tabName) {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-tab") === tabName);
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.toggle("active", p.getAttribute("data-panel") === tabName);
    });
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
