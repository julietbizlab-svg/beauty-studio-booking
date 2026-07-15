/**
 * 客人端預約主程式
 */
(function () {
  "use strict";

  var WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

  var state = {
    user: null,
    settings: null,
    services: [],
    selectedService: null,
    selectedDate: "",
    selectedTime: "",
    slots: [],
    bookings: [],
    calendarMonth: "",
    monthDays: {}
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(type, message) {
    var el = els.status;
    el.className = "status" + (type ? " " + type : "");
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  function setStatusAlert(type, title, lines) {
    var el = els.status;
    var body = Array.isArray(lines) ? lines : [lines];
    el.className = "status status-alert" + (type ? " " + type : "");
    el.innerHTML =
      '<p class="status-alert-title">' + escapeHtml(title) + "</p>" +
      body.map(function (line) {
        return '<p class="status-alert-body">' + escapeHtml(line) + "</p>";
      }).join("");
    el.style.display = "block";
  }

  function isSameDayBookingLimitError(message) {
    var msg = String(message || "");
    return msg.indexOf("同一天僅能預約") !== -1 || msg.indexOf("同一天只能預約") !== -1;
  }

  function applyTheme(settings) {
    if (!settings) return;
    if (settings.primaryColor) {
      document.documentElement.style.setProperty("--primary", settings.primaryColor);
    }
    if (settings.brandName) {
      els.brand.textContent = settings.brandName;
    }
    if (settings.announcement) {
      els.announcement.textContent = settings.announcement;
      els.announcement.style.display = "block";
    } else {
      els.announcement.style.display = "none";
    }
  }

  function formatDateZh(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    return parts[0] + "/" + parts[1] + "/" + parts[2];
  }

  function getTodayIso() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  }

  function getCurrentMonthIso() {
    return getTodayIso().slice(0, 7);
  }

  function pad2(num) {
    return String(num).padStart(2, "0");
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

  function getWeekdayLabel(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return "週" + WEEKDAYS[date.getDay()];
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

  function getDaySummary(date) {
    return state.monthDays[date] || { bookable: false, slotCount: 0, reason: "closed" };
  }

  function updateCalendarVisibility() {
    var hasService = Boolean(state.selectedService);
    if (els.calendarSection) {
      els.calendarSection.hidden = !hasService;
    }
    if (els.calendarPlaceholder) {
      els.calendarPlaceholder.style.display = hasService ? "none" : "block";
    }
  }

  function updateSelectedDateSummary() {
    if (!els.selectedDateSummary) {
      return;
    }
    if (!state.selectedDate) {
      els.selectedDateSummary.textContent = "";
      return;
    }
    els.selectedDateSummary.textContent =
      "已選：" + formatDateZh(state.selectedDate) + "（" + getWeekdayLabel(state.selectedDate) + "）";
  }

  function renderCalendar() {
    if (!els.calendarGrid) {
      return;
    }

    if (!state.selectedService) {
      els.calendarGrid.innerHTML = "";
      updateSelectedDateSummary();
      return;
    }

    var month = state.calendarMonth || getCurrentMonthIso();
    var today = getTodayIso();
    if (els.calendarMonthLabel) {
      els.calendarMonthLabel.textContent = formatMonthTitle(month);
    }

    var cells = buildCalendarCells(month);
    els.calendarGrid.innerHTML = cells.map(function (cell) {
      if (cell.empty) {
        return '<div class="calendar-cell calendar-cell--empty"></div>';
      }

      var summary = getDaySummary(cell.date);
      var classes = ["calendar-day"];
      var disabled = !summary.bookable;

      if (disabled) {
        classes.push("calendar-day--disabled");
      } else {
        classes.push("calendar-day--bookable");
      }
      if (cell.date === state.selectedDate) {
        classes.push("calendar-day--selected");
      }
      if (cell.date === today) {
        classes.push("calendar-day--today");
      }

      var dayNum = Number(cell.date.split("-")[2]);
      var attrs = disabled
        ? ' disabled aria-disabled="true"'
        : ' data-date="' + cell.date + '"';

      return (
        '<button type="button" class="' + classes.join(" ") + '"' + attrs + ">" +
          '<span class="calendar-day-num">' + dayNum + "</span>" +
        "</button>"
      );
    }).join("");

    els.calendarGrid.querySelectorAll(".calendar-day:not([disabled])").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectDate(btn.getAttribute("data-date"));
      });
    });

    updateSelectedDateSummary();
  }

  function clearDateAndSlots() {
    state.selectedDate = "";
    state.selectedTime = "";
    state.slots = [];
    renderSlots();
    updateBookButton();
    updateSelectedDateSummary();
    renderCalendar();
  }

  function selectDate(date, options) {
    var opts = options || {};
    if (!date || !state.selectedService) {
      return;
    }
    var summary = getDaySummary(date);
    if (!summary.bookable && !opts.force) {
      return;
    }

    state.selectedDate = date;
    state.selectedTime = "";
    renderCalendar();
    loadSlots();
  }

  async function loadMonthCalendar(month) {
    if (!state.selectedService) {
      return;
    }

    setStatus("", "載入月曆中…");
    try {
      var result = await window.beautyApi.getSlotsForMonth(month, state.selectedService.id);
      state.calendarMonth = result.month || month;
      state.monthDays = result.days || {};
      setStatus("");
      renderCalendar();
    } catch (error) {
      setStatus("error", error.message);
    }
  }

  function shiftCalendarMonth(delta) {
    if (!state.selectedService) {
      return;
    }
    var newMonth = addMonths(state.calendarMonth || getCurrentMonthIso(), delta);
    clearDateAndSlots();
    loadMonthCalendar(newMonth).catch(function (e) { setStatus("error", e.message); });
  }

  function goToTodayOnCalendar() {
    if (!state.selectedService) {
      return;
    }
    var today = getTodayIso();
    var currentMonth = getCurrentMonthIso();

    function afterMonthLoaded() {
      selectDate(today, { force: true });
    }

    if (state.calendarMonth === currentMonth && Object.keys(state.monthDays).length) {
      afterMonthLoaded();
      return;
    }

    state.calendarMonth = currentMonth;
    clearDateAndSlots();
    loadMonthCalendar(currentMonth)
      .then(afterMonthLoaded)
      .catch(function (e) { setStatus("error", e.message); });
  }

  function renderServices() {
    var container = els.serviceList;
    if (!state.services.length) {
      container.innerHTML = '<div class="empty">目前沒有可預約的服務</div>';
      return;
    }
    container.innerHTML = state.services.map(function (s) {
      var selected = state.selectedService && state.selectedService.id === s.id ? " selected" : "";
      var priceText = s.price ? "NT$ " + s.price : "";
      return (
        '<div class="card service-item' + selected + '" data-id="' + s.id + '">' +
          '<h3>' + escapeHtml(s.name) + '</h3>' +
          '<p>' + escapeHtml(s.description || "") + '</p>' +
          '<div class="service-meta">' +
            '<span>' + s.durationMinutes + ' 分鐘</span>' +
            '<span class="price">' + priceText + '</span>' +
          '</div>' +
        '</div>'
      );
    }).join("");

    container.querySelectorAll(".service-item").forEach(function (el) {
      el.addEventListener("click", function () {
        var id = el.getAttribute("data-id");
        state.selectedService = state.services.find(function (s) { return s.id === id; });
        clearDateAndSlots();
        updateCalendarVisibility();
        state.calendarMonth = getCurrentMonthIso();
        loadMonthCalendar(state.calendarMonth).catch(function (e) { setStatus("error", e.message); });
        renderServices();
      });
    });
  }

  function renderSlots() {
    var container = els.slotGrid;
    if (!state.selectedService) {
      container.innerHTML = '<div class="empty">請先選擇服務</div>';
      return;
    }
    if (!state.selectedDate) {
      container.innerHTML = '<div class="empty">請選擇日期</div>';
      return;
    }
    if (!state.slots.length) {
      container.innerHTML = '<div class="empty">此日期沒有可預約時段</div>';
      return;
    }
    container.innerHTML = state.slots.map(function (time) {
      var selected = state.selectedTime === time ? " selected" : "";
      return '<button type="button" class="slot-btn' + selected + '" data-time="' + time + '">' + time + '</button>';
    }).join("");

    container.querySelectorAll(".slot-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.selectedTime = btn.getAttribute("data-time");
        renderSlots();
        updateBookButton();
      });
    });
  }

  function bookingDateTimeKey(booking) {
    var date = booking && booking.date ? String(booking.date) : "";
    var time = booking && booking.time ? String(booking.time) : "00:00";
    return date + "T" + time;
  }

  function getNowDateTimeKey() {
    var now = new Date();
    var parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(now);
    var map = {};
    parts.forEach(function (part) {
      if (part.type !== "literal") map[part.type] = part.value;
    });
    return map.year + "-" + map.month + "-" + map.day + "T" + map.hour + ":" + map.minute;
  }

  function sortBookingsForDisplay(bookings) {
    var nowKey = getNowDateTimeKey();
    return (bookings || []).slice().sort(function (a, b) {
      var aConfirmed = a.status === "已確認" ? 0 : 1;
      var bConfirmed = b.status === "已確認" ? 0 : 1;
      if (aConfirmed !== bConfirmed) return aConfirmed - bConfirmed;

      var aKey = bookingDateTimeKey(a);
      var bKey = bookingDateTimeKey(b);
      var aPast = aKey < nowKey;
      var bPast = bKey < nowKey;
      if (aPast !== bPast) return aPast ? 1 : -1;

      if (!aPast && !bPast) {
        if (aKey < bKey) return -1;
        if (aKey > bKey) return 1;
        return 0;
      }

      if (aKey > bKey) return -1;
      if (aKey < bKey) return 1;
      return 0;
    });
  }

  function renderBookings() {
    var container = els.bookingList;
    if (!state.bookings.length) {
      container.innerHTML = '<div class="empty">尚無預約紀錄</div>';
      return;
    }
    var sorted = sortBookingsForDisplay(state.bookings);
    container.innerHTML = sorted.map(function (b) {
      var isConfirmed = b.status === "已確認";
      var statusClass = isConfirmed ? "confirmed" : "cancelled";
      var cardClass = isConfirmed ? "card booking-card booking-card--confirmed" : "card booking-card booking-card--cancelled";
      var cancelBtn = isConfirmed
        ? '<button type="button" class="btn btn-danger" data-cancel="' + b.id + '">取消預約</button>'
        : "";
      var reasonLine = b.status === "已取消" && b.cancelReason
        ? '<p class="booking-cancel-reason">取消原因：' + escapeHtml(b.cancelReason) + "</p>"
        : (b.status === "已取消" && b.canceledBy === "業主"
          ? '<p class="booking-cancel-reason">此預約由業主取消</p>'
          : "");
      return (
        '<div class="' + cardClass + '">' +
          '<h3>' + escapeHtml(b.serviceName) + '</h3>' +
          '<p>' + formatDateZh(b.date) + ' ' + escapeHtml(b.time) + '</p>' +
          '<span class="booking-status ' + statusClass + '">' + escapeHtml(b.status) + '</span>' +
          reasonLine +
          cancelBtn +
        '</div>'
      );
    }).join("");

    container.querySelectorAll("[data-cancel]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openCancelConfirmModal(btn.getAttribute("data-cancel"));
      });
    });
  }

  function updateBookButton() {
    var profile = getCustomerProfileFromForm();
    var ready = state.selectedService && state.selectedDate && state.selectedTime &&
      profile.customerName && profile.phone;
    els.bookBtn.disabled = !ready;
  }

  function getCustomerProfileStorageKey() {
    var userId = state.user && state.user.userId ? state.user.userId : "";
    return userId ? ("beauty_customer_profile_" + userId) : "";
  }

  function getCustomerProfileFromForm() {
    return {
      customerName: els.customerName ? String(els.customerName.value || "").trim() : "",
      phone: els.customerPhone ? String(els.customerPhone.value || "").trim().replace(/\s+/g, "") : "",
      birthday: els.customerBirthday ? String(els.customerBirthday.value || "").trim() : ""
    };
  }

  function saveCustomerProfileLocal(profile) {
    var key = getCustomerProfileStorageKey();
    if (!key || !window.localStorage) return;
    try {
      window.localStorage.setItem(key, JSON.stringify({
        customerName: profile.customerName || "",
        phone: profile.phone || "",
        birthday: profile.birthday || ""
      }));
    } catch (ignore) {}
  }

  function loadCustomerProfileLocal() {
    var key = getCustomerProfileStorageKey();
    if (!key || !window.localStorage) return null;
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (ignore) {
      return null;
    }
  }

  function fillCustomerProfileForm() {
    if (!els.customerName || !els.customerPhone || !els.customerBirthday) return;
    var saved = loadCustomerProfileLocal() || {};
    els.customerName.value = saved.customerName || (state.user && state.user.displayName) || "";
    els.customerPhone.value = saved.phone || "";
    els.customerBirthday.value = saved.birthday || "";
    updateBookButton();
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadSettings() {
    state.settings = await window.beautyApi.getSettings();
    applyTheme(state.settings);
  }

  function hideDepositTransferBox() {
    if (!els.depositTransferBox) return;
    els.depositTransferBox.hidden = true;
    els.depositTransferBox.innerHTML = "";
  }

  function buildDepositTransferHtml(settings, ids) {
    var s = settings || {};
    if (!s.depositEnabled) return "";

    var amount = s.depositAmount != null ? s.depositAmount : "";
    var bankLine = escapeHtml(s.bankName || "");
    if (s.bankCode) {
      bankLine += (bankLine ? "（" : "") + escapeHtml(s.bankCode) + (s.bankName ? "）" : "");
    }

    return (
      "<h3>訂金轉帳資訊</h3>" +
      "<p>若需支付訂金，請轉帳至以下帳戶：</p>" +
      (amount !== "" ? "<p>金額：NT$ " + escapeHtml(String(amount)) + "</p>" : "") +
      (bankLine ? "<p>銀行：" + bankLine + "</p>" : "") +
      "<p>帳號：<span class=\"deposit-account\" id=\"" + ids.accountTextId + "\">" +
        escapeHtml(s.bankAccount || "") + "</span></p>" +
      "<p>戶名：" + escapeHtml(s.bankAccountName || "") + "</p>" +
      (s.depositNote
        ? "<p class=\"deposit-note\">" + escapeHtml(s.depositNote) + "</p>"
        : "") +
      (s.bankAccount
        ? "<button type=\"button\" class=\"btn btn-small btn-copy\" id=\"" + ids.copyBtnId + "\">複製帳號</button>"
        : "")
    );
  }

  function wireDepositCopyButton(copyBtnId, bankAccount) {
    var copyBtn = $(copyBtnId);
    if (!copyBtn || !bankAccount || !navigator.clipboard || !navigator.clipboard.writeText) {
      return;
    }
    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(String(bankAccount)).then(function () {
        copyBtn.textContent = "已複製";
      }).catch(function () {
        copyBtn.textContent = "請手動複製";
      });
    });
  }

  function fillDepositContainer(container, settings, ids) {
    if (!container) return;
    var s = settings || state.settings || {};
    var html = buildDepositTransferHtml(s, ids);
    if (!html) {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }
    container.innerHTML = html;
    container.hidden = false;
    wireDepositCopyButton(ids.copyBtnId, s.bankAccount);
  }

  function renderDepositTransferBox(settings) {
    fillDepositContainer(els.depositTransferBox, settings, {
      accountTextId: "deposit-account-text",
      copyBtnId: "copy-deposit-account"
    });
  }

  function hideBookingSuccessModal() {
    if (!els.bookingSuccessModal) return;
    els.bookingSuccessModal.classList.add("hidden");
  }

  function showBookingSuccessModal(details) {
    if (!els.bookingSuccessModal) return;
    els.bookingSuccessName.textContent = details.guestName || "";
    els.bookingSuccessService.textContent = details.serviceName || "";
    els.bookingSuccessDate.textContent =
      formatDateZh(details.date) +
      (details.date ? "（" + getWeekdayLabel(details.date) + "）" : "");
    els.bookingSuccessTime.textContent = details.time || "";
    fillDepositContainer(els.bookingSuccessDeposit, state.settings, {
      accountTextId: "success-deposit-account-text",
      copyBtnId: "copy-success-deposit-account"
    });
    els.bookingSuccessModal.classList.remove("hidden");
    var card = els.bookingSuccessModal.querySelector(".modal-card");
    if (card) {
      card.style.animation = "none";
      void card.offsetWidth;
      card.style.animation = "";
    }
  }

  async function loadServices() {
    state.services = await window.beautyApi.getServices();
    renderServices();
    updateCalendarVisibility();
  }

  async function loadSlots() {
    if (!state.selectedService || !state.selectedDate) return;
    setStatus("", "載入時段中…");
    try {
      var result = await window.beautyApi.getSlots(state.selectedDate, state.selectedService.id);
      state.slots = result.slots || [];
      state.selectedTime = "";
      setStatus("");
      renderSlots();
      updateBookButton();
    } catch (error) {
      setStatus("error", error.message);
    }
  }

  async function loadBookings() {
    state.bookings = await window.beautyApi.getMyBookings(state.user.userId);
    renderBookings();
  }

  async function handleBook() {
    if (!state.selectedService || !state.selectedDate || !state.selectedTime) return;
    var profile = getCustomerProfileFromForm();
    if (!profile.customerName) {
      setStatus("error", "請填寫姓名");
      return;
    }
    if (!profile.phone) {
      setStatus("error", "請填寫電話");
      return;
    }
    els.bookBtn.disabled = true;
    setStatus("", "送出預約中…");
    var bookedServiceName = state.selectedService.name || "";
    var bookedDate = state.selectedDate;
    var bookedTime = state.selectedTime;
    try {
      await window.beautyApi.createBooking({
        userId: state.user.userId,
        displayName: state.user.displayName,
        customerName: profile.customerName,
        phone: profile.phone,
        birthday: profile.birthday || "",
        serviceId: state.selectedService.id,
        date: bookedDate,
        time: bookedTime
      });
      saveCustomerProfileLocal(profile);
      setStatus("");
      state.selectedTime = "";
      try {
        state.settings = await window.beautyApi.getSettings();
        applyTheme(state.settings);
      } catch (ignore) {}
      renderDepositTransferBox(state.settings);
      showBookingSuccessModal({
        guestName: profile.customerName,
        serviceName: bookedServiceName,
        date: bookedDate,
        time: bookedTime
      });
      await loadMonthCalendar(state.calendarMonth || getCurrentMonthIso());
      await loadSlots();
      await loadBookings();
    } catch (error) {
      setStatus("");
      showBookingFailModal(error && error.message);
    } finally {
      updateBookButton();
    }
  }

  function hideBookingFailModal() {
    if (!els.bookingFailModal) return;
    els.bookingFailModal.classList.add("hidden");
  }

  function showBookingFailModal(message) {
    if (!els.bookingFailModal || !els.bookingFailBody) return;
    var lines;
    if (isSameDayBookingLimitError(message)) {
      lines = [
        { text: "同一天僅能預約一個時段", primary: true },
        { text: "如需安排多個項目，請聯絡店家協助處理。" }
      ];
    } else {
      lines = [
        { text: message || "預約失敗，請稍後再試。", primary: true }
      ];
    }
    els.bookingFailBody.innerHTML = lines.map(function (line) {
      var cls = line.primary ? "booking-fail-primary" : "";
      return '<p class="' + cls + '">' + escapeHtml(line.text) + "</p>";
    }).join("");
    els.bookingFailModal.classList.remove("hidden");
    var card = els.bookingFailModal.querySelector(".modal-card");
    if (card) {
      card.style.animation = "none";
      void card.offsetWidth;
      card.style.animation = "";
    }
  }

  function handleBookingFailAck() {
    hideBookingFailModal();
  }

  function handleBookingSuccessView() {
    hideBookingSuccessModal();
    switchTab("bookings");
  }

  function handleBookingSuccessAgain() {
    hideBookingSuccessModal();
    switchTab("book");
    setStatus("");
  }

  var cancelModalState = { bookingId: "", submitting: false };

  function openCancelConfirmModal(bookingId) {
    if (!els.cancelConfirmModal || !bookingId) return;
    cancelModalState.bookingId = bookingId;
    cancelModalState.submitting = false;
    if (els.cancelConfirmYes) {
      els.cancelConfirmYes.disabled = false;
      els.cancelConfirmYes.textContent = "確認取消";
    }
    if (els.cancelConfirmNo) els.cancelConfirmNo.disabled = false;
    els.cancelConfirmModal.classList.remove("hidden");
    var card = els.cancelConfirmModal.querySelector(".modal-card");
    if (card) {
      card.style.animation = "none";
      void card.offsetWidth;
      card.style.animation = "";
    }
  }

  function hideCancelConfirmModal() {
    if (els.cancelConfirmModal) {
      els.cancelConfirmModal.classList.add("hidden");
    }
    cancelModalState.bookingId = "";
    cancelModalState.submitting = false;
  }

  async function confirmCancelBooking() {
    var bookingId = cancelModalState.bookingId;
    if (!bookingId || cancelModalState.submitting) return;
    cancelModalState.submitting = true;
    if (els.cancelConfirmYes) {
      els.cancelConfirmYes.disabled = true;
      els.cancelConfirmYes.textContent = "取消中…";
    }
    if (els.cancelConfirmNo) els.cancelConfirmNo.disabled = true;
    setStatus("", "取消中…");
    try {
      await window.beautyApi.cancelBooking(state.user.userId, bookingId);
      hideCancelConfirmModal();
      setStatus("success", "已取消預約");
      await loadBookings();
      if (state.selectedService) {
        await loadMonthCalendar(state.calendarMonth || getCurrentMonthIso());
      }
      if (state.selectedDate && state.selectedService) {
        await loadSlots();
      }
    } catch (error) {
      cancelModalState.submitting = false;
      if (els.cancelConfirmYes) {
        els.cancelConfirmYes.disabled = false;
        els.cancelConfirmYes.textContent = "確認取消";
      }
      if (els.cancelConfirmNo) els.cancelConfirmNo.disabled = false;
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
    if (tabName === "bookings") {
      loadBookings().catch(function (e) { setStatus("error", e.message); });
    }
  }

  function bindEvents() {
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        switchTab(tab.getAttribute("data-tab"));
      });
    });

    els.calendarPrev.addEventListener("click", function () {
      shiftCalendarMonth(-1);
    });
    els.calendarNext.addEventListener("click", function () {
      shiftCalendarMonth(1);
    });
    els.calendarTodayBtn.addEventListener("click", function () {
      goToTodayOnCalendar();
    });

    els.bookBtn.addEventListener("click", handleBook);
    if (els.customerName) {
      els.customerName.addEventListener("input", updateBookButton);
    }
    if (els.customerPhone) {
      els.customerPhone.addEventListener("input", updateBookButton);
    }
    if (els.customerBirthday) {
      els.customerBirthday.addEventListener("change", updateBookButton);
    }
    if (els.bookingSuccessView) {
      els.bookingSuccessView.addEventListener("click", handleBookingSuccessView);
    }
    if (els.bookingSuccessAgain) {
      els.bookingSuccessAgain.addEventListener("click", handleBookingSuccessAgain);
    }
    if (els.bookingFailAck) {
      els.bookingFailAck.addEventListener("click", handleBookingFailAck);
    }
    if (els.cancelConfirmYes) {
      els.cancelConfirmYes.addEventListener("click", function () {
        confirmCancelBooking().catch(function (e) { setStatus("error", e.message); });
      });
    }
    if (els.cancelConfirmNo) {
      els.cancelConfirmNo.addEventListener("click", function () {
        if (cancelModalState.submitting) return;
        hideCancelConfirmModal();
      });
    }
    if (els.cancelConfirmModal) {
      els.cancelConfirmModal.addEventListener("click", function (event) {
        if (event.target === els.cancelConfirmModal && !cancelModalState.submitting) {
          hideCancelConfirmModal();
        }
      });
    }
  }

  function cacheElements() {
    els.status = $("status");
    els.brand = $("brand");
    els.announcement = $("announcement");
    els.serviceList = $("service-list");
    els.calendarSection = $("calendar-section");
    els.calendarPlaceholder = $("calendar-placeholder");
    els.calendarGrid = $("calendar-grid");
    els.calendarMonthLabel = $("calendar-month-label");
    els.calendarPrev = $("calendar-prev");
    els.calendarNext = $("calendar-next");
    els.calendarTodayBtn = $("calendar-today-btn");
    els.selectedDateSummary = $("selected-date-summary");
    els.slotGrid = $("slot-grid");
    els.customerName = $("customer-name");
    els.customerPhone = $("customer-phone");
    els.customerBirthday = $("customer-birthday");
    els.bookBtn = $("book-btn");
    els.bookingList = $("booking-list");
    els.depositTransferBox = $("deposit-transfer-box");
    els.bookingSuccessModal = $("booking-success-modal");
    els.bookingSuccessName = $("booking-success-name");
    els.bookingSuccessService = $("booking-success-service");
    els.bookingSuccessDate = $("booking-success-date");
    els.bookingSuccessTime = $("booking-success-time");
    els.bookingSuccessDeposit = $("booking-success-deposit");
    els.bookingSuccessView = $("booking-success-view");
    els.bookingSuccessAgain = $("booking-success-again");
    els.bookingFailModal = $("booking-fail-modal");
    els.bookingFailBody = $("booking-fail-body");
    els.bookingFailAck = $("booking-fail-ack");
    els.cancelConfirmModal = $("cancel-confirm-modal");
    els.cancelConfirmYes = $("cancel-confirm-yes");
    els.cancelConfirmNo = $("cancel-confirm-no");
    els.userName = $("user-name");
    els.userAvatar = $("user-avatar");
  }

  async function boot() {
    cacheElements();
    bindEvents();
    setStatus("", "登入中…");

    try {
      await window.beautyLiffReady;
      state.user = window.beautyUser;
      if (!state.user || !state.user.userId) {
        throw new Error("無法取得 LINE 身分，請從 LINE 重新開啟");
      }

      els.userName.textContent = state.user.displayName;
      if (state.user.pictureUrl) {
        els.userAvatar.src = state.user.pictureUrl;
        els.userAvatar.style.display = "block";
      }
      fillCustomerProfileForm();

      if (!window.beautyApi.isConfigured()) {
        throw new Error("API 尚未設定");
      }

      setStatus("", "載入中…");
      await loadSettings();
      await loadServices();
      await loadBookings();
      setStatus("");
    } catch (error) {
      setStatus("error", error.message || "發生未知錯誤");
    }
  }

  boot();
})();
