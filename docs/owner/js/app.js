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
      var cardClass = "card booking-card" + (isCancelled ? " booking-card--cancelled" : " booking-card--confirmed");
      var statusClass = isCancelled ? "booking-status cancelled" : "booking-status confirmed";
      var reasonLine = isCancelled && b.cancelReason
        ? '<p class="booking-cancel-reason">取消原因：' + escapeHtml(b.cancelReason) + "</p>"
        : "";
      var cancelBtn = !isCancelled
        ? '<button type="button" class="btn btn-danger btn-cancel-booking" data-cancel-id="' +
          escapeHtml(b.id) + '">取消預約</button>'
        : "";
      return (
        '<div class="' + cardClass + '">' +
          '<div class="booking-card-head">' +
            '<span class="booking-time">' + escapeHtml(b.time) + '</span>' +
            '<span class="' + statusClass + '">' + escapeHtml(b.status || "已確認") + '</span>' +
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
          cancelBtn +
        '</div>'
      );
    }).join("");

    container.querySelectorAll("[data-cancel-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-cancel-id");
        var booking = sorted.find(function (b) { return b.id === id; });
        openOwnerCancelModal(booking || { id: id, date: date });
      });
    });
  }

  function sortOwnerDayBookings(bookings) {
    return (bookings || []).slice().sort(function (a, b) {
      var aRank = a.status === "已確認" ? 0 : (a.status === "已取消" ? 1 : 2);
      var bRank = b.status === "已確認" ? 0 : (b.status === "已取消" ? 1 : 2);
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
      var message = (error && error.message) ? error.message : "儲存設定失敗，請稍後再試";
      if (/儲存失敗|伺服器回應錯誤|Failed to fetch|NetworkError/i.test(message)) {
        message = "儲存設定失敗：" + message + "。請確認已填寫必填訂金欄位（金額、帳號、戶名），或稍後再試。";
      }
      setStatus("error", message);
    }
  }

  function showCustomerListView() {
    els.customerListView.classList.remove("hidden");
    els.customerDetailView.classList.add("hidden");
    state.selectedCustomer = null;
    // 返回名單即丟棄記憶體中的一次性邀請連結
    resetClaimInviteState();
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
