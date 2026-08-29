/* v2-test flexible assessment wording build 20260726004 */
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
    monthDays: {},
    serverProfile: null,
    profileLocked: false
  };
  var aiRecommendedServiceId = "";

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
    var appTitle = window.BEAUTY_CONFIG && window.BEAUTY_CONFIG.APP_TITLE;
    if (appTitle || settings.brandName) {
      els.brand.textContent = appTitle || settings.brandName;
    }
    if (settings.announcement) {
      els.announcement.textContent = settings.announcement;
      els.announcement.style.display = "block";
    } else {
      els.announcement.style.display = "none";
    }
    renderBookingNotice(settings);
  }

  function renderBookingNotice(settings) {
    if (!els.bookingNoticeHint) return;
    var days = settings && settings.bookingMinNoticeDays != null
      ? Number(settings.bookingMinNoticeDays) : 1;
    if (!Number.isInteger(days) || days < 0) {
      days = 1;
    }
    els.bookingNoticeHint.textContent = "本工作室需至少提前 " + days + " 天預約。";
    els.bookingNoticeHint.hidden = !state.selectedService;
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
    if (els.bookingNoticeHint) {
      els.bookingNoticeHint.hidden = !hasService;
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
        selectServiceById(el.getAttribute("data-id"));
      });
    });
  }

  function selectServiceById(id) {
    var selected = state.services.find(function (service) {
      return String(service.id) === String(id);
    });
    if (!selected) return;
    state.selectedService = selected;
    clearDateAndSlots();
    updateCalendarVisibility();
    state.calendarMonth = getCurrentMonthIso();
    loadMonthCalendar(state.calendarMonth).catch(function (e) {
      setStatus("error", e.message);
    });
    renderServices();
  }

  async function loadAiCapability() {
    if (!els.aiAssistant) return;
    if (!window.BEAUTY_CONFIG ||
        window.BEAUTY_CONFIG.PRODUCT_TIER !== "ai") {
      els.aiAssistant.hidden = true;
      return;
    }
    try {
      var capability = await window.beautyApi.getCustomerAiCapability();
      els.aiAssistant.hidden = !capability.enabled;
    } catch (ignore) {
      els.aiAssistant.hidden = true;
    }
  }

  async function askAiAssistant() {
    var message = String(els.aiMessage.value || "").trim();
    if (!message) {
      els.aiAnswer.textContent = "請先告訴我您的需求。";
      els.aiAnswer.hidden = false;
      return;
    }
    els.aiAskBtn.disabled = true;
    els.aiAskBtn.textContent = "AI 思考中…";
    els.aiApplyBtn.hidden = true;
    aiRecommendedServiceId = "";
    try {
      var result = await window.beautyApi.getCustomerAiRecommendation(
        message,
        state.selectedService ? state.selectedService.id : ""
      );
      els.aiAnswer.textContent = result.reply + "\n\n" + result.disclaimer;
      els.aiAnswer.hidden = false;
      aiRecommendedServiceId = result.recommendedServiceId || "";
      els.aiApplyBtn.hidden = !aiRecommendedServiceId;
    } catch (error) {
      els.aiAnswer.textContent = error.message || "AI 暫時無法提供建議";
      els.aiAnswer.hidden = false;
    } finally {
      els.aiAskBtn.disabled = false;
      els.aiAskBtn.textContent = "取得 AI 建議";
    }
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

  var reviewBookingId = "";
  var reviewSaving = false;
  var reviewMode = "existing";
  var additionalBookingResolver = null;

  function requiresReviewBeforeBooking() {
    return window.BEAUTY_CONFIG &&
      window.BEAUTY_CONFIG.ENVIRONMENT !== "demo-v1";
  }

  function setSurgeryHistoryValue(value) {
    var text = String(value || "").trim();
    var isNone = /^(?:無|沒有|無手術史)$/.test(text);
    els.reviewSurgeryNone.checked = isNone;
    els.reviewSurgeryYes.checked = Boolean(text) && !isNone;
    els.reviewSurgeryHistory.value = isNone ? "" : text;
    els.reviewSurgeryDetailWrap.hidden = !els.reviewSurgeryYes.checked;
  }

  function getSurgeryHistoryValue() {
    if (els.reviewSurgeryNone.checked) return "無";
    if (!els.reviewSurgeryYes.checked) return "";
    return els.reviewSurgeryHistory.value.trim();
  }

  function syncSurgeryHistoryChoice() {
    els.reviewSurgeryDetailWrap.hidden = !els.reviewSurgeryYes.checked;
    if (els.reviewSurgeryNone.checked) {
      els.reviewSurgeryHistory.value = "";
    }
  }

  function openNewBookingReview() {
    var profile = getCustomerProfileFromForm();
    if (!profile.customerName) {
      setStatus("error", "請填寫姓名");
      return;
    }
    if (!profile.phone) {
      setStatus("error", "請填寫電話");
      return;
    }
    reviewMode = "new-booking";
    reviewBookingId = "";
    els.reviewIntakeTitle.textContent = "填寫預約評估資料";
    setSurgeryHistoryValue("");
    els.reviewDiseaseHistory.value = "";
    els.reviewLastTreatment.value = "";
    els.reviewCustomerNote.value = "";
    els.reviewPhotoFiles.value = "";
    els.reviewPhotoRequest.hidden = true;
    els.reviewIntakeStatus.textContent =
      "請先填寫資料，本工作室會在受理前進行確認。";
    els.reviewIntakeSave.textContent = "送出評估資料";
    els.reviewIntakeDismiss.textContent = "返回";
    els.reviewIntakeModal.classList.remove("hidden");
  }

  function confirmAdditionalBooking() {
    var selectedDate = state.selectedDate;
    var today = getTodayIso();
    var activeStatuses = [
      "pending", "pending_review", "pending_customer_confirmation",
      "confirmed", "checked_in"
    ];
    var existing = (state.bookings || []).filter(function (booking) {
      var internal = booking.internalStatus || "";
      var active = activeStatuses.indexOf(internal) !== -1 ||
        booking.status === "已確認";
      return active && booking.date >= today && booking.date !== selectedDate;
    });
    if (!existing.length) return Promise.resolve(true);
    els.additionalBookingList.replaceChildren();
    existing.slice(0, 3).forEach(function (booking) {
      var item = document.createElement("li");
      item.innerHTML =
        "<strong>" + escapeHtml(formatDateZh(booking.date)) + " " +
        escapeHtml(booking.time || "") + "</strong>" +
        "<span>" + escapeHtml(booking.serviceName || "") + "</span>";
      els.additionalBookingList.appendChild(item);
    });
    els.additionalBookingMore.hidden = existing.length <= 3;
    els.additionalBookingMore.textContent = existing.length > 3
      ? "另有 " + (existing.length - 3) + " 筆預約"
      : "";
    els.additionalBookingModal.classList.remove("hidden");
    return new Promise(function (resolve) {
      additionalBookingResolver = resolve;
    });
  }

  function closeAdditionalBookingModal(confirmed) {
    els.additionalBookingModal.classList.add("hidden");
    if (!additionalBookingResolver) return;
    var resolve = additionalBookingResolver;
    additionalBookingResolver = null;
    resolve(Boolean(confirmed));
  }

  async function openReviewIntake(bookingId) {
    reviewMode = "existing";
    reviewBookingId = bookingId || "";
    if (!reviewBookingId) return;
    els.reviewIntakeTitle.textContent = "補充本工作室評估資料";
    els.reviewIntakeSave.textContent = "送出評估資料";
    els.reviewIntakeDismiss.textContent = "關閉";
    els.reviewIntakeModal.classList.remove("hidden");
    els.reviewIntakeStatus.textContent = "載入中…";
    try {
      var result = await window.beautyApi.getBookingReview(reviewBookingId);
      var intake = result.intake || {};
      setSurgeryHistoryValue(intake.surgeryHistory || "");
      els.reviewDiseaseHistory.value = intake.diseaseHistory || "";
      els.reviewLastTreatment.value = intake.lastTreatmentAt || "";
      els.reviewCustomerNote.value = intake.customerNote || "";
      els.reviewPhotoFiles.value = "";
      var requestedQuestions = [];
      if (intake.surgeryHistoryRequested) requestedQuestions.push("手術史");
      if (intake.diseaseHistoryRequested) requestedQuestions.push("健康狀況、過敏或用藥");
      if (intake.lastTreatmentRequested) requestedQuestions.push("上次相關施作時間");
      var requestMessages = [];
      if (requestedQuestions.length) {
        requestMessages.push("本工作室請您補答：" + requestedQuestions.join("、") +
          (intake.questionRequestNote ? "；" + intake.questionRequestNote : ""));
      }
      if (intake.photoRequested) {
        requestMessages.push("請補充照片：" +
          (intake.photoRequestNote || "請依本工作室指示上傳"));
      }
      els.reviewPhotoRequest.hidden = !requestMessages.length;
      els.reviewPhotoRequest.textContent = requestMessages.join(" ");
      els.reviewIntakeStatus.textContent = intake.submittedAt
        ? "已儲存；目前有 " + (intake.photos || []).length + " 張照片"
        : "";
    } catch (error) {
      els.reviewIntakeStatus.textContent = error.message;
    }
  }

  function closeReviewIntake() {
    if (reviewSaving) return;
    reviewMode = "existing";
    reviewBookingId = "";
    els.reviewIntakeModal.classList.add("hidden");
  }

  async function saveReviewIntake() {
    if (reviewSaving || (reviewMode !== "new-booking" && !reviewBookingId)) return;
    var files = Array.prototype.slice.call(els.reviewPhotoFiles.files || []);
    if (files.length > 3) {
      els.reviewIntakeStatus.textContent = "一次最多選擇 3 張照片";
      return;
    }
    for (var i = 0; i < files.length; i++) {
      if (files[i].size > 5 * 1024 * 1024) {
        els.reviewIntakeStatus.textContent = "每張照片不可超過 5 MB";
        return;
      }
    }
    var intakePayload = {
      surgeryHistory: getSurgeryHistoryValue(),
      diseaseHistory: els.reviewDiseaseHistory.value.trim(),
      lastTreatmentAt: els.reviewLastTreatment.value,
      customerNote: els.reviewCustomerNote.value
    };
    if (reviewMode === "new-booking" &&
        (!intakePayload.surgeryHistory || !intakePayload.diseaseHistory)) {
      els.reviewIntakeStatus.textContent =
        "請選擇有無手術史，並填寫需要留意的健康狀況、過敏或用藥；若無請填「無」。";
      return;
    }
    reviewSaving = true;
    els.reviewIntakeSave.disabled = true;
    els.reviewIntakeStatus.textContent =
      reviewMode === "new-booking" ? "送出預約申請中…" : "儲存中…";
    try {
      if (reviewMode === "new-booking") {
        var completed = await handleBook(intakePayload, files);
        if (completed) {
          els.reviewIntakeModal.classList.add("hidden");
          reviewMode = "existing";
          reviewBookingId = "";
        }
        return;
      }
      await window.beautyApi.updateBookingReview(reviewBookingId, intakePayload);
      for (var j = 0; j < files.length; j++) {
        els.reviewIntakeStatus.textContent =
          "上傳照片 " + (j + 1) + "／" + files.length + "…";
        await window.beautyApi.uploadBookingReviewPhoto(reviewBookingId, files[j]);
      }
      els.reviewPhotoFiles.value = "";
      els.reviewIntakeStatus.textContent = "評估資料已送出";
    } catch (error) {
      els.reviewIntakeStatus.textContent = error.message;
    } finally {
      reviewSaving = false;
      els.reviewIntakeSave.disabled = false;
    }
  }

  function renderBookings() {
    var container = els.bookingList;
    hideDepositTransferBox();
    if (!state.bookings.length) {
      container.innerHTML = '<div class="empty">尚無預約紀錄</div>';
      return;
    }
    var sorted = sortBookingsForDisplay(state.bookings);
    container.innerHTML = sorted.map(function (b) {
      var isConfirmed = b.status === "已確認";
      var isPendingReview = b.internalStatus === "pending_review";
      var isPendingDeposit = b.internalStatus === "pending_customer_confirmation";
      var isNoShow = b.status === "未到" ||
        b.internalStatus === "no_show" ||
        b.publicStatus === "no_show";
      var statusClass = (isPendingReview || isPendingDeposit)
        ? "pending"
        : isConfirmed
        ? "confirmed"
        : (isNoShow ? "noshow" : "cancelled");
      var cardClass = (isPendingReview || isPendingDeposit)
        ? "card booking-card booking-card--pending"
        : isConfirmed
        ? "card booking-card booking-card--confirmed"
        : (isNoShow
          ? "card booking-card booking-card--noshow"
          : "card booking-card booking-card--cancelled");
      var canCancel = (isConfirmed || isPendingReview || isPendingDeposit) &&
        b.canCancel === true;
      var cancelBtn = canCancel
        ? '<button type="button" class="btn btn-danger" data-cancel="' + b.id + '">取消預約</button>'
        : "";
      var reviewBtn = (isPendingReview || isPendingDeposit)
        ? '<button type="button" class="btn btn-secondary" data-review="' +
          escapeHtml(b.id) + '">補充評估資料／照片</button>'
        : "";
      var deadlineLine = canCancel && b.cancellationDeadlineDisplay
        ? '<p class="booking-cancel-deadline">取消截止：' +
          escapeHtml(b.cancellationDeadlineDisplay) + "（台北時間）</p>"
        : "";
      var blockedLine = (isConfirmed || isPendingReview || isPendingDeposit) &&
        !canCancel && b.cancelBlockedReason
        ? '<p class="booking-cancel-blocked">' + escapeHtml(b.cancelBlockedReason) + "</p>"
        : "";
      var reasonLine = b.status === "已取消" && b.cancelReason
        ? '<p class="booking-cancel-reason">取消原因：' + escapeHtml(b.cancelReason) + "</p>"
        : (b.status === "已取消" && b.canceledBy === "業主"
          ? '<p class="booking-cancel-reason">此預約由業主取消</p>'
          : "");
      var displayStatus = b.statusLabel || b.status;
      var depositDueLine = isPendingDeposit && b.depositDueAt
        ? '<p class="booking-cancel-deadline">請於 ' +
          escapeHtml(new Date(b.depositDueAt).toLocaleString("zh-TW", {
            timeZone: "Asia/Taipei",
            hour12: false
          })) + " 前完成匯款（台北時間）</p>"
        : "";
      var depositTransfer = isPendingDeposit
        ? '<div class="deposit-transfer-box booking-card-deposit">' +
          buildDepositTransferHtml(state.settings, {
            accountTextId: "deposit-account-" + escapeHtml(b.id),
            copyBtnId: "copy-deposit-account-" + escapeHtml(b.id)
          }) +
          "</div>"
        : "";
      var depositReport = isPendingDeposit
        ? (b.depositReportedAt
          ? '<p class="deposit-report-status">已回報末五碼：' +
            escapeHtml(b.depositTransferLast5 || "") + "，等待工作室核對。</p>"
          : '<div class="deposit-report-form">' +
            '<label>匯款後請輸入轉帳帳號末五碼</label>' +
            '<input type="text" inputmode="numeric" maxlength="5" pattern="[0-9]{5}" ' +
            'data-deposit-last5="' + escapeHtml(b.id) + '" placeholder="例：12345">' +
            '<button type="button" class="btn btn-secondary btn-small" data-deposit-report="' +
            escapeHtml(b.id) + '">回報已匯款</button></div>')
        : "";
      return (
        '<div class="' + cardClass + '">' +
          '<h3>' + escapeHtml(b.serviceName) + '</h3>' +
          '<p>' + formatDateZh(b.date) + ' ' + escapeHtml(b.time) + '</p>' +
          '<span class="booking-status ' + statusClass + '">' + escapeHtml(displayStatus) + '</span>' +
          depositDueLine +
          depositTransfer +
          depositReport +
          deadlineLine +
          blockedLine +
          reasonLine +
          reviewBtn +
          cancelBtn +
        '</div>'
      );
    }).join("");

    container.querySelectorAll("[data-cancel]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openCancelConfirmModal(btn.getAttribute("data-cancel"));
      });
    });
    container.querySelectorAll("[data-review]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openReviewIntake(btn.getAttribute("data-review"));
      });
    });
    sorted.forEach(function (b) {
      if (b.internalStatus === "pending_customer_confirmation") {
        wireDepositCopyButton("copy-deposit-account-" + b.id, state.settings.bankAccount);
      }
    });
    container.querySelectorAll("[data-deposit-report]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var bookingId = btn.getAttribute("data-deposit-report");
        var input = container.querySelector('[data-deposit-last5="' + bookingId + '"]');
        var last5 = input ? input.value.trim() : "";
        if (!/^\d{5}$/.test(last5)) {
          setStatus("error", "請輸入 5 位數字的轉帳帳號末五碼");
          return;
        }
        btn.disabled = true;
        try {
          await window.beautyApi.reportDepositTransfer(bookingId, last5);
          setStatus("success", "已回報匯款，請等待工作室核對");
          await loadBookings();
        } catch (error) {
          setStatus("error", error.message);
          btn.disabled = false;
        }
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

  function setProfileFieldsLocked(locked) {
    state.profileLocked = locked;
    if (els.customerName) {
      els.customerName.readOnly = locked;
      els.customerName.classList.toggle("input-locked", locked);
    }
    if (els.customerPhone) {
      els.customerPhone.readOnly = locked;
      els.customerPhone.classList.toggle("input-locked", locked);
    }
    if (els.customerBirthday) {
      // date input 的 readOnly 在多數瀏覽器無效，改用 disabled 鎖定
      els.customerBirthday.disabled = locked;
      els.customerBirthday.classList.toggle("input-locked", locked);
    }
    if (els.profileLockedHint) {
      els.profileLockedHint.hidden = !locked;
    }
  }

  function applyServerProfile(profile) {
    state.serverProfile = profile || null;
    if (!els.customerName || !els.customerPhone || !els.customerBirthday) return;
    if (profile) {
      // 伺服器資料為準，不得以 localStorage 值覆蓋
      els.customerName.value = profile.customerName || "";
      els.customerPhone.value = profile.phone || "";
      els.customerBirthday.value = profile.birthday || "";
      setProfileFieldsLocked(true);
    } else {
      setProfileFieldsLocked(false);
      fillCustomerProfileForm();
    }
    updateBookButton();
  }

  async function loadServerProfile() {
    var result = await window.beautyApi.getCustomerMe();
    applyServerProfile(result && result.exists ? result.customer : null);
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
      "<p>請轉帳訂金至以下帳戶；本工作室核對後，預約才會正式成立：</p>" +
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
    var pendingReview = details.internalStatus === "pending_review";
    var pendingDeposit = details.internalStatus === "pending_customer_confirmation";
    if (els.bookingSuccessTitle) {
      els.bookingSuccessTitle.textContent = pendingReview ? "預約申請已送出" : "預約成功";
    }
    if (els.bookingSuccessLead) {
      els.bookingSuccessLead.textContent = pendingReview
        ? "此時段已為您保留，本工作室確認受理後才會開始 24 小時訂金期限，請留意後續通知。"
        : "您的預約已完成，請確認以下資訊。";
    }
    els.bookingSuccessName.textContent = details.guestName || "";
    els.bookingSuccessService.textContent = details.serviceName || "";
    els.bookingSuccessDate.textContent =
      formatDateZh(details.date) +
      (details.date ? "（" + getWeekdayLabel(details.date) + "）" : "");
    els.bookingSuccessTime.textContent = details.time || "";
    if (pendingDeposit) {
      fillDepositContainer(els.bookingSuccessDeposit, state.settings, {
        accountTextId: "success-deposit-account-text",
        copyBtnId: "copy-success-deposit-account"
      });
    } else if (els.bookingSuccessDeposit) {
      els.bookingSuccessDeposit.hidden = true;
      els.bookingSuccessDeposit.innerHTML = "";
    }
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
    state.bookings = await window.beautyApi.getMyBookings();
    renderBookings();
  }

  async function handleBook(reviewIntake, reviewFiles) {
    if (!state.selectedService || !state.selectedDate || !state.selectedTime) return false;
    var profile = getCustomerProfileFromForm();
    if (!profile.customerName) {
      setStatus("error", "請填寫姓名");
      return false;
    }
    if (!profile.phone) {
      setStatus("error", "請填寫電話");
      return false;
    }
    els.bookBtn.disabled = true;
    setStatus("", "送出預約中…");
    var bookedServiceName = state.selectedService.name || "";
    var bookedDate = state.selectedDate;
    var bookedTime = state.selectedTime;
    var createdBookingId = "";
    try {
      var createResult = await window.beautyApi.createBooking({
        displayName: state.user.displayName,
        customerName: profile.customerName,
        phone: profile.phone,
        birthday: profile.birthday || "",
        serviceId: state.selectedService.id,
        date: bookedDate,
        time: bookedTime
      });
      createdBookingId = createResult && createResult.booking
        ? createResult.booking.id
        : "";
      if (reviewIntake && createdBookingId) {
        await window.beautyApi.updateBookingReview(createdBookingId, reviewIntake);
        var files = reviewFiles || [];
        for (var fileIndex = 0; fileIndex < files.length; fileIndex++) {
          els.reviewIntakeStatus.textContent =
            "上傳照片 " + (fileIndex + 1) + "／" + files.length + "…";
          await window.beautyApi.uploadBookingReviewPhoto(
            createdBookingId, files[fileIndex]
          );
        }
      }
      if (!state.profileLocked) {
        saveCustomerProfileLocal(profile);
      }
      setStatus("");
      state.selectedTime = "";
      try {
        state.settings = await window.beautyApi.getSettings();
        applyTheme(state.settings);
      } catch (ignore) {}
      showBookingSuccessModal({
        guestName: profile.customerName,
        serviceName: bookedServiceName,
        date: bookedDate,
        time: bookedTime,
        internalStatus: createResult && createResult.booking
          ? createResult.booking.internalStatus
          : ""
      });
      // 第一次預約成功後改以伺服器 profile 為準並鎖定姓名／電話
      try {
        await loadServerProfile();
      } catch (ignore) {}
      await loadMonthCalendar(state.calendarMonth || getCurrentMonthIso());
      await loadSlots();
      await loadBookings();
      return true;
    } catch (error) {
      setStatus("");
      if (createdBookingId) {
        reviewMode = "existing";
        reviewBookingId = createdBookingId;
        els.reviewIntakeTitle.textContent = "補充本工作室評估資料";
        els.reviewIntakeSave.textContent = "重新送出評估資料";
        els.reviewIntakeDismiss.textContent = "稍後再填";
        els.reviewIntakeStatus.textContent =
          "預約申請已建立，但評估資料尚未完整送出，請再按一次送出。";
      } else {
        showBookingFailModal(error && error.message);
      }
      return false;
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
    var booking = (state.bookings || []).find(function (b) { return b.id === bookingId; });
    if (booking && booking.canCancel !== true) {
      setStatus("error", booking.cancelBlockedReason || "此預約無法取消");
      return;
    }
    cancelModalState.bookingId = bookingId;
    cancelModalState.submitting = false;
    if (els.cancelConfirmBody) {
      var base = "取消後這個時段會釋出，若要重新預約需重新選擇服務與時段。";
      if (booking && booking.cancellationDeadlineDisplay) {
        base += " 取消截止時間：" + booking.cancellationDeadlineDisplay + "（台北時間）。";
      }
      els.cancelConfirmBody.textContent = base;
    }
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
      await window.beautyApi.cancelBooking(bookingId);
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

  // ──────────────── LINE 認領邀請（一次性 token） ────────────────
  //
  // 安全規則：claim token 只保存在此記憶體狀態，不寫入
  // localStorage／sessionStorage／console，也不帶到其他請求；
  // 只有 v2 設定（BEAUTY_CONFIG.CLAIM_ENABLED）才處理 claim 參數，
  // Demo v1 hostname 完全不啟動認領流程。
  //
  // token 一律放在 URL fragment（#claim=）：fragment 不會送到伺服器，
  // 不進 Pages 存取紀錄，也不會出現在 Referer。
  // 刻意不支援 ?claim= query 參數，避免保留洩漏路徑。

  var claimState = { token: "", busy: false, done: false };

  function isClaimEnabled() {
    var config = window.BEAUTY_CONFIG || {};
    return config.CLAIM_ENABLED === true;
  }

  function readClaimTokenFromUrl() {
    var hash = String(window.location.hash || "");
    var match = /[#&]claim=([^&]+)/.exec(hash);
    if (!match) return "";
    try {
      return decodeURIComponent(match[1]);
    } catch (ignore) {
      return "";
    }
  }

  /**
   * 以 replaceState 移除 fragment 中的 claim token，不留在瀏覽紀錄；
   * 保留 pathname 與既有非 claim 的 query parameters 及其他 hash 內容。
   */
  function clearClaimTokenFromUrl() {
    if (!window.history || !window.history.replaceState) return;
    var hash = String(window.location.hash || "")
      .replace(/([#&])claim=[^&]*&?/, "$1")
      .replace(/[#&]$/, "");
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (window.location.search || "") + hash
    );
  }

  function hideClaimModal() {
    if (els.claimModal) {
      els.claimModal.classList.add("hidden");
    }
  }

  function showClaimModal() {
    if (!els.claimModal) return;
    if (els.claimBody) {
      els.claimBody.innerHTML =
        "<p>店家邀請您將這個 LINE 帳號與您的客戶資料完成綁定。</p>" +
        '<p class="claim-hint">綁定後即可直接查看與預約，無需重新填寫資料。</p>';
    }
    if (els.claimConfirmBtn) {
      els.claimConfirmBtn.hidden = false;
      els.claimConfirmBtn.disabled = false;
      els.claimConfirmBtn.textContent = "確認綁定";
    }
    if (els.claimDismissBtn) {
      els.claimDismissBtn.disabled = false;
      els.claimDismissBtn.textContent = "先不要";
    }
    els.claimModal.classList.remove("hidden");
  }

  function showClaimError(message) {
    if (els.claimBody) {
      els.claimBody.innerHTML =
        '<p class="claim-error">' + escapeHtml(message || "邀請連結無效或已失效") + "</p>";
    }
    if (els.claimConfirmBtn) {
      els.claimConfirmBtn.hidden = true;
    }
    if (els.claimDismissBtn) {
      els.claimDismissBtn.disabled = false;
      els.claimDismissBtn.textContent = "關閉";
    }
  }

  function initClaimFlow() {
    if (!isClaimEnabled()) return;
    var token = readClaimTokenFromUrl();
    if (!token) return;
    claimState.token = token;
    showClaimModal();
  }

  async function confirmClaimInvite() {
    if (!claimState.token || claimState.busy || claimState.done) return;
    claimState.busy = true;
    if (els.claimConfirmBtn) {
      els.claimConfirmBtn.disabled = true;
      els.claimConfirmBtn.textContent = "綁定中…";
    }
    if (els.claimDismissBtn) {
      els.claimDismissBtn.disabled = true;
    }
    try {
      await window.beautyApi.claimInvite(claimState.token);
      claimState.done = true;
      claimState.token = "";
      clearClaimTokenFromUrl();
      hideClaimModal();
      setStatus("success", "已完成 LINE 綁定，資料已為您帶入");
      try {
        await loadServerProfile();
        await loadBookings();
      } catch (ignore) {}
    } catch (error) {
      claimState.busy = false;
      showClaimError(error && error.message);
      return;
    }
    claimState.busy = false;
  }

  function dismissClaimModal() {
    if (claimState.busy) return;
    claimState.token = "";
    clearClaimTokenFromUrl();
    hideClaimModal();
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

    els.bookBtn.addEventListener("click", function () {
      confirmAdditionalBooking().then(function (confirmed) {
        if (!confirmed) return;
        if (requiresReviewBeforeBooking()) {
          openNewBookingReview();
        } else {
          handleBook();
        }
      });
    });
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
    if (els.claimConfirmBtn) {
      els.claimConfirmBtn.addEventListener("click", function () {
        confirmClaimInvite().catch(function (e) { setStatus("error", e.message); });
      });
    }
    if (els.claimDismissBtn) {
      els.claimDismissBtn.addEventListener("click", dismissClaimModal);
    }
    if (els.aiAskBtn) {
      els.aiAskBtn.addEventListener("click", function () {
        askAiAssistant();
      });
    }
    if (els.aiApplyBtn) {
      els.aiApplyBtn.addEventListener("click", function () {
        selectServiceById(aiRecommendedServiceId);
        els.serviceList.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    if (els.reviewIntakeDismiss) {
      els.reviewIntakeDismiss.addEventListener("click", closeReviewIntake);
    }
    if (els.reviewIntakeSave) {
      els.reviewIntakeSave.addEventListener("click", saveReviewIntake);
    }
    if (els.reviewSurgeryNone) {
      els.reviewSurgeryNone.addEventListener("change", syncSurgeryHistoryChoice);
    }
    if (els.reviewSurgeryYes) {
      els.reviewSurgeryYes.addEventListener("change", syncSurgeryHistoryChoice);
    }
    if (els.additionalBookingContinue) {
      els.additionalBookingContinue.addEventListener("click", function () {
        closeAdditionalBookingModal(true);
      });
    }
    if (els.additionalBookingCancel) {
      els.additionalBookingCancel.addEventListener("click", function () {
        closeAdditionalBookingModal(false);
      });
    }
    if (els.additionalBookingModal) {
      els.additionalBookingModal.addEventListener("click", function (event) {
        if (event.target === els.additionalBookingModal) {
          closeAdditionalBookingModal(false);
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
    els.bookingNoticeHint = $("booking-notice-hint");
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
    els.profileLockedHint = $("profile-locked-hint");
    els.bookBtn = $("book-btn");
    els.bookingList = $("booking-list");
    els.depositTransferBox = $("deposit-transfer-box");
    els.bookingSuccessModal = $("booking-success-modal");
    els.bookingSuccessTitle = $("booking-success-title");
    els.bookingSuccessLead = $("booking-success-lead");
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
    els.cancelConfirmBody = $("cancel-confirm-body");
    els.cancelConfirmYes = $("cancel-confirm-yes");
    els.cancelConfirmNo = $("cancel-confirm-no");
    els.userName = $("user-name");
    els.userAvatar = $("user-avatar");
    els.claimModal = $("claim-modal");
    els.claimBody = $("claim-body");
    els.claimConfirmBtn = $("claim-confirm-btn");
    els.claimDismissBtn = $("claim-dismiss-btn");
    els.aiAssistant = $("ai-assistant");
    els.aiMessage = $("ai-message");
    els.aiAskBtn = $("ai-ask-btn");
    els.aiAnswer = $("ai-answer");
    els.aiApplyBtn = $("ai-apply-btn");
    els.reviewIntakeModal = $("review-intake-modal");
    els.reviewIntakeTitle = $("review-intake-title");
    els.reviewSurgeryNone = $("review-surgery-none");
    els.reviewSurgeryYes = $("review-surgery-yes");
    els.reviewSurgeryDetailWrap = $("review-surgery-detail-wrap");
    els.reviewSurgeryHistory = $("review-surgery-history");
    els.reviewDiseaseHistory = $("review-disease-history");
    els.reviewLastTreatment = $("review-last-treatment");
    els.reviewCustomerNote = $("review-customer-note");
    els.reviewPhotoFiles = $("review-photo-files");
    els.reviewPhotoRequest = $("review-photo-request");
    els.reviewIntakeStatus = $("review-intake-status");
    els.reviewIntakeDismiss = $("review-intake-dismiss");
    els.reviewIntakeSave = $("review-intake-save");
    els.additionalBookingModal = $("additional-booking-modal");
    els.additionalBookingList = $("additional-booking-list");
    els.additionalBookingMore = $("additional-booking-more");
    els.additionalBookingContinue = $("additional-booking-continue");
    els.additionalBookingCancel = $("additional-booking-cancel");
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
      await loadAiCapability();
      await loadServerProfile();
      await loadBookings();
      setStatus("");
      // LIFF 與資料就緒後才處理一次性認領邀請（僅 v2 設定啟用）
      initClaimFlow();
    } catch (error) {
      setStatus("error", error.message || "發生未知錯誤");
    }
  }

  boot();
})();
