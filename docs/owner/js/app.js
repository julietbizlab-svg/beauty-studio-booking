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
    slotsDirty: false,
    closedDates: [],
    settings: null,
    editingServiceId: null,
    customers: [],
    customerQuery: "",
    selectedCustomer: null,
    ownerMembership: null,
    customerSearchTimer: null
  };

  var els = {};
  var ownerConfirmResolver = null;
  var pigmentReminderBookingId = "";

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

  function closeOwnerConfirm(result) {
    if (!ownerConfirmResolver) return;
    var resolve = ownerConfirmResolver;
    ownerConfirmResolver = null;
    els.ownerConfirmModal.classList.add("hidden");
    resolve(result === true);
  }

  function confirmOwnerAction(message, options) {
    options = options || {};
    if (!els.ownerConfirmModal || ownerConfirmResolver) {
      return Promise.resolve(false);
    }
    els.ownerConfirmTitle.textContent = options.title || "請確認這項操作";
    els.ownerConfirmMessage.textContent = String(message || "確定要繼續嗎？");
    els.ownerConfirmSubmit.textContent = options.confirmLabel || "確認";
    els.ownerConfirmSubmit.className = options.danger
      ? "btn btn-danger btn-small"
      : "btn btn-primary btn-small";
    els.ownerConfirmModal.classList.remove("hidden");
    return new Promise(function (resolve) {
      ownerConfirmResolver = resolve;
      if (typeof els.ownerConfirmSubmit.focus === "function") {
        els.ownerConfirmSubmit.focus();
      }
    });
  }

  function closePigmentReminderModal() {
    pigmentReminderBookingId = "";
    els.pigmentReminderModal.classList.add("hidden");
  }

  function openPigmentReminderModal(bookingId, serviceDate, savedTouchupDate, savedMaintenanceDate) {
    var base = new Date(serviceDate + "T00:00:00");
    if (!bookingId || !Number.isFinite(base.getTime())) {
      setStatus("error", "預約日期不正確，無法設定提醒");
      return;
    }
    var complimentary = new Date(base);
    complimentary.setDate(complimentary.getDate() + 28);
    var maintenance = new Date(base);
    maintenance.setMonth(maintenance.getMonth() + 11);
    pigmentReminderBookingId = bookingId;
    els.pigmentTouchupDate.value = savedTouchupDate || formatLocalDate(complimentary);
    els.pigmentMaintenanceDate.value = savedMaintenanceDate || formatLocalDate(maintenance);
    els.pigmentReminderModal.classList.remove("hidden");
  }

  async function submitPigmentReminderDates() {
    if (!pigmentReminderBookingId) return;
    var touchupOn = String(els.pigmentTouchupDate.value || "");
    var maintenanceOn = String(els.pigmentMaintenanceDate.value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(touchupOn) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(maintenanceOn)) {
      setStatus("error", "請選擇兩個提醒日期");
      return;
    }
    var bookingId = pigmentReminderBookingId;
    els.pigmentReminderSubmit.disabled = true;
    try {
      await window.ownerApi.updatePigmentReminderDates(bookingId, {
        touchupOn: touchupOn,
        maintenanceOn: maintenanceOn
      });
      closePigmentReminderModal();
      await refreshCalendarBookings();
      setStatus("success", "補色提醒日期已更新；滿年前維持補色保養會明確標示另外計費。");
    } catch (error) {
      setStatus("error", error.message || "補色提醒日期更新失敗");
    } finally {
      els.pigmentReminderSubmit.disabled = false;
    }
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

  function formatLocalDate(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") +
      "-" + String(date.getDate()).padStart(2, "0");
  }

  function getWeekdayLabel(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return "週" + WEEKDAYS[date.getDay()];
  }

  function renderSubscriptionStatus(data) {
    if (!els.ownerSubscriptionCard) return;
    var status = data && data.status ? data.status : "unconfigured";
    if (typeof els.ownerSubscriptionCard.setAttribute === "function") {
      els.ownerSubscriptionCard.setAttribute("data-subscription-status", status);
    }
    els.ownerSubscriptionStatus.textContent =
      data && data.statusLabel ? data.statusLabel : "租用期限尚未設定";
    els.ownerTrialEndDate.textContent =
      data && data.trialEndsOn ? formatDateZh(data.trialEndsOn) : "尚未設定";
    els.ownerSubscriptionEndDate.textContent =
      data && data.subscriptionEndsOn
        ? formatDateZh(data.subscriptionEndsOn) : "尚未設定";
    showSubscriptionReminder(data);
    renderTrialBanner(data);
  }

  function renderTrialBanner(data) {
    if (!els.ownerTrialBanner) return;
    var trial = data && data.trialEndsOn;
    if (!trial) { els.ownerTrialBanner.classList.add("hidden"); return; }
    var days = subscriptionDaysRemaining(trial);
    var remaining = days == null ? "" : (days < 0 ? "試用已到期" :
      (days === 0 ? "今天到期" : "剩餘 " + (days + 1) + " 天"));
    var isFlagship = state.ownerMembership && state.ownerMembership.features &&
      state.ownerMembership.features.plan === "flagship";
    els.ownerTrialBanner.innerHTML = "<strong>14 天免費試用｜" +
      escapeHtml(remaining) + "</strong><span>" +
      (isFlagship
        ? "試用期間開放 AI、評估與完整店務功能；既有資料不會因試用結束而刪除。"
        : "試用期間開放預約與基本店務功能。") + "</span>";
    els.ownerTrialBanner.classList.remove("hidden");
  }

  function subscriptionDaysRemaining(dateText) {
    if (!dateText) return null;
    var deadline = new Date(dateText + "T00:00:00.000Z");
    var today = new Date(getTodayIso() + "T00:00:00.000Z");
    if (!Number.isFinite(deadline.getTime()) || !Number.isFinite(today.getTime())) return null;
    return Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
  }

  function showSubscriptionReminder(data) {
    if (!els.subscriptionReminderModal || !data) return;
    var isSubscription = Boolean(data.subscriptionEndsOn);
    var deadline = isSubscription ? data.subscriptionEndsOn : data.trialEndsOn;
    var days = subscriptionDaysRemaining(deadline);
    if (days == null || days > 30) return;
    var label = isSubscription ? "訂閱" : "試用";
    if (!isSubscription && days >= 0 && [7, 3, 1, 0].indexOf(days) === -1) return;
    var timing = days < 0
      ? "已到期"
      : (days === 0 ? "今天到期" : "將在 " + days + " 天後到期");
    els.subscriptionReminderMessage.textContent =
      label + "期限為 " + formatDateZh(deadline) + "，" + timing + "。" +
      (data.status === "expired" ?
        "目前僅能查看既有資料，請聯絡平台選擇正式方案。" : "");
    els.subscriptionReminderModal.classList.remove("hidden");
  }

  function closeSubscriptionReminder() {
    if (els.subscriptionReminderModal) {
      els.subscriptionReminderModal.classList.add("hidden");
    }
  }

  async function loadSubscriptionStatus() {
    if (!window.ownerApi || typeof window.ownerApi.getSubscriptionStatus !== "function") {
      renderSubscriptionStatus(null);
      return;
    }
    try {
      renderSubscriptionStatus(await window.ownerApi.getSubscriptionStatus());
    } catch (error) {
      renderSubscriptionStatus(null);
    }
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

  function summarizeCalendarBookings(dayData) {
    var summary = { review: 0, deposit: 0, confirmed: 0, total: 0 };
    (dayData.bookings || []).forEach(function (booking) {
      var status = String(booking.internalStatus || "");
      if (status === "pending_review") {
        summary.review += 1;
      } else if (status === "pending_customer_confirmation") {
        summary.deposit += 1;
      } else if (
        status === "pending" ||
        status === "confirmed" ||
        status === "checked_in" ||
        status === "completed"
      ) {
        summary.confirmed += 1;
      }
    });
    summary.total = summary.review + summary.deposit + summary.confirmed;
    return summary;
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
      var bookingSummary = summarizeCalendarBookings(dayData);
      var markerClass = "";
      var markerLabel = "";
      if (bookingSummary.review > 0) {
        markerClass = "calendar-booking-count--review";
        markerLabel = "待審核";
      } else if (bookingSummary.deposit > 0) {
        markerClass = "calendar-booking-count--deposit";
        markerLabel = "待訂金";
      } else if (bookingSummary.confirmed > 0) {
        markerClass = "calendar-booking-count--confirmed";
        markerLabel = "已確認";
      }
      if (bookingSummary.total > 0) {
        classes.push("calendar-day--has-booking");
      }
      var dayNum = Number(cell.date.split("-")[2]);
      var marker = bookingSummary.total > 0
        ? '<span class="calendar-booking-count ' + markerClass +
            '" aria-label="' + markerLabel + '，共 ' + bookingSummary.total + ' 筆">' +
            bookingSummary.total + "</span>"
        : "";
      return (
        '<button type="button" class="' + classes.join(" ") + '" data-date="' + cell.date + '">' +
          '<span class="calendar-day-num">' + dayNum + "</span>" +
          marker +
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
  var bookingActionMessages = {};
  var rescheduleBusy = false;
  var aiDraftBusy = false;
  var aiDraftModalState = { bookingId: "", summary: "" };
  var aiSummaryBusy = false;
  var aiFeatureEnabled = false;
  var aiWorkQueueFilter = "all";
  var aiInquiryBusy = false;
  var browIntakeBusy = false;
  var browReviewModalState = { id: "", status: "", inquiryId: "" };
  var assessmentTemplateBusy = false;
  var slotSaveBusy = false;
  var rescheduleModalState = {
    bookingId: "",
    customerName: "",
    serviceName: "",
    date: "",
    time: "",
    slots: [],
    slotsDate: "",
    slotsRequestSeq: 0
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
      label: "確認訂金／正式成立",
      requiresConfirm: true,
      confirmMessage: "已核對訂金或確認可接受此預約，要將預約正式成立嗎？",
      successMessage: "預約已正式成立"
    },
    pending_customer_confirmation: {
      label: "受理／開始 24 小時訂金期限",
      requiresConfirm: true,
      confirmMessage: "確定受理此申請並開始 24 小時訂金期限？",
      successMessage: "已受理，24 小時訂金期限開始"
    },
    no_show: {
      label: "未到",
      requiresConfirm: true,
      confirmMessage: "確定將此預約標記為未到？",
      successMessage: "已標記客人未到"
    }
  };

  function hasBookingStartTimePassed(booking) {
    if (!booking) return false;
    var dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(booking.date || ""));
    var timeMatch = /^(\d{2}):(\d{2})$/.exec(String(booking.time || ""));
    if (!dateMatch || !timeMatch) return false;
    var hour = Number(timeMatch[1]);
    var minute = Number(timeMatch[2]);
    if (hour > 23 || minute > 59) return false;
    var startAt = new Date(
      dateMatch[1] + "-" + dateMatch[2] + "-" + dateMatch[3] +
      "T" + timeMatch[1] + ":" + timeMatch[2] + ":00+08:00"
    );
    return Number.isFinite(startAt.getTime()) && Date.now() >= startAt.getTime();
  }

  function getOwnerStaffTransitionActions(internalStatus, booking) {
    var allowedByStatus = {
      confirmed: ["checked_in", "no_show"],
      checked_in: ["completed"],
      pending_review: ["pending_customer_confirmation"],
      pending_customer_confirmation: ["confirmed"],
      pending: ["confirmed", "checked_in"]
    };
    var targets = (allowedByStatus[internalStatus] || []).filter(function (toStatus) {
      return toStatus !== "no_show" || hasBookingStartTimePassed(booking);
    });
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
    if (booking.internalStatus === "pending_review" ||
        booking.internalStatus === "pending_customer_confirmation") {
      return "booking-card--pending";
    }
    return "booking-card--confirmed";
  }

  function ownerBookingStatusClass(booking) {
    if (booking.status === "已取消") return "booking-status cancelled";
    if (booking.internalStatus === "no_show" || booking.status === "未到") {
      return "booking-status noshow";
    }
    if (booking.internalStatus === "completed") return "booking-status completed";
    if (booking.internalStatus === "checked_in") return "booking-status checked-in";
    if (booking.depositConfirmedAt && booking.internalStatus === "confirmed") {
      return "booking-status deposit-received";
    }
    if (booking.internalStatus === "pending_review" ||
        booking.internalStatus === "pending_customer_confirmation") {
      return "booking-status pending";
    }
    return "booking-status confirmed";
  }

  function ownerBookingStatusLabel(booking) {
    if (booking.depositConfirmedAt && booking.internalStatus === "confirmed") {
      return "已收訂金";
    }
    if (booking.statusLabel) return booking.statusLabel;
    return booking.status || "已確認";
  }

  function ownerDepositStatusHtml(booking) {
    var settings = state.settings || {};
    var servicePrice = Number(booking.servicePrice) || 0;
    if (servicePrice === 0 && /補色/.test(String(booking.serviceName || ""))) {
      return '<div class="owner-deposit-status owner-deposit-status--complimentary">' +
        '<strong>免費補色・免收訂金</strong>' +
        '<span>敬請為客人保留專屬時段，並溫柔提醒準時赴約；如需異動，請提前告知。</span></div>';
    }
    var amount = Number(settings.depositAmount) > 0
      ? " NT$ " + Number(settings.depositAmount).toLocaleString("zh-TW")
      : "";
    if (booking.depositConfirmedAt) {
      var balance = Math.max(0, servicePrice - Number(settings.depositAmount || 0));
      return '<div class="owner-deposit-status owner-deposit-status--received">' +
        '<strong>✓ 已收訂金' + escapeHtml(amount) + '</strong>' +
        '<span>款項已確認，預約時段已保留</span>' +
        '<small>確認時間：' + escapeHtml(new Date(booking.depositConfirmedAt).toLocaleString("zh-TW", {
          timeZone: "Asia/Taipei",
          hour12: false
        })) + '（台北時間）</small>' +
        (servicePrice > 0 ? '<span class="owner-payment-balance">服務費用 NT$ ' +
          escapeHtml(servicePrice.toLocaleString("zh-TW")) + ' − 訂金 NT$ ' +
          escapeHtml(Number(settings.depositAmount || 0).toLocaleString("zh-TW")) +
          '＝到店應付 NT$ ' + escapeHtml(balance.toLocaleString("zh-TW")) + '</span>' : '') +
        '</div>';
    }
    if (booking.internalStatus !== "pending_customer_confirmation") return "";
    if (booking.depositReportedAt) {
      return '<div class="owner-deposit-status owner-deposit-status--reported">' +
        '<strong>待核對訂金' + escapeHtml(amount) + '</strong>' +
        '<span>客戶已回報匯款｜末五碼：' +
        escapeHtml(booking.depositTransferLast5 || "未提供") + '</span></div>';
    }
    return '<div class="owner-deposit-status owner-deposit-status--waiting">' +
      '<strong>待收訂金' + escapeHtml(amount) + '</strong>' +
      '<span>客戶尚未回報匯款</span></div>';
  }

  function depositSetupIssue() {
    var deposit = state.settings || {};
    var missing = [];
    if (!deposit.depositEnabled) missing.push("開啟訂金");
    if (!(Number(deposit.depositAmount) > 0)) missing.push("訂金金額");
    if (!String(deposit.bankAccount || "").trim()) missing.push("轉帳帳號");
    if (!String(deposit.bankAccountName || "").trim()) missing.push("轉帳戶名");
    return missing.length ? "請先完成訂金設定：" + missing.join("、") : "";
  }

  async function submitBookingTransition(bookingId, action, booking) {
    if (transitionBusy || !bookingId || !action) return;
    if (action.toStatus === "no_show" && !hasBookingStartTimePassed(booking)) {
      setStatus("error", "預約時間尚未到，不能標記客戶未到");
      renderDayBookings();
      return;
    }
    if (action.toStatus === "pending_customer_confirmation") {
      var depositIssue = depositSetupIssue();
      if (depositIssue) {
        bookingActionMessages[bookingId] = depositIssue;
        setStatus("error", depositIssue);
        renderDayBookings();
        return;
      }
    }
    if (action.requiresConfirm &&
        !await confirmOwnerAction(
          action.confirmMessage || "確定要更新此預約狀態？",
          {
            title: action.toStatus === "no_show" ? "確認標記客戶未到" : "確認更新預約狀態",
            confirmLabel: action.toStatus === "no_show" ? "標記未到" : "確認更新",
            danger: action.toStatus === "no_show"
          }
        )) {
      return;
    }
    transitionBusy = true;
    renderDayBookings();
    setStatus("info", "更新狀態中…");
    try {
      await window.ownerApi.transitionBookingStatus(bookingId, action.toStatus);
      delete bookingActionMessages[bookingId];
      setStatus("success", action.successMessage || "已更新預約狀態");
      await refreshCalendarBookings();
    } catch (error) {
      bookingActionMessages[bookingId] = error.message || "無法更新預約狀態";
      setStatus("error", bookingActionMessages[bookingId]);
    } finally {
      transitionBusy = false;
      renderDayBookings();
    }
  }

  var ownerReviewBookingId = "";
  var ownerReviewRequestBusy = false;
  var ownerReviewObjectUrls = [];

  function clearOwnerReviewImages() {
    ownerReviewObjectUrls.forEach(function (url) {
      if (window.URL && window.URL.revokeObjectURL) window.URL.revokeObjectURL(url);
    });
    ownerReviewObjectUrls = [];
    if (els.ownerReviewPhotos) els.ownerReviewPhotos.innerHTML = "";
  }

  function closeOwnerReview() {
    ownerReviewBookingId = "";
    clearOwnerReviewImages();
    els.ownerReviewModal.classList.add("hidden");
  }

  async function showOwnerReviewPhoto(photoId) {
    if (!ownerReviewBookingId || !photoId) return;
    els.ownerReviewStatus.textContent = "照片載入中…";
    try {
      var response = await window.ownerApi.fetchBookingReviewPhoto(
        ownerReviewBookingId, photoId
      );
      var blob = await response.blob();
      var objectUrl = window.URL.createObjectURL(blob);
      ownerReviewObjectUrls.push(objectUrl);
      els.ownerReviewPhotos.innerHTML +=
        '<img class="booking-review-photo" src="' + escapeHtml(objectUrl) +
        '" alt="客人補充的審核照片">';
      els.ownerReviewStatus.textContent = "";
    } catch (error) {
      els.ownerReviewStatus.textContent = error.message;
    }
  }

  async function openOwnerReview(bookingId) {
    ownerReviewBookingId = bookingId || "";
    if (!ownerReviewBookingId) return;
    clearOwnerReviewImages();
    els.ownerReviewModal.classList.remove("hidden");
    els.ownerReviewStatus.textContent = "載入中…";
    try {
      var result = await window.ownerApi.getBookingReview(ownerReviewBookingId);
      var intake = result.intake || {};
      els.ownerReviewContent.innerHTML =
        "<p><strong>需留意事項：</strong>" +
          escapeHtml(intake.diseaseHistory || "尚未填寫") + "</p>" +
        "<p><strong>上次施作：</strong>" +
          escapeHtml(intake.lastTreatmentAt || "未提供") + "</p>" +
        "<p><strong>補充說明：</strong>" +
          escapeHtml(intake.customerNote || "無") + "</p>" +
        "<p><strong>填寫狀態：</strong>" +
          escapeHtml(intake.submittedAt ? "客人已提交" : "尚未提交") + "</p>";
      els.ownerReviewPhotoNote.value = intake.photoRequestNote || "";
      els.ownerReviewRequestSurgery.checked = Boolean(intake.surgeryHistoryRequested);
      els.ownerReviewRequestDisease.checked = Boolean(intake.diseaseHistoryRequested);
      els.ownerReviewRequestLastTreatment.checked = Boolean(intake.lastTreatmentRequested);
      els.ownerReviewQuestionNote.value = intake.questionRequestNote || "";
      var photos = intake.photos || [];
      els.ownerReviewPhotos.innerHTML = photos.length
        ? photos.map(function (photo, index) {
          return '<button type="button" class="btn btn-small" data-owner-review-photo="' +
            escapeHtml(photo.photoId) + '">查看照片 ' + (index + 1) + "</button>";
        }).join("")
        : '<p class="panel-hint">客人尚未上傳照片</p>';
      els.ownerReviewPhotos.querySelectorAll("[data-owner-review-photo]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          showOwnerReviewPhoto(btn.getAttribute("data-owner-review-photo"));
        });
      });
      els.ownerReviewStatus.textContent = intake.photoRequested
        ? "目前已要求客人補照片"
        : "";
    } catch (error) {
      els.ownerReviewStatus.textContent = error.message;
    }
  }

  async function setOwnerPhotoRequest(requested) {
    if (!ownerReviewBookingId || ownerReviewRequestBusy) return;
    var note = requested ? els.ownerReviewPhotoNote.value.trim() : "";
    ownerReviewRequestBusy = true;
    els.ownerReviewRequestPhoto.disabled = true;
    els.ownerReviewClearPhoto.disabled = true;
    els.ownerReviewStatus.textContent = "更新中…";
    try {
      await window.ownerApi.requestBookingReviewPhoto(
        ownerReviewBookingId, requested, note
      );
      els.ownerReviewStatus.textContent = requested
        ? "已記錄照片需求，LINE 通知已排入傳送"
        : "已取消照片需求";
    } catch (error) {
      els.ownerReviewStatus.textContent = error.message;
    } finally {
      ownerReviewRequestBusy = false;
      els.ownerReviewRequestPhoto.disabled = false;
      els.ownerReviewClearPhoto.disabled = false;
    }
  }

  async function requestOwnerReviewAnswers() {
    if (!ownerReviewBookingId || ownerReviewRequestBusy) return;
    var payload = {
      surgeryHistoryRequested: false,
      diseaseHistoryRequested: els.ownerReviewRequestDisease.checked,
      lastTreatmentRequested: els.ownerReviewRequestLastTreatment.checked,
      questionRequestNote: els.ownerReviewQuestionNote.value.trim()
    };
    if (!payload.surgeryHistoryRequested && !payload.diseaseHistoryRequested &&
        !payload.lastTreatmentRequested) {
      els.ownerReviewStatus.textContent = "請至少勾選一個需要客人補答的問題";
      return;
    }
    ownerReviewRequestBusy = true;
    els.ownerReviewRequestAnswers.disabled = true;
    els.ownerReviewStatus.textContent = "通知中…";
    try {
      await window.ownerApi.requestBookingReviewAnswers(ownerReviewBookingId, payload);
      els.ownerReviewStatus.textContent = "已通知客人補答指定問題";
    } catch (error) {
      els.ownerReviewStatus.textContent = error.message;
    } finally {
      ownerReviewRequestBusy = false;
      els.ownerReviewRequestAnswers.disabled = false;
    }
  }

  async function generateOwnerReviewAiSummary() {
    if (!ownerReviewBookingId || !aiFeatureEnabled) return;
    els.ownerReviewStatus.textContent = "AI 整理中…";
    els.ownerReviewAiGenerate.disabled = true;
    try {
      var result = await window.ownerApi.generateBookingReviewSummary(ownerReviewBookingId);
      els.ownerReviewAiResult.value = result.summary || "";
      els.ownerReviewStatus.textContent = result.disclaimer || "";
    } catch (error) {
      els.ownerReviewStatus.textContent = error.message;
    } finally {
      els.ownerReviewAiGenerate.disabled = false;
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
      var depositDueLine = b.internalStatus === "pending_customer_confirmation" && b.depositDueAt
        ? '<p class="booking-date-line">訂金期限：' +
          escapeHtml(new Date(b.depositDueAt).toLocaleString("zh-TW", {
            timeZone: "Asia/Taipei",
            hour12: false
          })) + "</p>"
        : "";
      var depositStatus = ownerDepositStatusHtml(b);
      var rescheduleHistory = Array.isArray(b.rescheduleHistory) ? b.rescheduleHistory : [];
      var rescheduleHistoryHtml = rescheduleHistory.length
        ? '<div class="booking-reschedule-history"><strong>變更紀錄</strong>' +
          rescheduleHistory.map(function (entry) {
            var changedAt = entry.changedAt
              ? new Date(entry.changedAt).toLocaleString("zh-TW", {
                timeZone: "Asia/Taipei", hour12: false
              })
              : "";
            return '<p class="booking-date-line">原預約日期：' +
              escapeHtml(formatDateZh(entry.originalDate)) + ' ' +
              escapeHtml(entry.originalTime || "") +
              (changedAt ? '<br><small>操作變更時間：' + escapeHtml(changedAt) + '</small>' : '') +
              '</p>';
          }).join("") + '</div>'
        : "";
      var canCancel = ["pending", "pending_review", "pending_customer_confirmation", "confirmed"]
        .indexOf(String(b.internalStatus || "")) !== -1;
      var cancelBtn = canCancel
        ? '<button type="button" class="btn btn-danger btn-cancel-booking" data-cancel-id="' +
          escapeHtml(b.id) + '">取消預約</button>'
        : "";
      var transitionActions = (!isCancelled && !isNoShow)
        ? getOwnerStaffTransitionActions(b.internalStatus, b)
        : [];
      var transitionBtns = transitionActions.map(function (action) {
        var prerequisiteIssue = action.toStatus === "pending_customer_confirmation"
          ? depositSetupIssue()
          : "";
        var disabledAttr = (transitionBusy || rescheduleBusy || prerequisiteIssue) ? " disabled" : "";
        var titleAttr = prerequisiteIssue
          ? ' title="' + escapeHtml(prerequisiteIssue) + '"'
          : "";
        return (
          '<button type="button" class="btn btn-primary btn-small btn-transition-booking"' +
          disabledAttr +
          titleAttr +
          ' data-transition-id="' + escapeHtml(b.id) + '"' +
          ' data-transition-to="' + escapeHtml(action.toStatus) + '">' +
          escapeHtml(action.label) +
          "</button>"
        );
      }).join("");
      var actionMessage = bookingActionMessages[b.id] ||
        (transitionActions.some(function (action) {
          return action.toStatus === "pending_customer_confirmation";
        }) ? depositSetupIssue() : "");
      var actionMessageHtml = actionMessage
        ? '<p class="booking-action-message" role="alert">' + escapeHtml(actionMessage) + '</p>'
        : "";
      // 首版僅 confirmed 可改期；不把 customerId／staffId 等放入 DOM
      var rescheduleBtn = (b.internalStatus === "confirmed")
        ? '<button type="button" class="btn btn-small btn-reschedule-booking"' +
          ((transitionBusy || rescheduleBusy) ? " disabled" : "") +
          ' data-reschedule-id="' + escapeHtml(b.id) + '">改期</button>'
        : "";
      var aiDraftBtn = aiFeatureEnabled
        ? ('<button type="button" class="btn btn-small btn-ai-draft"' +
          ((transitionBusy || rescheduleBusy || aiDraftBusy) ? " disabled" : "") +
          ' data-ai-draft-id="' + escapeHtml(b.id) + '">AI 訊息草稿</button>')
        : "";
      var reviewBtn = (b.internalStatus === "pending_review" ||
          b.internalStatus === "pending_customer_confirmation")
        ? '<button type="button" class="btn btn-small btn-owner-review" data-owner-review-id="' +
          escapeHtml(b.id) + '">審核資料／照片</button>'
        : "";
      var pigmentReminderBtn = b.internalStatus === "completed" &&
          /霧眉|紋眉|飄眉|粉霧眉|紋繡|霧唇|紋唇|唇色|唇部定妝|唇部調色/.test(String(b.serviceName || ""))
        ? '<button type="button" class="btn btn-small btn-pigment-reminders" ' +
          'data-pigment-reminder-id="' + escapeHtml(b.id) + '" data-pigment-service-date="' +
          escapeHtml(b.date || date) + '" data-pigment-touchup-date="' +
          escapeHtml(b.pigmentTouchupReminderDate || "") + '" data-pigment-maintenance-date="' +
          escapeHtml(b.pigmentMaintenanceReminderDate || "") + '">' +
          (b.pigmentTouchupReminderDate || b.pigmentMaintenanceReminderDate
            ? "調整補色提醒日期" : "設定補色提醒日期") + '</button>'
        : "";
      var pigmentReminderHtml = b.internalStatus === "completed" &&
          (b.pigmentTouchupReminderDate || b.pigmentMaintenanceReminderDate)
        ? '<div class="booking-pigment-reminders"><strong>補色提醒日期</strong>' +
          (b.pigmentTouchupReminderDate
            ? '<p>滿月補色提醒：' + escapeHtml(formatDateZh(b.pigmentTouchupReminderDate)) + '</p>' : '') +
          (b.pigmentMaintenanceReminderDate
            ? '<p>滿年前保養提醒：' + escapeHtml(formatDateZh(b.pigmentMaintenanceReminderDate)) + '</p>' : '') +
          '</div>'
        : "";
      var actionRow = (transitionBtns || reviewBtn || rescheduleBtn || aiDraftBtn || pigmentReminderBtn || cancelBtn)
        ? '<div class="booking-card-actions">' + transitionBtns + rescheduleBtn +
          reviewBtn + aiDraftBtn + pigmentReminderBtn + cancelBtn + "</div>"
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
          '<p class="booking-current-date"><span>預約日期</span><strong>' +
            escapeHtml(formatDateZh(b.date || date)) + ' ' + escapeHtml(b.time || "") +
          '</strong></p>' +
          depositStatus + actionMessageHtml +
          rescheduleHistoryHtml +
          pigmentReminderHtml +
          depositDueLine +
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
    container.querySelectorAll("[data-pigment-reminder-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var bookingId = btn.getAttribute("data-pigment-reminder-id");
        openPigmentReminderModal(
          bookingId,
          btn.getAttribute("data-pigment-service-date"),
          btn.getAttribute("data-pigment-touchup-date"),
          btn.getAttribute("data-pigment-maintenance-date")
        );
      });
    });

    container.querySelectorAll("[data-transition-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (transitionBusy || rescheduleBusy || btn.disabled) return;
        var id = btn.getAttribute("data-transition-id");
        var toStatus = btn.getAttribute("data-transition-to");
        var booking = sorted.find(function (b) { return b.id === id; });
        var actions = getOwnerStaffTransitionActions(
          booking && booking.internalStatus ? booking.internalStatus : "",
          booking
        );
        var action = actions.find(function (item) { return item.toStatus === toStatus; });
        if (!action) return;
        submitBookingTransition(id, action, booking);
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
    container.querySelectorAll("[data-owner-review-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openOwnerReview(btn.getAttribute("data-owner-review-id"));
      });
    });

    container.querySelectorAll("[data-ai-draft-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (transitionBusy || rescheduleBusy || aiDraftBusy || btn.disabled) return;
        var id = btn.getAttribute("data-ai-draft-id");
        var booking = sorted.find(function (b) { return b.id === id; });
        openOwnerAiDraftModal(booking || { id: id, date: date });
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
    if (!await confirmOwnerAction(
      "確定要取消這筆預約嗎？取消後客人會看到原因。",
      { title: "確認取消預約", confirmLabel: "確認取消", danger: true }
    )) {
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
    var match = /^([01]\d|2[0-3]):(00|30)$/.exec(String(value || "").trim());
    if (!match) return "";
    return match[1] + ":" + match[2];
  }

  function isHalfHourSlot(value) {
    return /^([01]\d|2[0-3]):(00|30)$/.test(String(value || "").trim());
  }

  function clearRescheduleTimeSelect(placeholderText, disabled) {
    var select = els.ownerRescheduleTime;
    if (!select) return;
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
    var option = document.createElement("option");
    option.value = "";
    option.textContent = placeholderText || "請先選擇日期";
    select.appendChild(option);
    select.value = "";
    select.disabled = disabled !== false;
  }

  function renderRescheduleTimeOptions(slots, placeholderText) {
    var select = els.ownerRescheduleTime;
    if (!select) return;
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = placeholderText || "請選擇時間";
    select.appendChild(placeholder);

    var validSlots = [];
    (slots || []).forEach(function (slot) {
      var time = normalizeRescheduleTimeInput(slot);
      if (!time || !isHalfHourSlot(time)) return;
      if (validSlots.indexOf(time) !== -1) return;
      validSlots.push(time);
      var option = document.createElement("option");
      option.value = time;
      option.textContent = time;
      select.appendChild(option);
    });

    select.value = "";
    select.disabled = validSlots.length === 0 || rescheduleBusy;
    rescheduleModalState.slots = validSlots;
    updateRescheduleConfirmEnabled();
  }

  function updateRescheduleConfirmEnabled() {
    if (!els.ownerRescheduleConfirm) return;
    if (rescheduleBusy) {
      els.ownerRescheduleConfirm.disabled = true;
      return;
    }
    var selected = normalizeRescheduleTimeInput(
      els.ownerRescheduleTime && els.ownerRescheduleTime.value
    );
    var ok = Boolean(
      rescheduleModalState.bookingId &&
      els.ownerRescheduleDate &&
      els.ownerRescheduleDate.value &&
      selected &&
      rescheduleModalState.slots.indexOf(selected) !== -1
    );
    els.ownerRescheduleConfirm.disabled = !ok;
  }

  function setRescheduleModalControlsBusy(busy) {
    rescheduleBusy = !!busy;
    if (els.ownerRescheduleDismiss) els.ownerRescheduleDismiss.disabled = rescheduleBusy;
    if (els.ownerRescheduleDate) els.ownerRescheduleDate.disabled = rescheduleBusy;
    if (els.ownerRescheduleTime) {
      els.ownerRescheduleTime.disabled = rescheduleBusy ||
        !(rescheduleModalState.slots && rescheduleModalState.slots.length);
    }
    updateRescheduleConfirmEnabled();
    renderDayBookings();
  }

  function resetRescheduleSlotState() {
    rescheduleModalState.slots = [];
    rescheduleModalState.slotsDate = "";
    clearRescheduleTimeSelect("請先選擇日期", true);
    updateRescheduleConfirmEnabled();
  }

  async function loadRescheduleSlotsForDate(dateStr) {
    var bookingId = rescheduleModalState.bookingId;
    var date = String(dateStr || "").trim();
    if (!bookingId || !date) {
      resetRescheduleSlotState();
      return;
    }

    rescheduleModalState.slotsRequestSeq += 1;
    var requestSeq = rescheduleModalState.slotsRequestSeq;
    rescheduleModalState.slots = [];
    rescheduleModalState.slotsDate = date;
    clearRescheduleTimeSelect("載入可用時段中…", true);
    updateRescheduleConfirmEnabled();

    try {
      var result = await window.ownerApi.getRescheduleSlots(bookingId, date);
      if (requestSeq !== rescheduleModalState.slotsRequestSeq) {
        return;
      }
      if (String(els.ownerRescheduleDate.value || "").trim() !== date) {
        return;
      }
      var slots = (result && result.slots) || [];
      if (!slots.length) {
        renderRescheduleTimeOptions([], "此日期沒有可改期時段");
        return;
      }
      renderRescheduleTimeOptions(slots, "請選擇時間");
    } catch (error) {
      if (requestSeq !== rescheduleModalState.slotsRequestSeq) {
        return;
      }
      resetRescheduleSlotState();
      clearRescheduleTimeSelect("載入失敗，請重選日期", true);
      setStatus("error", error && error.message ? error.message : "載入可用時段失敗");
    }
  }

  function openOwnerRescheduleModal(booking) {
    if (!booking || !booking.id || booking.internalStatus !== "confirmed") return;
    rescheduleModalState.bookingId = String(booking.id);
    rescheduleModalState.customerName = booking.customerName || "客人";
    rescheduleModalState.serviceName = booking.serviceName || "服務";
    rescheduleModalState.date = booking.date || state.selectedDate || "";
    rescheduleModalState.time = booking.time || "";
    rescheduleModalState.slotsRequestSeq += 1;
    els.ownerRescheduleSummary.textContent =
      rescheduleModalState.customerName + "｜" +
      rescheduleModalState.serviceName + "｜" +
      formatDateZh(rescheduleModalState.date) + " " +
      rescheduleModalState.time;
    els.ownerRescheduleDate.value = "";
    resetRescheduleSlotState();
    setRescheduleModalControlsBusy(false);
    els.ownerRescheduleModal.classList.remove("hidden");
  }

  function closeOwnerRescheduleModal() {
    if (rescheduleBusy) return;
    rescheduleModalState.slotsRequestSeq += 1;
    rescheduleModalState.bookingId = "";
    rescheduleModalState.customerName = "";
    rescheduleModalState.serviceName = "";
    rescheduleModalState.date = "";
    rescheduleModalState.time = "";
    rescheduleModalState.slots = [];
    rescheduleModalState.slotsDate = "";
    if (els.ownerRescheduleDate) els.ownerRescheduleDate.value = "";
    clearRescheduleTimeSelect("請先選擇日期", true);
    if (els.ownerRescheduleSummary) els.ownerRescheduleSummary.textContent = "";
    if (els.ownerRescheduleConfirm) els.ownerRescheduleConfirm.disabled = true;
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
    if (!newTime || rescheduleModalState.slots.indexOf(newTime) === -1) {
      setStatus("error", "請選擇可用的預約時間");
      return;
    }

    setRescheduleModalControlsBusy(true);
    setStatus("info", "確認時段中…");
    try {
      var latest = await window.ownerApi.getRescheduleSlots(bookingId, newDate);
      var latestSlots = ((latest && latest.slots) || []).map(normalizeRescheduleTimeInput)
        .filter(function (slot) { return slot && isHalfHourSlot(slot); });
      if (latestSlots.indexOf(newTime) === -1) {
        renderRescheduleTimeOptions(
          latestSlots,
          latestSlots.length ? "請選擇時間" : "此日期沒有可改期時段"
        );
        setStatus("error", "此時段剛被預約，請重新選擇");
        setRescheduleModalControlsBusy(false);
        return;
      }

      var confirmMessage =
        "確定將預約改期？\n" +
        "原時段：" + formatDateZh(rescheduleModalState.date) + " " + rescheduleModalState.time + "\n" +
        "新時段：" + formatDateZh(newDate) + " " + newTime;
      if (!await confirmOwnerAction(confirmMessage, {
        title: "確認預約改期",
        confirmLabel: "確認改期"
      })) {
        setRescheduleModalControlsBusy(false);
        return;
      }

      setStatus("info", "改期處理中…");
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
    if (els.aiSummaryDate) {
      els.aiSummaryDate.value = date || "";
    }
    renderCalendar();
    renderDayBookings();
  }

  function setAiStatus(el, message, isError) {
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-error", Boolean(isError && message));
  }

  async function copyTextToClipboard(text) {
    var value = String(text || "");
    if (!value) {
      throw new Error("尚無草稿可複製");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    throw new Error("此裝置不支援複製到剪貼簿");
  }

  function applyAiCapabilityUi() {
    if (els.ownerReviewAi) els.ownerReviewAi.hidden = !aiFeatureEnabled;
    if (els.aiPlanBlock) {
      els.aiPlanBlock.classList.toggle("hidden", !aiFeatureEnabled);
      els.aiPlanBlock.hidden = !aiFeatureEnabled;
    }
    if (els.aiSummaryCard) {
      if (aiFeatureEnabled) {
        els.aiSummaryCard.classList.remove("hidden");
        els.aiSummaryCard.hidden = false;
      } else {
        els.aiSummaryCard.classList.add("hidden");
        els.aiSummaryCard.hidden = true;
        if (els.aiSummaryResult) els.aiSummaryResult.value = "";
        if (els.aiSummaryCopy) els.aiSummaryCopy.disabled = true;
        setAiStatus(els.aiSummaryStatus, "", false);
      }
    }
  }

  function formatAiInquiryTime(value) {
    var date = new Date(String(value || ""));
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }

  function isPendingAssessment(item) {
    return item && item.status !== "approved";
  }

  function renderAiWorkQueue(data, assessmentData) {
    if (!els.aiWorkQueueList) return;
    var items = data && Array.isArray(data.items) ? data.items : [];
    var counts = data && data.counts ? data.counts : {};
    var assessments = Array.isArray(assessmentData) ? assessmentData.filter(isPendingAssessment) : [];
    counts.pendingAssessment = assessments.length;
    var countLabels = [
      ["pendingAssessment", "待評估"],
      ["pendingReview", "待審核"],
      ["questionRequested", "待補答"],
      ["photoRequested", "待補照片"],
      ["pendingDeposit", "待訂金"],
      ["deadlineRisk", "即將逾時"]
    ];
    els.aiWorkQueueCounts.innerHTML = countLabels.map(function (entry) {
      var active = aiWorkQueueFilter === entry[0];
      return '<button type="button" class="ai-work-queue-count' +
        (active ? ' is-active' : '') + '" data-work-queue-filter="' +
        escapeHtml(entry[0]) + '" aria-pressed="' + String(active) + '"><strong>' +
        escapeHtml(String(Number(counts[entry[0]]) || 0)) + "</strong>" +
        escapeHtml(entry[1]) + "</button>";
    }).join("");
    els.aiWorkQueueCounts.querySelectorAll("[data-work-queue-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        var selected = button.getAttribute("data-work-queue-filter");
        aiWorkQueueFilter = aiWorkQueueFilter === selected ? "all" : selected;
        renderAiWorkQueue(data, assessmentData);
      });
    });
    var activeLabel = countLabels.find(function (entry) {
      return entry[0] === aiWorkQueueFilter;
    });
    var visibleItems = aiWorkQueueFilter === "pendingAssessment" ? assessments :
      (aiWorkQueueFilter === "all" ? items : items.filter(function (item) {
        return Boolean(item[aiWorkQueueFilter]);
      }));
    els.aiWorkQueueSummary.textContent = aiWorkQueueFilter === "all"
      ? (items.length ? "目前有 " + items.length + " 筆預約需要處理" : "目前沒有待處理預約")
      : (activeLabel[1] + "：" + visibleItems.length + " 筆（再按一次顯示全部）");
    if (!visibleItems.length) {
      els.aiWorkQueueList.innerHTML =
        '<div class="ai-empty-workspace"><strong>' +
        escapeHtml(activeLabel ? "目前沒有「" + activeLabel[1] + "」案件" : "待辦已清空") +
        '</strong><span>' + escapeHtml(activeLabel && activeLabel[0] === "questionRequested"
          ? "只有業主已通知客人補答的案件會列在這裡。"
          : "新的審核、補件或訂金項目會顯示在這裡。") + "</span></div>";
      return;
    }
    els.aiWorkQueueList.innerHTML = visibleItems.map(function (item) {
      var tags = [];
      if (item.pendingReview) tags.push("待審核");
      if (item.questionRequested) tags.push("待補答");
      if (item.photoRequested) tags.push("待補照片");
      if (item.pendingDeposit) tags.push(item.depositReported ? "已回報匯款" : "待訂金");
      if (item.deadlineRisk) tags.push("即將逾時");
      var due = item.depositDueAt
        ? '<p>訂金期限：' + escapeHtml(formatAiInquiryTime(item.depositDueAt)) + "</p>"
        : "";
      return '<article class="ai-work-queue-item' +
        (item.deadlineRisk ? " ai-work-queue-item-risk" : "") + '">' +
        '<div><strong>' + escapeHtml(item.customerName) + "</strong><span>" +
        escapeHtml(item.templateName || item.serviceName) +
        (item.startAt ? " · " + escapeHtml(formatAiInquiryTime(item.startAt)) : "") + "</span></div>" +
        '<div class="ai-work-queue-tags">' + tags.map(function (tag) {
          return "<span>" + escapeHtml(tag) + "</span>";
        }).join("") + "</div>" + due +
        (aiWorkQueueFilter === "pendingAssessment"
          ? '<button type="button" class="btn btn-small" data-work-queue-assessment="' +
            escapeHtml(item.id) + '">前往評估</button>'
          : '<button type="button" class="btn btn-small" data-work-queue-booking="' +
            escapeHtml(item.bookingId) + '" data-work-queue-start="' +
            escapeHtml(item.startAt) + '">前往處理</button>') + '</article>';
    }).join("");
    els.aiWorkQueueList.querySelectorAll("[data-work-queue-assessment]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = els.browIntakeList && els.browIntakeList.querySelector(
          '[data-assessment-card="' + button.getAttribute("data-work-queue-assessment") + '"]');
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    els.aiWorkQueueList.querySelectorAll("[data-work-queue-booking]").forEach(function (button) {
      button.addEventListener("click", function () {
        var start = new Date(button.getAttribute("data-work-queue-start"));
        if (!Number.isFinite(start.getTime())) return;
        var date = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
        }).format(start);
        switchTab("today");
        loadMonthBookings(date.slice(0, 7), date).catch(function (error) {
          setStatus("error", error.message);
        });
      });
    });
  }

  async function loadAiWorkQueue() {
    if (!aiFeatureEnabled || !window.ownerApi ||
        typeof window.ownerApi.getAiWorkQueue !== "function") return;
    els.aiWorkQueueRefresh.disabled = true;
    setAiStatus(els.aiWorkQueueStatus, "正在整理優先待辦…", false);
    try {
      var results = await Promise.all([
        window.ownerApi.getAiWorkQueue(),
        window.ownerApi.getAssessments ? window.ownerApi.getAssessments() : Promise.resolve([])
      ]);
      renderAiWorkQueue(results[0], results[1]);
      setAiStatus(els.aiWorkQueueStatus, "", false);
    } catch (error) {
      setAiStatus(els.aiWorkQueueStatus, error.message || "無法載入待辦", true);
    } finally {
      els.aiWorkQueueRefresh.disabled = false;
    }
  }

  function browAnswerLabel(key) {
    return ({ service_type: "諮詢服務",
      old_brow_status: "舊眉狀況",
      last_brow_procedure_date_range: "上次紋繡時間", brow_removal_history: "洗眉紀錄",
      last_brow_removal_date: "最近洗眉時間", recent_treatments: "近期療程",
      recent_treatment_date: "最近療程時間", current_skin_condition: "眉部皮膚狀況",
      health_data_consent: "健康資料同意", health_or_medication_risk: "健康或用藥",
      health_risk_categories: "健康風險類別", pregnancy_breastfeeding_status: "懷孕或哺乳",
      previous_adverse_reactions: "過去不良反應", important_event_type: "重要行程",
      important_event_date: "是否在十天內", photos: "照片",
      customer_questions: "評估中客戶與 AI 問答", treatment_goals: "改善需求",
      previous_lip_tattoo: "舊唇色狀況", last_lip_tattoo_date_range: "上次霧唇時間",
      residual_pigment_status: "殘留唇色", herpes_or_cold_sore_history: "水泡相關紀錄",
      last_cold_sore_episode: "最近發生時間", current_lip_or_oral_condition: "目前唇部狀況",
      recent_lip_procedures: "近期唇部醫美", recent_dental_procedures: "近期牙科療程",
      medication_status: "目前用藥", medication_categories: "用藥類別" })[key] || key;
  }

  function renderBrowIntakes(data) {
    if (!els.browIntakeList) return;
    var items = Array.isArray(data) ? data : [];
    var pending = items.filter(isPendingAssessment).length;
    els.browIntakeCount.textContent = pending ? pending + " 筆等待審核" : "目前沒有待審核案件";
    if (!items.length) {
      els.browIntakeList.innerHTML = '<div class="ai-empty-workspace"><strong>尚無新客評估案件</strong>' +
        '<span>客戶完成逐題評估並送出後，摘要會顯示在這裡。</span></div>';
      return;
    }
    els.browIntakeList.innerHTML = items.map(function (item) {
      var reviewStatusLabel = ({ "一般待審核": "一般待審核", "優先待審核": "優先待審核",
        "待補資料": "待補資料", "暫不開放排程": "暫不開放排程",
        approved: "已核准，可預約", contact_manually: "改由人工聯絡" })[item.status] || item.status;
      var answers = item.answers || {};
      var rows = Object.keys(answers).filter(function (key) { return key.charAt(0) !== "_"; })
        .map(function (key) { return '<p><strong>' + escapeHtml(browAnswerLabel(key)) +
          '：</strong>' + escapeHtml(Array.isArray(answers[key]) ? answers[key].join("、") : answers[key]) + '</p>'; }).join("");
      var currentReviewStatus = ({ approved: "approved", "待補資料": "need_more_information",
        "暫不開放排程": "temporarily_unavailable", contact_manually: "contact_manually" })[item.status] || "";
      function currentDisabled(status) { return currentReviewStatus === status ? " disabled" : ""; }
      var nextStepGuide = ({
        approved: "系統已通知客戶可以預約。接下來請等待客戶完成預約；若遲遲未預約，再主動聯絡確認。",
        need_more_information: "系統已通知客戶補資料。接下來請等待客戶補充，再重新檢查並更新評估結果。",
        temporarily_unavailable: "目前已暫停客戶預約。接下來請視情況追蹤；條件改變後，再更新評估結果。",
        contact_manually: "此案改由人工處理。接下來請主動聯絡客戶，確認需求並安排後續。"
      })[currentReviewStatus] || "請先放大檢查照片與逐題回答，再選擇一項處理方式。";
      var actions = '<div class="assessment-next-step"><strong>下一步引導</strong>' +
          '<p class="panel-hint">' + nextStepGuide + ' 目前結果的按鈕會停用，如需調整可改選其他處理方式。</p>' +
          '<div class="ai-inquiry-actions">' +
          '<button type="button" class="btn btn-small btn-primary" data-brow-status="approved" data-brow-id="' + escapeHtml(item.id) + '"' + currentDisabled("approved") + '>核准並開放預約</button>' +
          '<button type="button" class="btn btn-small" data-brow-status="need_more_information" data-brow-id="' + escapeHtml(item.id) + '" data-brow-inquiry-id="' + escapeHtml(item.latestInquiryId || "") + '"' + currentDisabled("need_more_information") + '>要求補資料／照片</button>' +
          '<button type="button" class="btn btn-small" data-brow-status="temporarily_unavailable" data-brow-id="' + escapeHtml(item.id) + '"' + currentDisabled("temporarily_unavailable") + '>暫停預約</button>' +
          '<button type="button" class="btn btn-small" data-brow-status="contact_manually" data-brow-id="' + escapeHtml(item.id) + '"' + currentDisabled("contact_manually") + '>改由人工聯絡</button></div></div>';
      var photos = (item.photos || []).length ? '<div class="booking-review-photos">' +
        item.photos.map(function (photo) { return '<button type="button" class="btn btn-small" ' +
          'data-brow-photo-id="' + escapeHtml(photo.photoId) + '" data-brow-photo-session="' +
          escapeHtml(item.id) + '">查看' + escapeHtml(({ front: "正面", left: "左側", right: "右側" })[photo.kind] || "照片") + '</button>'; }).join("") + '</div>' :
        ((item.missingFields || []).length ? '<p class="panel-hint">尚缺：' + escapeHtml(item.missingFields.join("、")) + '</p>' : "");
      return '<article class="ai-inquiry-item" data-assessment-card="' + escapeHtml(item.id) +
        '"><div class="ai-inquiry-head"><strong>' +
        escapeHtml(item.customerName || "LINE 客人") + '</strong><span>' + escapeHtml(reviewStatusLabel) +
        '</span></div><p class="panel-hint">' + escapeHtml(item.templateName || "新客評估") + '</p>' +
        '<p class="ai-inquiry-summary"><strong>系統摘要：</strong>' + escapeHtml(item.ownerSummary || item.bookingRoute || "待人工查看") +
        '</p><p class="panel-hint"><strong>案件標籤：</strong>' + escapeHtml((item.caseTags || []).join("、") || "無") +
        '</p>' + actions + '<details open><summary>查看客戶逐題回答</summary>' + rows + '</details>' + photos + '</article>';
    }).join("");
    els.browIntakeList.querySelectorAll("[data-brow-id]").forEach(function (button) {
      button.addEventListener("click", function () {
        openBrowReviewModal(button.getAttribute("data-brow-id"),
          button.getAttribute("data-brow-status"), button.getAttribute("data-brow-inquiry-id") || "");
      });
    });
    els.browIntakeList.querySelectorAll("[data-brow-photo-id]").forEach(function (button) {
      button.addEventListener("click", function () {
        openAssessmentPhotoLightbox(button.getAttribute("data-brow-photo-session"),
          button.getAttribute("data-brow-photo-id"), button.textContent || "評估照片");
      });
    });
  }

  async function loadBrowIntakes() {
    if (browIntakeBusy || !els.browIntakeList || !window.ownerApi.getAssessments) return;
    browIntakeBusy = true;
    setAiStatus(els.browIntakeStatus, "正在整理新客評估…", false);
    try { renderBrowIntakes(await window.ownerApi.getAssessments()); setAiStatus(els.browIntakeStatus, "", false); }
    catch (error) { setAiStatus(els.browIntakeStatus, error.message || "無法載入評估案件", true); }
    finally { browIntakeBusy = false; }
  }

  function openBrowReviewModal(id, status, inquiryId) {
    var labels = { approved: "核准並開放預約", need_more_information: "需要補資料",
      temporarily_unavailable: "暫停預約", contact_manually: "改由人工聯絡" };
    var label = labels[status] || "更新案件";
    browReviewModalState = { id: id, status: status, inquiryId: inquiryId || "" };
    els.browReviewConfirmSummary.textContent = status === "need_more_information"
      ? "請填寫要客戶補充的資料。確認後會直接傳送給客戶。"
      : "確認將此案件設為「" + label + "」。";
    var needsMessage = status === "need_more_information";
    els.browReviewMessageWrap.hidden = !needsMessage;
    els.browReviewMessageWrap.classList.toggle("hidden", !needsMessage);
    els.browReviewMessage.value = "";
    setAiStatus(els.browReviewConfirmStatus, "", false);
    els.browReviewConfirmModal.hidden = false;
    els.browReviewConfirmModal.classList.remove("hidden");
    if (needsMessage) els.browReviewMessage.focus();
  }

  function closeBrowReviewModal() {
    els.browReviewConfirmModal.hidden = true;
    els.browReviewConfirmModal.classList.add("hidden");
    browReviewModalState = { id: "", status: "", inquiryId: "" };
  }

  async function reviewBrowIntake() {
    if (browIntakeBusy || !browReviewModalState.id) return;
    var id = browReviewModalState.id;
    var status = browReviewModalState.status;
    var inquiryId = browReviewModalState.inquiryId;
    var message = String(els.browReviewMessage.value || "").trim();
    var labels = { approved: "核准並開放預約", need_more_information: "需要補資料",
      temporarily_unavailable: "暫停預約", contact_manually: "改由人工聯絡" };
    var label = labels[status] || "更新案件";
    if (status === "need_more_information" && !message) {
      setAiStatus(els.browReviewConfirmStatus, "請先填寫要客戶補充的資料。", true);
      return;
    }
    browIntakeBusy = true;
    els.browReviewConfirmSubmit.disabled = true;
    setAiStatus(els.browReviewConfirmStatus, "正在儲存並通知客戶…", false);
    try {
      await window.ownerApi.reviewAssessment(id, status, message);
      browIntakeBusy = false;
      await loadBrowIntakes();
      await loadAiInquiries();
      closeBrowReviewModal();
      setAiStatus(els.browIntakeStatus, "已更新：" + label + "。", false);
      if (inquiryId) {
        var inquiryCard = document.querySelector('[data-ai-inquiry-card="' + inquiryId + '"]');
        if (inquiryCard) inquiryCard.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (error) {
      setAiStatus(els.browReviewConfirmStatus, error.message || "審核更新失敗", true);
    } finally {
      browIntakeBusy = false;
      els.browReviewConfirmSubmit.disabled = false;
    }
  }

  function renderAiInquiries(data) {
    if (!els.aiInquiryList) return;
    var inquiries = (data && data.inquiries) || [];
    var unread = Number(data && data.unreadCount) || 0;
    if (els.aiInquiryCount) {
      els.aiInquiryCount.textContent = unread > 0
        ? unread + " 筆新洽詢需要查看"
        : "目前沒有未讀洽詢";
    }
    if (els.aiUnreadBadge) {
      els.aiUnreadBadge.textContent = String(unread);
      els.aiUnreadBadge.hidden = unread === 0;
      els.aiUnreadBadge.classList.toggle("hidden", unread === 0);
    }
    if (!inquiries.length) {
      els.aiInquiryList.innerHTML =
        '<div class="ai-empty-workspace"><strong>目前沒有客戶問題</strong>' +
        "<span>客人送出問題後，AI 內部判讀會出現在這裡。</span></div>";
      return;
    }
    els.aiInquiryList.innerHTML = inquiries.map(function (item) {
      var statusLabel = item.status === "new"
        ? "新洽詢" : (item.status === "reviewed" ? "已查看" : "已處理");
      var followUp = item.needsOwnerFollowUp
        ? '<span class="ai-inquiry-follow-up">需要業主跟進</span>' : "";
      var service = item.recommendedServiceName
        ? '<p><strong>相關服務：</strong>' +
          escapeHtml(item.recommendedServiceName) + "</p>" : "";
      var sentReply = item.ownerReply && item.ownerReply.status === "sent"
        ? '<div class="ai-inquiry-owner-reply"><strong>您的回覆</strong>' +
          '<p>' + escapeHtml(item.ownerReply.text) + '</p>' +
          '<span>已傳送給客人 · ' +
          escapeHtml(formatAiInquiryTime(item.ownerReply.sentAt)) + '</span></div>'
        : "";
      var failedReply = item.ownerReply && item.ownerReply.status === "failed"
        ? '<p class="ai-inquiry-reply-error">上次回覆未送出，請重新輸入後再傳送。</p>'
        : "";
      var replyComposer = item.status === "resolved" && sentReply
        ? ""
        : '<div class="ai-inquiry-reply">' +
          '<label for="ai-inquiry-reply-' + escapeHtml(item.id) +
          '">回覆客人</label>' +
          '<textarea id="ai-inquiry-reply-' + escapeHtml(item.id) +
          '" data-ai-inquiry-reply-input="' + escapeHtml(item.id) +
          '" rows="3" maxlength="1000" placeholder="輸入要傳送給客人的訊息"></textarea>' +
          '<button type="button" class="btn btn-small" data-ai-inquiry-draft-apply="' +
          escapeHtml(item.id) + '">套用 AI 建議回覆</button>' +
          '<div class="ai-inquiry-reply-footer"><span>確認內容後，將直接傳送至客人的 LINE。</span>' +
          '<button type="button" class="btn btn-small btn-primary" ' +
          'data-ai-inquiry-reply-send="' + escapeHtml(item.id) +
          '">傳送回覆</button></div></div>';
      var actions = item.status === "resolved"
        ? ""
        : '<div class="ai-inquiry-actions">' +
          (item.status === "new"
            ? '<button type="button" class="btn btn-small" data-ai-inquiry-status="reviewed" ' +
              'data-ai-inquiry-id="' + escapeHtml(item.id) + '">標記已查看</button>'
            : "") +
          '<button type="button" class="btn btn-small btn-primary" ' +
          'data-ai-inquiry-status="resolved" data-ai-inquiry-id="' +
          escapeHtml(item.id) + '">完成處理</button></div>';
      return '<article data-ai-inquiry-card="' + escapeHtml(item.id) + '" data-ai-inquiry-follow-up="' +
        (item.needsOwnerFollowUp && item.status !== "resolved" ? "true" : "false") +
        '" class="ai-inquiry-item ai-inquiry-item-' +
        escapeHtml(item.status) + '">' +
        '<div class="ai-inquiry-head"><strong>' +
        escapeHtml(item.customerName || "LINE 客人") + '</strong><span>' +
        escapeHtml(formatAiInquiryTime(item.createdAt)) + " · " +
        statusLabel + "</span></div>" +
        followUp +
        '<p class="ai-inquiry-summary"><strong>AI 內部重點：</strong>' +
        escapeHtml(item.ownerSummary) + "</p>" +
        '<details><summary>查看客人問題與 AI 建議回覆</summary>' +
        '<p><strong>客人：</strong>' + escapeHtml(item.customerMessage) + "</p>" +
        '<p><strong>AI 建議回覆（客人看不到）：</strong>' + escapeHtml(item.aiReply) + "</p></details>" +
        service + sentReply + failedReply + replyComposer + actions + "</article>";
    }).join("");
    els.aiInquiryList.querySelectorAll("[data-ai-inquiry-id]").forEach(function (button) {
      button.addEventListener("click", function () {
        updateAiInquiry(
          button.getAttribute("data-ai-inquiry-id"),
          button.getAttribute("data-ai-inquiry-status")
        ).catch(function (error) {
          setAiStatus(els.aiInquiryStatus, error.message || "更新失敗", true);
        });
      });
    });
    els.aiInquiryList.querySelectorAll("[data-ai-inquiry-reply-send]").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-ai-inquiry-reply-send");
        var card = button.closest(".ai-inquiry-item");
        var input = card && card.querySelector("[data-ai-inquiry-reply-input]");
        sendAiInquiryReply(id, input, button).catch(function (error) {
          setAiStatus(els.aiInquiryStatus, error.message || "回覆未送出", true);
        });
      });
    });
    els.aiInquiryList.querySelectorAll("[data-ai-inquiry-draft-apply]").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-ai-inquiry-draft-apply");
        var item = inquiries.find(function (inquiry) { return String(inquiry.id) === id; });
        var card = button.closest(".ai-inquiry-item");
        var input = card && card.querySelector("[data-ai-inquiry-reply-input]");
        if (!item || !input) return;
        input.value = String(item.aiReply || "").slice(0, 1000);
        input.focus();
      });
    });
  }

  function renderAssessmentTemplates(data) {
    var templates = data && Array.isArray(data.templates) ? data.templates : [];
    if (!templates.length) {
      els.assessmentTemplateList.innerHTML = '<p class="panel-hint">目前沒有可設定的評估題庫。</p>';
      return;
    }
    els.assessmentTemplateList.innerHTML = templates.map(function (template) {
      var questions = (template.questions || []).map(function (question) {
        var locked = question.systemLocked;
        var options = (question.options || []).join("\n");
        return '<article class="assessment-template-question' + (locked ? ' is-locked' : '') + '" ' +
          'data-template-code="' + escapeHtml(template.code) + '" data-question-key="' + escapeHtml(question.key) + '">' +
          '<div class="ai-secretary-card-heading"><strong data-assessment-title>' + escapeHtml(question.prompt) + '</strong>' +
          (locked ? '<span class="ai-feature-state">系統鎖定</span>' :
            '<button type="button" class="btn btn-small assessment-edit-toggle" data-assessment-edit aria-expanded="false">編輯題目</button>') + '</div>' +
          (locked ? '<p class="panel-hint">' + escapeHtml(options.replace(/\n/g, '／')) + '</p>' :
            '<p class="panel-hint assessment-question-summary" data-assessment-summary>選項：' +
              escapeHtml(options.replace(/\n/g, '／')) + '</p>' +
            '<div class="assessment-question-editor" data-assessment-editor hidden>' +
              '<label>題目<input type="text" data-assessment-prompt maxlength="300" value="' + escapeHtml(question.prompt) + '"></label>' +
              '<label>選項（每行一個）<textarea data-assessment-options rows="4">' + escapeHtml(options) + '</textarea></label>' +
              '<div class="assessment-question-actions">' +
                '<button type="button" class="btn btn-small" data-assessment-cancel>取消編輯</button>' +
                '<button type="button" class="btn btn-primary btn-small" data-assessment-save disabled>儲存修改</button>' +
              '</div>' +
            '</div>') + '</article>';
      }).join("");
      return '<section class="assessment-template-group"><h4>' + escapeHtml(template.name) + '</h4>' + questions + '</section>';
    }).join("");
    els.assessmentTemplateList.querySelectorAll("[data-assessment-edit]").forEach(function (button) {
      var card = button.closest("[data-question-key]");
      initializeAssessmentQuestionEditor(card);
      button.addEventListener("click", function () {
        setAssessmentQuestionEditorOpen(card, button.getAttribute("aria-expanded") !== "true");
      });
    });
    els.assessmentTemplateList.querySelectorAll("[data-assessment-cancel]").forEach(function (button) {
      button.addEventListener("click", function () {
        var card = button.closest("[data-question-key]");
        restoreAssessmentQuestionEditor(card);
        setAssessmentQuestionEditorOpen(card, false);
      });
    });
    els.assessmentTemplateList.querySelectorAll("[data-assessment-save]").forEach(function (button) {
      button.addEventListener("click", function () { saveAssessmentQuestion(button.closest("[data-question-key]")); });
    });
  }

  function assessmentQuestionSnapshot(card) {
    if (!card) return "";
    return JSON.stringify({
      prompt: String(card.querySelector("[data-assessment-prompt]").value || "").trim(),
      options: String(card.querySelector("[data-assessment-options]").value || "").split(/\r?\n/)
        .map(function (item) { return item.trim(); }).filter(Boolean)
    });
  }

  function updateAssessmentQuestionDirtyState(card) {
    var save = card && card.querySelector("[data-assessment-save]");
    if (!save) return;
    save.disabled = assessmentTemplateBusy || assessmentQuestionSnapshot(card) === card._assessmentBaseline;
  }

  function initializeAssessmentQuestionEditor(card) {
    if (!card) return;
    card._assessmentBaseline = assessmentQuestionSnapshot(card);
    card.querySelectorAll("[data-assessment-prompt], [data-assessment-options]").forEach(function (field) {
      field.addEventListener("input", function () { updateAssessmentQuestionDirtyState(card); });
    });
    updateAssessmentQuestionDirtyState(card);
  }

  function restoreAssessmentQuestionEditor(card) {
    if (!card || !card._assessmentBaseline) return;
    var baseline = JSON.parse(card._assessmentBaseline);
    card.querySelector("[data-assessment-prompt]").value = baseline.prompt;
    card.querySelector("[data-assessment-options]").value = baseline.options.join("\n");
    updateAssessmentQuestionDirtyState(card);
  }

  function setAssessmentQuestionEditorOpen(card, open) {
    if (!card) return;
    if (open) {
      els.assessmentTemplateList.querySelectorAll("[data-question-key].is-editing").forEach(function (other) {
        if (other !== card) setAssessmentQuestionEditorOpen(other, false);
      });
    }
    var editor = card.querySelector("[data-assessment-editor]");
    var toggle = card.querySelector("[data-assessment-edit]");
    if (!editor || !toggle) return;
    editor.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "收合編輯" : "編輯題目";
    card.classList.toggle("is-editing", open);
    if (open) card.querySelector("[data-assessment-prompt]").focus();
  }

  function collapseAssessmentTemplates() {
    if (els.assessmentTemplateList) {
      els.assessmentTemplateList.innerHTML = "";
      els.assessmentTemplateList.hidden = true;
    }
    if (els.assessmentTemplateRefresh) {
      els.assessmentTemplateRefresh.setAttribute("aria-expanded", "false");
      els.assessmentTemplateRefresh.textContent = "查看／管理題庫";
    }
    if (els.assessmentTemplateStatus) els.assessmentTemplateStatus.textContent = "";
  }

  async function loadAssessmentTemplates() {
    if (assessmentTemplateBusy || !els.assessmentTemplateList) return;
    assessmentTemplateBusy = true; els.assessmentTemplateStatus.textContent = "正在載入題庫…";
    try {
      renderAssessmentTemplates(await window.ownerApi.getAssessmentTemplates());
      els.assessmentTemplateList.hidden = false;
      els.assessmentTemplateRefresh.setAttribute("aria-expanded", "true");
      els.assessmentTemplateRefresh.textContent = "收合題庫";
      els.assessmentTemplateStatus.textContent = "";
    }
    catch (error) { els.assessmentTemplateStatus.textContent = error.message || "無法載入題庫"; }
    assessmentTemplateBusy = false;
  }

  function toggleAssessmentTemplates() {
    if (!els.assessmentTemplateList || assessmentTemplateBusy) return;
    if (els.assessmentTemplateList.hidden) {
      loadAssessmentTemplates();
    } else {
      collapseAssessmentTemplates();
    }
  }

  async function saveAssessmentQuestion(card) {
    if (!card || assessmentTemplateBusy) return;
    if (assessmentQuestionSnapshot(card) === card._assessmentBaseline) return;
    var prompt = String(card.querySelector("[data-assessment-prompt]").value || "").trim();
    var options = String(card.querySelector("[data-assessment-options]").value || "").split(/\r?\n/)
      .map(function (item) { return item.trim(); }).filter(Boolean);
    if (!prompt || options.length < 2) { els.assessmentTemplateStatus.textContent = "題目不可空白，且至少需要兩個選項。"; return; }
    var saveButton = card.querySelector("[data-assessment-save]");
    assessmentTemplateBusy = true;
    saveButton.disabled = true;
    saveButton.textContent = "儲存中…";
    els.assessmentTemplateStatus.textContent = "正在儲存題目…";
    try {
      await window.ownerApi.updateAssessmentQuestion(card.getAttribute("data-template-code"),
        card.getAttribute("data-question-key"), { prompt: prompt, options: options });
      card._assessmentBaseline = assessmentQuestionSnapshot(card);
      card.querySelector("[data-assessment-title]").textContent = prompt;
      card.querySelector("[data-assessment-summary]").textContent = "選項：" + options.join("／");
      setAssessmentQuestionEditorOpen(card, false);
      els.assessmentTemplateStatus.textContent = "題目已儲存並收合。";
    } catch (error) {
      els.assessmentTemplateStatus.textContent = error.message || "題目儲存失敗";
    }
    assessmentTemplateBusy = false;
    saveButton.textContent = "儲存修改";
    updateAssessmentQuestionDirtyState(card);
  }

  async function loadAiInquiries() {
    if (!aiFeatureEnabled || aiInquiryBusy || !els.aiInquiryList ||
        !window.ownerApi || typeof window.ownerApi.getAiInquiries !== "function") return;
    aiInquiryBusy = true;
    if (els.aiInquiryRefresh) els.aiInquiryRefresh.disabled = true;
    setAiStatus(els.aiInquiryStatus, "正在更新洽詢回報…", false);
    try {
      var data = await window.ownerApi.getAiInquiries();
      renderAiInquiries(data);
      setAiStatus(els.aiInquiryStatus, "", false);
    } catch (error) {
      setAiStatus(els.aiInquiryStatus, error.message || "無法載入洽詢回報", true);
    } finally {
      aiInquiryBusy = false;
      if (els.aiInquiryRefresh) els.aiInquiryRefresh.disabled = false;
    }
  }

  function focusPendingAiInquiry() {
    if (!els.aiInquiryList) return false;
    var card = els.aiInquiryList.querySelector('[data-ai-inquiry-follow-up="true"]') ||
      els.aiInquiryList.querySelector(".ai-inquiry-item-new");
    if (!card) {
      els.aiInquiryList.scrollIntoView({ behavior: "smooth", block: "start" });
      return false;
    }
    var details = card.querySelector("details");
    if (details) details.open = true;
    card.classList.add("ai-inquiry-focus");
    card.setAttribute("tabindex", "-1");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof card.focus === "function") card.focus({ preventScroll: true });
    setTimeout(function () { card.classList.remove("ai-inquiry-focus"); }, 2400);
    return true;
  }

  async function updateAiInquiry(id, status) {
    if (aiInquiryBusy) return;
    aiInquiryBusy = true;
    setAiStatus(els.aiInquiryStatus, "正在更新…", false);
    try {
      await window.ownerApi.updateAiInquiryStatus(id, status);
    } finally {
      aiInquiryBusy = false;
    }
    await loadAiInquiries();
  }

  function createAiReplyRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "owner_reply_" + window.crypto.randomUUID();
    }
    return "owner_reply_" + Date.now() + "_" +
      Math.random().toString(36).slice(2, 12);
  }

  async function sendAiInquiryReply(id, input, button) {
    if (aiInquiryBusy) return;
    var message = String(input && input.value || "").trim();
    if (!message) {
      setAiStatus(els.aiInquiryStatus, "請先輸入要傳送給客人的回覆", true);
      if (input) input.focus();
      return;
    }
    aiInquiryBusy = true;
    if (input) input.disabled = true;
    if (button) button.disabled = true;
    setAiStatus(els.aiInquiryStatus, "正在傳送 LINE 回覆…", false);
    try {
      await window.ownerApi.sendAiInquiryReply(
        id, message, createAiReplyRequestId()
      );
      setAiStatus(els.aiInquiryStatus, "回覆已傳送給客人", false);
    } finally {
      aiInquiryBusy = false;
      if (input) input.disabled = false;
      if (button) button.disabled = false;
    }
    await loadAiInquiries();
  }

  async function refreshAiCapability() {
    if (!state.ownerMembership || !state.ownerMembership.features ||
        state.ownerMembership.features.plan !== "flagship") {
      aiFeatureEnabled = false;
      applyAiCapabilityUi();
      return false;
    }
    if (!window.ownerApi || typeof window.ownerApi.getAiCapability !== "function") {
      aiFeatureEnabled = false;
      applyAiCapabilityUi();
      return false;
    }
    try {
      var result = await window.ownerApi.getAiCapability();
      aiFeatureEnabled = Boolean(result && result.enabled);
    } catch (ignore) {
      aiFeatureEnabled = false;
    }
    applyAiCapabilityUi();
    if (aiFeatureEnabled) {
      await loadAiInquiries();
    }
    return aiFeatureEnabled;
  }

  function applyOwnerPlanTheme(plan) {
    var advanced = plan === "flagship";
    document.body.classList.toggle("owner-theme-beige", !advanced);
    document.body.classList.toggle("owner-theme-mauve", advanced);
  }

  async function handleAiSummaryGenerate() {
    if (!aiFeatureEnabled) {
      setAiStatus(els.aiSummaryStatus, "AI 功能尚未啟用", true);
      return;
    }
    if (aiSummaryBusy) return;
    var date = String(
      (els.aiSummaryDate && els.aiSummaryDate.value) || state.selectedDate || ""
    ).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setAiStatus(els.aiSummaryStatus, "請先選擇有效日期", true);
      return;
    }
    aiSummaryBusy = true;
    if (els.aiSummaryGenerate) els.aiSummaryGenerate.disabled = true;
    if (els.aiSummaryCopy) els.aiSummaryCopy.disabled = true;
    if (els.aiSummaryResult) els.aiSummaryResult.value = "";
    setAiStatus(els.aiSummaryStatus, "產生中…", false);
    try {
      var result = await window.ownerApi.generateAiDailySummary(date);
      if (els.aiSummaryResult) {
        els.aiSummaryResult.value = (result && result.draft) || "";
      }
      setAiStatus(
        els.aiSummaryStatus,
        (result && result.disclaimer) ||
          "此為 AI 草稿，業主須自行審核；不會自動傳送或儲存。",
        false
      );
      if (els.aiSummaryCopy) {
        els.aiSummaryCopy.disabled = !String(
          (els.aiSummaryResult && els.aiSummaryResult.value) || ""
        ).trim();
      }
    } catch (error) {
      var message = (error && error.message) || "AI 產生失敗";
      setAiStatus(els.aiSummaryStatus, message, true);
      if (els.aiSummaryCopy) els.aiSummaryCopy.disabled = true;
    } finally {
      aiSummaryBusy = false;
      if (els.aiSummaryGenerate) els.aiSummaryGenerate.disabled = false;
    }
  }

  async function handleAiSummaryCopy() {
    try {
      await copyTextToClipboard(els.aiSummaryResult && els.aiSummaryResult.value);
      setAiStatus(els.aiSummaryStatus, "已複製到剪貼簿（請自行審核後使用）", false);
    } catch (error) {
      setAiStatus(els.aiSummaryStatus, (error && error.message) || "複製失敗", true);
    }
  }

  function openOwnerAiDraftModal(booking) {
    if (!aiFeatureEnabled) return;
    aiDraftModalState.bookingId = booking && booking.id ? String(booking.id) : "";
    // 業主畫面可顯示既有預約摘要；不把客戶身分送進 AI（後端固定「您好」）
    aiDraftModalState.summary =
      formatDateZh(booking && (booking.date || state.selectedDate)) + " " +
      String((booking && booking.time) || "") + " · " +
      String((booking && booking.serviceName) || "服務");
    if (els.ownerAiDraftSummary) {
      els.ownerAiDraftSummary.textContent = aiDraftModalState.summary;
    }
    if (els.ownerAiDraftType) els.ownerAiDraftType.value = "";
    if (els.ownerAiDraftResult) els.ownerAiDraftResult.value = "";
    if (els.ownerAiDraftCopy) els.ownerAiDraftCopy.disabled = true;
    setAiStatus(els.ownerAiDraftStatus, "", false);
    if (els.ownerAiDraftModal) els.ownerAiDraftModal.classList.remove("hidden");
  }

  function closeOwnerAiDraftModal() {
    aiDraftModalState.bookingId = "";
    aiDraftModalState.summary = "";
    if (els.ownerAiDraftModal) els.ownerAiDraftModal.classList.add("hidden");
    if (els.ownerAiDraftType) els.ownerAiDraftType.value = "";
    if (els.ownerAiDraftResult) els.ownerAiDraftResult.value = "";
    if (els.ownerAiDraftCopy) els.ownerAiDraftCopy.disabled = true;
    setAiStatus(els.ownerAiDraftStatus, "", false);
  }

  async function handleOwnerAiDraftGenerate() {
    if (!aiFeatureEnabled) {
      setAiStatus(els.ownerAiDraftStatus, "AI 功能尚未啟用", true);
      return;
    }
    if (aiDraftBusy) return;
    var bookingId = String(aiDraftModalState.bookingId || "").trim();
    var draftType = String(
      (els.ownerAiDraftType && els.ownerAiDraftType.value) || ""
    ).trim();
    if (!bookingId) {
      setAiStatus(els.ownerAiDraftStatus, "找不到預約", true);
      return;
    }
    if (!draftType) {
      setAiStatus(els.ownerAiDraftStatus, "請選擇草稿類型", true);
      return;
    }
    aiDraftBusy = true;
    if (els.ownerAiDraftGenerate) els.ownerAiDraftGenerate.disabled = true;
    if (els.ownerAiDraftCopy) els.ownerAiDraftCopy.disabled = true;
    if (els.ownerAiDraftResult) els.ownerAiDraftResult.value = "";
    setAiStatus(els.ownerAiDraftStatus, "產生中…", false);
    try {
      var result = await window.ownerApi.generateAiMessageDraft(bookingId, draftType);
      if (els.ownerAiDraftResult) {
        els.ownerAiDraftResult.value = (result && result.draft) || "";
      }
      setAiStatus(
        els.ownerAiDraftStatus,
        (result && result.disclaimer) ||
          "此為 AI 草稿，業主須自行審核；不會自動傳送或儲存。",
        false
      );
      if (els.ownerAiDraftCopy) {
        els.ownerAiDraftCopy.disabled = !String(
          (els.ownerAiDraftResult && els.ownerAiDraftResult.value) || ""
        ).trim();
      }
    } catch (error) {
      setAiStatus(
        els.ownerAiDraftStatus,
        (error && error.message) || "AI 產生失敗",
        true
      );
      if (els.ownerAiDraftCopy) els.ownerAiDraftCopy.disabled = true;
    } finally {
      aiDraftBusy = false;
      if (els.ownerAiDraftGenerate) els.ownerAiDraftGenerate.disabled = false;
      renderDayBookings();
    }
  }

  async function handleOwnerAiDraftCopy() {
    try {
      await copyTextToClipboard(
        els.ownerAiDraftResult && els.ownerAiDraftResult.value
      );
      setAiStatus(
        els.ownerAiDraftStatus,
        "已複製到剪貼簿（請自行審核後使用）",
        false
      );
    } catch (error) {
      setAiStatus(
        els.ownerAiDraftStatus,
        (error && error.message) || "複製失敗",
        true
      );
    }
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
          '<p class="field-hint">新客評估：' + escapeHtml(assessmentTypeLabel(s.assessmentTemplateCode)) + '</p>' +
          '<p class="field-hint">回訪提醒：' + (Number(s.followUpDays) > 0
            ? '完成後 ' + Number(s.followUpDays) + ' 天' : '關閉') + '</p>' +
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

  function assessmentTypeLabel(code) {
    return ({
      none: "不需要評估",
      brow_new_client: "霧眉新客評估",
      lip_blush_new_client: "霧唇新客評估",
      eyeliner_new_client: "眼線／美瞳線新客評估",
      under_eye_new_client: "光影臥蠶新客評估",
      brow_lightening_new_client: "舊眉輕色管理｜新客評估",
      lip_lightening_new_client: "舊唇輕色管理｜新客評估"
    })[String(code || "none")] || "未設定";
  }

  function serviceCategorySkipsAssessment(name) {
    return /美甲|美睫|睫毛/.test(String(name || ""));
  }

  function syncServiceAssessmentAvailability() {
    if (!els.svcAssessmentGroup || !els.svcAssessmentType) return;
    var isFlagship = Boolean(state.ownerMembership && state.ownerMembership.features &&
      state.ownerMembership.features.plan === "flagship");
    var skipped = serviceCategorySkipsAssessment(els.svcName && els.svcName.value);
    if (skipped) els.svcAssessmentType.value = "none";
    els.svcAssessmentGroup.hidden = !isFlagship || skipped;
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
          '<label class="slot-time-cell"><span class="visually-hidden">開始時間</span>' +
            '<input type="time" class="slot-start" value="' + escapeHtml(slot.startTime || "10:00") + '">' +
          '</label>' +
          '<label class="slot-time-cell"><span class="visually-hidden">結束時間</span>' +
            '<input type="time" class="slot-end" value="' + escapeHtml(slot.endTime || "18:00") + '">' +
          '</label>' +
          '<button type="button" class="btn btn-small slot-remove">刪</button>' +
        '</div>'
      );
    }).join("") + '<button type="button" class="btn btn-small" id="add-slot-row">＋ 新增時段</button>';

    container.querySelectorAll(".slot-remove").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".slot-row");
        row.parentNode.removeChild(row);
        setSlotsDirty(true);
      });
    });

    container.querySelectorAll(".slot-weekday, .slot-start, .slot-end").forEach(function (field) {
      field.addEventListener("change", function () { setSlotsDirty(true); });
      field.addEventListener("input", function () { setSlotsDirty(true); });
    });

    $("add-slot-row").addEventListener("click", function () {
      state.slots = collectSlotsFromEditor();
      state.slots.push({ weekday: "一", startTime: "10:00", endTime: "18:00" });
      renderSlotEditor();
      setSlotsDirty(true);
    });
  }

  function syncSaveSlotsButton() {
    if (!els.saveSlots) return;
    els.saveSlots.disabled = slotSaveBusy || !state.slotsDirty;
    els.saveSlots.textContent = slotSaveBusy ? "儲存中…" : "儲存營業時段";
  }

  function setSlotsDirty(dirty) {
    state.slotsDirty = Boolean(dirty);
    syncSaveSlotsButton();
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
    if (els.nextMonthBookingOpenDay) {
      els.nextMonthBookingOpenDay.value = s.nextMonthBookingOpenDay != null
        ? String(s.nextMonthBookingOpenDay) : "15";
    }
    if (els.arrivalReminderMinutes) {
      els.arrivalReminderMinutes.value = s.arrivalReminderMinutes != null
        ? String(s.arrivalReminderMinutes)
        : "5";
    }
    if (els.tomorrowReminderTime) {
      els.tomorrowReminderTime.value = s.tomorrowReminderTimeUsesPlatformDefault
        ? "" : (s.tomorrowReminderTime || "");
    }
    if (els.tomorrowReminderMessage) {
      els.tomorrowReminderMessage.value = s.tomorrowReminderMessageUsesPlatformDefault
        ? "" : (s.tomorrowReminderMessage || "");
    }
    if (els.tomorrowReminderTimeDefaultNote) {
      els.tomorrowReminderTimeDefaultNote.textContent = s.tomorrowReminderTimeUsesPlatformDefault
        ? "可依工作室需求調整；目前留白並沿用平台預設 12:20。"
        : "目前使用工作室自行設定的通知時間；清空後儲存可恢復平台預設。";
    }
    if (els.tomorrowReminderMessageDefaultNote) {
      els.tomorrowReminderMessageDefaultNote.textContent = s.tomorrowReminderMessageUsesPlatformDefault
        ? "可依工作室需求調整；目前留白並沿用平台提供的親切提醒內容。"
        : "目前使用工作室自行設定的內容；清空後儲存可恢復平台預設。";
    }
    els.depositEnabled.checked = Boolean(s.depositEnabled);
    els.depositAmount.value = s.depositAmount != null && s.depositAmount !== "" ? s.depositAmount : "";
    els.bankName.value = s.bankName || "";
    els.bankCode.value = s.bankCode || "";
    els.bankAccount.value = s.bankAccount || "";
    els.bankAccountName.value = s.bankAccountName || "";
    els.depositNote.value = s.depositNote || "";
    els.customerBookingUrl.value = s.customerBookingUrl || "";
    if (els.customerAiEnabled) {
      els.customerAiEnabled.checked = s.customerAiEnabled !== false;
      els.customerAiTone.value = s.customerAiTone || "friendly";
      els.customerAiBusinessType.value = s.customerAiBusinessType || "";
      els.customerAiStudioIntro.value = s.customerAiStudioIntro || "";
      els.customerAiKnowledge.value = s.customerAiKnowledge || "";
      els.customerAiAnswerScope.value = s.customerAiAnswerScope || "";
      els.customerAiHandoffRule.value = s.customerAiHandoffRule || "";
      var isFlagship = Boolean(state.ownerMembership &&
        state.ownerMembership.features &&
        state.ownerMembership.features.plan === "flagship");
      els.customerAiSettings.hidden = !isFlagship;
      if (els.assessmentTemplateSettings) {
        els.assessmentTemplateSettings.hidden = !isFlagship;
        if (!isFlagship) collapseAssessmentTemplates();
      }
      if (els.svcAssessmentGroup) els.svcAssessmentGroup.hidden = !isFlagship;
      updateCustomerAiFieldsState();
    }
    updateDepositFieldsState();
  }

  function updateCustomerAiFieldsState() {
    if (!els.customerAiEnabled) return;
    var on = els.customerAiEnabled.checked;
    [
      els.customerAiTone,
      els.customerAiBusinessType,
      els.customerAiStudioIntro,
      els.customerAiKnowledge,
      els.customerAiAnswerScope,
      els.customerAiHandoffRule
    ].forEach(function (input) {
      if (input) input.disabled = !on;
    });
    if (els.customerAiFields) els.customerAiFields.style.opacity = on ? "1" : "0.55";
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
    els.svcFollowUpDays.value = "21";
    els.svcAssessmentType.value = "none";
    els.svcSort.value = "0";
    els.svcSubmit.textContent = "新增服務";
    syncServiceAssessmentAvailability();
  }

  function startEditService(id) {
    var svc = state.services.find(function (s) { return s.id === id; });
    if (!svc) return;
    state.editingServiceId = id;
    els.svcName.value = svc.name;
    els.svcDuration.value = svc.durationMinutes;
    els.svcPrice.value = svc.price || "";
    els.svcDesc.value = svc.description || "";
    els.svcFollowUpDays.value = svc.followUpDays != null ? String(svc.followUpDays) : "21";
    els.svcAssessmentType.value = svc.assessmentTemplateCode || "none";
    els.svcSort.value = svc.sortOrder || 0;
    els.svcSubmit.textContent = "儲存修改";
    syncServiceAssessmentAvailability();
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
    setSlotsDirty(false);
    if (!els.closedDateMonth.value) els.closedDateMonth.value = getCurrentMonthIso();
    await loadClosedDates();
  }

  function renderClosedDates() {
    if (!state.closedDates.length) {
      els.closedDateList.innerHTML = "此月份尚未設定整日休假";
      return;
    }
    els.closedDateList.innerHTML = state.closedDates.map(function (date) {
      return '<div class="card closed-date-row"><strong class="closed-date-label">' +
        escapeHtml(formatDateZh(date)) + '｜整日不開放</strong>' +
        '<button type="button" class="btn btn-small closed-date-reopen" data-reopen-date="' +
        escapeHtml(date) + '">恢復開放</button></div>';
    }).join("");
    els.closedDateList.querySelectorAll("[data-reopen-date]").forEach(function (button) {
      button.addEventListener("click", function () {
        updateClosedDate(button.getAttribute("data-reopen-date"), false);
      });
    });
  }

  async function loadClosedDates() {
    var month = els.closedDateMonth.value || getCurrentMonthIso();
    var result = await window.ownerApi.getClosedDates(month);
    state.closedDates = Array.isArray(result.dates) ? result.dates : [];
    renderClosedDates();
  }

  async function updateClosedDate(date, closed) {
    if (!date) {
      setStatus("error", "請先選擇日期");
      return;
    }
    if (closed && !await confirmOwnerAction(
      "確定將 " + formatDateZh(date) + " 設為整日不開放嗎？既有預約不會自動取消。",
      { title: "確認整日休假", confirmLabel: "設為休假" }
    )) return;
    setStatus("info", closed ? "設定休假日期中…" : "恢復日期開放中…");
    try {
      await window.ownerApi.setDateClosed(date, closed);
      els.closedDateMonth.value = date.slice(0, 7);
      if (closed) els.closedDateInput.value = "";
      await loadClosedDates();
      setStatus("success", closed ? "已設為整日不開放" : "已恢復依每週營業時段開放");
    } catch (error) {
      setStatus("error", error.message);
    }
  }

  async function loadSettings() {
    state.settings = await window.ownerApi.getSettings(state.user.userId);
    fillSettingsForm();
    var appTitle = window.BEAUTY_CONFIG && window.BEAUTY_CONFIG.APP_TITLE;
    if (appTitle) {
      els.brand.textContent = appTitle;
      document.title = appTitle;
    } else if (state.settings.brandName) {
      els.brand.textContent = state.settings.brandName + " · 管理";
      document.title = state.settings.brandName + "｜業主管理";
    }
  }

  async function initializeOwnerTenant() {
    if (!window.ownerApi ||
        typeof window.ownerApi.getHubSession !== "function" ||
        typeof window.ownerApi.setOwnerTenant !== "function") {
      return null;
    }
    var requestedTenantId = new URLSearchParams(window.location.search).get("tenant") || "";
    if (requestedTenantId) window.ownerApi.setOwnerTenant(requestedTenantId);
    var session = await window.ownerApi.getHubSession();
    if (session.selected && session.selected.tenantId) {
      window.ownerApi.setOwnerTenant(session.selected.tenantId);
      if (typeof window.beautyOwnerClearRequestedTenant === "function") {
        window.beautyOwnerClearRequestedTenant();
      }
      return session.selected;
    }
    var memberships = Array.isArray(session.memberships)
      ? session.memberships : [];
    if (!session.requiresSelection || memberships.length < 2) {
      throw new Error("無法確認業主所屬工作室");
    }

    els.ownerTenantOptions.innerHTML = memberships.map(function (membership) {
      var planLabel = membership.features && membership.features.plan === "flagship"
        ? "旗艦版" : "標準版";
      return '<button type="button" class="btn btn-secondary owner-tenant-option" ' +
        'data-tenant-id="' + escapeHtml(membership.tenantId || "") + '">' +
        '<span class="owner-tenant-option-main">' +
          '<strong>' + escapeHtml(membership.tenantName || "工作室") + '</strong>' +
          '<span class="owner-tenant-plan">' + escapeHtml(planLabel) + '</span>' +
        '</span>' +
        (membership.staffName
          ? '<span class="owner-tenant-staff">負責人：' +
            escapeHtml(membership.staffName) + "</span>"
          : "") +
        "</button>";
    }).join("");
    els.ownerTenantSelector.hidden = false;

    return new Promise(function (resolve, reject) {
      async function chooseTenant(event) {
        var button = event.target.closest(".owner-tenant-option");
        if (!button || button.disabled) return;
        var tenantId = String(button.getAttribute("data-tenant-id") || "");
        if (!memberships.some(function (item) {
          return item.tenantId === tenantId;
        })) {
          reject(new Error("無法選擇未授權的工作室"));
          return;
        }
        els.ownerTenantOptions.querySelectorAll("button").forEach(function (item) {
          item.disabled = true;
        });
        try {
          window.ownerApi.setOwnerTenant(tenantId);
          var verified = await window.ownerApi.getHubSession();
          if (!verified.selected || verified.selected.tenantId !== tenantId) {
            throw new Error("工作室權限驗證失敗");
          }
          els.ownerTenantSelector.hidden = true;
          els.ownerTenantOptions.removeEventListener("click", chooseTenant);
          resolve(verified.selected);
        } catch (error) {
          window.ownerApi.setOwnerTenant("");
          els.ownerTenantOptions.querySelectorAll("button").forEach(function (item) {
            item.disabled = false;
          });
          reject(error);
        }
      }
      els.ownerTenantOptions.addEventListener("click", chooseTenant);
    });
  }

  async function handleServiceSubmit() {
    var data = {
      name: els.svcName.value.trim(),
      durationMinutes: Number(els.svcDuration.value) || 60,
      price: els.svcPrice.value ? Number(els.svcPrice.value) : null,
      description: els.svcDesc.value.trim(),
      followUpDays: Number(els.svcFollowUpDays.value),
      assessmentTemplateCode: window.BEAUTY_CONFIG && window.BEAUTY_CONFIG.PRODUCT_TIER === "ai" &&
        !serviceCategorySkipsAssessment(els.svcName.value)
        ? els.svcAssessmentType.value : "none",
      sortOrder: Number(els.svcSort.value) || 0,
      status: "上架"
    };
    if (!data.name) {
      setStatus("error", "請填寫服務名稱");
      return;
    }
    if (!Number.isInteger(data.followUpDays) || data.followUpDays < 0 || data.followUpDays > 365) {
      setStatus("error", "回訪提醒天數須為 0～365 的整數");
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
    if (slotSaveBusy || !state.slotsDirty) return;
    var slots = collectSlotsFromEditor();
    var savedSnapshot = JSON.stringify(slots);
    slotSaveBusy = true;
    syncSaveSlotsButton();
    setStatus("info", "儲存營業時段中…");
    try {
      await window.ownerApi.saveSlots(state.user.userId, slots);
      state.slots = slots;
      setSlotsDirty(JSON.stringify(collectSlotsFromEditor()) !== savedSnapshot);
      setStatus("success", "營業時段已更新");
    } catch (error) {
      setSlotsDirty(true);
      setStatus("error", error.message);
    } finally {
      slotSaveBusy = false;
      syncSaveSlotsButton();
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

  function parseArrivalReminderMinutes(raw) {
    var text = String(raw == null ? "" : raw).trim();
    var n = Number(text);
    if (text === "" || !Number.isInteger(n) || n < 0 || n > 60) {
      throw new Error("「服務前建議抵達時間」須為 0～60 的整數分鐘");
    }
    return n;
  }

  async function handleSaveSettings() {
    var depositEnabled = els.depositEnabled.checked;
    var payload = {
      primaryColor: els.primaryColor.value.trim(),
      announcement: els.announcement.value.trim(),
      cancelPolicy: els.cancelPolicy.value.trim(),
      depositEnabled: depositEnabled,
      depositAmount: els.depositAmount.value === "" ? null : Number(els.depositAmount.value),
      bankName: els.bankName.value.trim(),
      bankCode: els.bankCode.value.trim(),
      bankAccount: els.bankAccount.value.trim(),
      bankAccountName: els.bankAccountName.value.trim(),
      depositNote: els.depositNote.value.trim(),
      customerBookingUrl: els.customerBookingUrl.value.trim(),
      customerAiEnabled: els.customerAiEnabled ? els.customerAiEnabled.checked : true,
      customerAiTone: els.customerAiTone ? els.customerAiTone.value : "friendly",
      customerAiBusinessType: els.customerAiBusinessType
        ? els.customerAiBusinessType.value.trim() : "",
      customerAiStudioIntro: els.customerAiStudioIntro
        ? els.customerAiStudioIntro.value.trim() : "",
      customerAiKnowledge: els.customerAiKnowledge
        ? els.customerAiKnowledge.value.trim() : "",
      customerAiAnswerScope: els.customerAiAnswerScope
        ? els.customerAiAnswerScope.value.trim() : "",
      customerAiHandoffRule: els.customerAiHandoffRule
        ? els.customerAiHandoffRule.value.trim() : ""
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
      payload.nextMonthBookingOpenDay = Number(
        els.nextMonthBookingOpenDay ? els.nextMonthBookingOpenDay.value : "15"
      );
      if (!Number.isInteger(payload.nextMonthBookingOpenDay) ||
          payload.nextMonthBookingOpenDay < 1 || payload.nextMonthBookingOpenDay > 28) {
        throw new Error("下個月預約開放日須為 1～28 的整數");
      }
      payload.arrivalReminderMinutes = parseArrivalReminderMinutes(
        els.arrivalReminderMinutes ? els.arrivalReminderMinutes.value : ""
      );
      var reminderTime = String(els.tomorrowReminderTime.value || "").trim();
      if (reminderTime && (!/^(?:[01]\d|2[0-3]):(?:[0-5]\d)$/.test(reminderTime) ||
          Number(reminderTime.slice(3)) % 5 !== 0)) {
        throw new Error("明日預約提醒時間須為 5 分鐘刻度");
      }
      var reminderMessage = String(els.tomorrowReminderMessage.value || "").trim();
      payload.tomorrowReminderTime = reminderTime;
      payload.tomorrowReminderMessage = reminderMessage;
    } catch (validationError) {
      setStatus("error", validationError.message);
      return;
    }

    if (depositEnabled) {
      if (!payload.bankAccount) {
        setStatus("error", "開啟訂金時請填寫轉帳帳號");
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
      collapseAssessmentTemplates();
      setStatus("success", "店面設定已更新");
    } catch (error) {
      var message = (error && error.message) ? error.message : "儲存設定失敗，請稍後再試";
      if (/儲存失敗|伺服器回應錯誤|Failed to fetch|NetworkError/i.test(message)) {
        message = "儲存設定失敗：" + message + "。請確認已填寫必填訂金欄位（金額、帳號），或稍後再試。";
      }
      setStatus("error", message);
    } finally {
      if (els.saveSettings) {
        els.saveSettings._savingInProgress = false;
        els.saveSettings.disabled = false;
      }
    }
  }

  function applyBrowAiPreset() {
    if (els.customerAiEnabled) els.customerAiEnabled.checked = true;
    if (els.customerAiBusinessType) els.customerAiBusinessType.value = "霧眉師";
    if (els.customerAiTone) els.customerAiTone.value = "concise";
    if (els.customerAiAnswerScope) {
      els.customerAiAnswerScope.value =
        "只回答工作室知識庫已有的價格、作品、補色、流程、維持時間、注意事項、付款方式與地址。";
    }
    if (els.customerAiHandoffRule) {
      els.customerAiHandoffRule.value =
        "所有新客最終由霧眉師審核；健康、用藥、懷孕哺乳、舊眉、洗眉、近期療程、皮膚異常、不良反應、不確定或知識庫缺漏時轉人工。";
    }
    if (els.customerAiKnowledge && !els.customerAiKnowledge.value.trim()) {
      els.customerAiKnowledge.value =
        "新客評估一次只問一題。未經本人審核通過，不得開放時段、要求訂金或表示預約成立；不得診斷、判定適合施作、建議停藥或保證效果。";
    }
    setStatus("success", "已套用霧眉新客評估規範，請確認內容後儲存設定。");
  }

  function applyLipAiPreset() {
    if (els.customerAiEnabled) els.customerAiEnabled.checked = true;
    if (els.customerAiBusinessType) els.customerAiBusinessType.value = "霧唇師";
    if (els.customerAiTone) els.customerAiTone.value = "concise";
    if (els.customerAiAnswerScope) {
      els.customerAiAnswerScope.value =
        "只回答工作室知識庫已有的價格、作品、補色、流程、維持時間、注意事項、付款方式與地址。";
    }
    if (els.customerAiHandoffRule) {
      els.customerAiHandoffRule.value =
        "所有新客最終由霧唇師審核；健康、用藥、懷孕哺乳、原生唇色、舊唇色、改色、近期唇部療程、唇部異常、不良反應、不確定或知識庫缺漏時轉人工。";
    }
    if (els.customerAiKnowledge && !els.customerAiKnowledge.value.trim()) {
      els.customerAiKnowledge.value =
        "新客評估一次只問一題。未經本人審核通過，不得開放時段、要求訂金或表示預約成立；不得診斷、判定適合施作、建議停藥、承諾改色結果或保證效果。";
    }
    setStatus("success", "已套用霧唇新客評估規範，請確認內容後儲存設定。");
  }

  function applyAllRoundAiPreset() {
    if (els.customerAiEnabled) els.customerAiEnabled.checked = true;
    if (els.customerAiBusinessType) els.customerAiBusinessType.value = "全方位紋繡師";
    if (els.customerAiTone) els.customerAiTone.value = "concise";
    if (els.customerAiAnswerScope) {
      els.customerAiAnswerScope.value =
        "只回答工作室知識庫已有的霧眉、霧唇及其他紋繡服務、價格、作品、補色、流程、維持時間、注意事項、付款方式與地址。";
    }
    if (els.customerAiHandoffRule) {
      els.customerAiHandoffRule.value =
        "所有新客最終由全方位紋繡師審核；必須先確認客人詢問的施作部位。健康、用藥、懷孕哺乳、舊色、改色或輕色、近期療程、施作部位異常、不良反應、不確定或知識庫缺漏時轉人工。";
    }
    if (els.customerAiKnowledge && !els.customerAiKnowledge.value.trim()) {
      els.customerAiKnowledge.value =
        "新客評估一次只問一題，並依客人選擇的霧眉、霧唇或其他紋繡服務使用相符問題。未經本人審核通過，不得開放時段、要求訂金或表示預約成立；不得診斷、判定適合施作、建議停藥、承諾改色結果或保證效果。";
    }
    setStatus("success", "已套用全方位紋繡新客評估規範，請確認內容後儲存設定。");
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
          (c.previousService
            ? '<p class="customer-meta">曾做服務：' + escapeHtml(c.previousService) +
              (c.previousServiceDate ? "（" + escapeHtml(formatDateZh(c.previousServiceDate)) + "）" : "") + "</p>"
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
        : "") +
      (detail.previousService
        ? '<p class="customer-meta">曾做服務：' + escapeHtml(detail.previousService) +
          (detail.previousServiceDate ? "（" + escapeHtml(formatDateZh(detail.previousServiceDate)) + "）" : "") + "</p>"
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
      var cardClass = "card booking-card " + ownerBookingCardClass(b);
      var statusClass = ownerBookingStatusClass(b);
      var reasonLine = isCancelled && b.cancelReason
        ? '<p class="booking-cancel-reason">取消原因：' + escapeHtml(b.cancelReason) + "</p>"
        : "";
      var depositStatus = ownerDepositStatusHtml(b);
      return (
        '<div class="' + cardClass + '">' +
          '<div class="booking-card-head">' +
            '<span class="booking-time">' + escapeHtml(formatDateZh(b.date)) + " " + escapeHtml(b.time || "") + "</span>" +
            '<span class="' + statusClass + '">' + escapeHtml(ownerBookingStatusLabel(b)) + "</span>" +
          "</div>" +
          '<h3 class="booking-service">' + escapeHtml(b.serviceName || "服務") + "</h3>" +
          depositStatus +
          reasonLine +
        "</div>"
      );
    }).join("");
  }

  var CUSTOMER_NOTE_MAX_LENGTH = 2000;
  var customerEditBaseline = "";

  function customerEditSnapshot() {
    if (!els.customerEditName) return "";
    return JSON.stringify({
      customerName: els.customerEditName.value.trim(),
      phone: els.customerEditPhone.value.trim(),
      birthday: els.customerEditBirthday.value.trim(),
      note: els.customerEditNote ? els.customerEditNote.value.trim() : ""
    });
  }

  function updateCustomerEditDirtyState() {
    if (!els.customerEditSave) return;
    els.customerEditSave.disabled = !customerEditBaseline || customerEditSnapshot() === customerEditBaseline;
  }

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
    customerEditBaseline = customerEditSnapshot();
    updateCustomerEditDirtyState();
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
    var customerEntryKey = String(
      state.settings && state.settings.customerEntryKey || config.STUDIO_ENTRY_KEY || ""
    ).trim().toLowerCase();
    if (!config.CLAIM_ENABLED || !/^[a-f0-9]{64}$/.test(customerEntryKey)) {
      return null;
    }
    var customerLiffUrl = String(config.CUSTOMER_LIFF_URL || "").replace(/\/$/, "");
    var encodedKey = encodeURIComponent(customerEntryKey);
    return customerLiffUrl + "/studio/" + encodedKey + "/?studio_entry=" + encodedKey;
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
      var ok = await confirmOwnerAction(
        "確定要重新產生邀請連結嗎？\n" +
        "舊的邀請連結與 QR Code 會立即失效，客戶必須改用新連結。",
        { title: "確認重新產生邀請", confirmLabel: "產生新邀請", danger: true }
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
    if (!await confirmOwnerAction(
      "確定要撤銷邀請嗎？已發出的連結與 QR Code 將立即失效。",
      { title: "確認撤銷邀請", confirmLabel: "確認撤銷", danger: true }
    )) {
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
    album: [],
    albumBlobs: {},
    objectUrls: [],
    busy: false
  };

  var photoLightboxState = {
    objectUrl: null,
    savedBodyOverflow: "",
    zoom: 1
  };

  function applyPhotoLightboxZoom(nextZoom) {
    photoLightboxState.zoom = Math.max(1, Math.min(4, Number(nextZoom) || 1));
    if (els.photoLightboxImg) {
      els.photoLightboxImg.style.width = photoLightboxState.zoom > 1
        ? (photoLightboxState.zoom * 100) + "%" : "";
      els.photoLightboxImg.style.maxWidth = photoLightboxState.zoom > 1 ? "none" : "100%";
      els.photoLightboxImg.style.maxHeight = photoLightboxState.zoom > 1 ? "none" : "calc(100dvh - 72px)";
      els.photoLightboxImg.style.cursor = photoLightboxState.zoom > 1 ? "zoom-out" : "zoom-in";
    }
    if (els.photoLightboxZoomReset) {
      els.photoLightboxZoomReset.textContent = Math.round(photoLightboxState.zoom * 100) + "%";
    }
  }

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
    applyPhotoLightboxZoom(1);
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

  function openAssessmentPhotoLightbox(sessionId, photoId, title) {
    if (!sessionId || !photoId || !els.photoLightbox) return;
    closePhotoLightbox();
    els.photoLightboxTitle.textContent = (title || "評估照片") + "（可放大細看）";
    els.photoLightbox.classList.remove("hidden");
    photoLightboxState.savedBodyOverflow = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";
    window.ownerApi.fetchAssessmentPhoto(sessionId, photoId)
      .then(function (response) { return response.blob(); })
      .then(function (blob) {
        if (els.photoLightbox.classList.contains("hidden")) return;
        var objectUrl = window.URL.createObjectURL(blob);
        photoLightboxState.objectUrl = objectUrl;
        els.photoLightboxImg.src = objectUrl;
        els.photoLightboxImg.alt = title || "客戶評估照片";
        els.photoLightboxImg.hidden = false;
        els.photoLightboxStatus.hidden = true;
      }).catch(function (error) {
        els.photoLightboxStatus.hidden = false;
        els.photoLightboxStatus.textContent = "照片載入失敗，請稍後再試";
        setAiStatus(els.browIntakeStatus, error.message || "照片載入失敗", true);
      });
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
    photoState.album = [];
    photoState.albumBlobs = {};
    photoState.busy = false;
    if (els.photoSetList) {
      els.photoSetList.innerHTML = "";
    }
    if (els.customerAlbumList) els.customerAlbumList.innerHTML = "";
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

  function renderCustomerAlbum() {
    if (!els.customerAlbumList) return;
    if (!photoState.album.length) {
      els.customerAlbumList.innerHTML = '<div class="empty">此客戶尚無照片</div>';
      return;
    }
    els.customerAlbumList.innerHTML = '<div class="customer-album-grid">' + photoState.album.map(function (photo) {
      var date = String(photo.capturedAt || photo.createdAt || "").slice(0, 10);
      return '<button type="button" class="customer-album-item" data-album-path="' +
        escapeHtml(photo.contentPath) + '" data-album-title="' + escapeHtml(photo.label || "照片") + '">' +
        '<span class="customer-album-media"><span class="customer-album-loading">照片載入中</span>' +
        '<img data-album-img="' + escapeHtml(photo.contentPath) + '" alt="' + escapeHtml(photo.label || "客戶照片") + '" hidden></span>' +
        '<span class="customer-album-copy"><strong>' + escapeHtml(photo.label || "照片") + '</strong>' +
        '<small>' + escapeHtml(photo.title || "") + (date ? "・" + escapeHtml(date) : "") + '</small></span></button>';
    }).join("") + "</div>";
    els.customerAlbumList.querySelectorAll("[data-album-img]").forEach(function (img) {
      window.ownerApi.fetchCustomerAlbumPhoto(img.getAttribute("data-album-img")).then(function (blob) {
        var path = img.getAttribute("data-album-img");
        photoState.albumBlobs[path] = blob;
        var objectUrl = window.URL.createObjectURL(blob); photoState.objectUrls.push(objectUrl); img.src = objectUrl;
        var reveal = function () {
          img.hidden = false; img.classList.add("is-loaded");
          var loading = img.parentNode && img.parentNode.querySelector(".customer-album-loading");
          if (loading) loading.hidden = true;
        };
        if (typeof img.decode === "function") img.decode().then(reveal).catch(reveal);
        else img.addEventListener("load", reveal, { once: true });
      }).catch(function () {
        var loading = img.parentNode && img.parentNode.querySelector(".customer-album-loading");
        if (loading) loading.textContent = "照片載入失敗";
      });
    });
    els.customerAlbumList.querySelectorAll("[data-album-path]").forEach(function (button) {
      button.addEventListener("click", function () {
        openAlbumLightbox(button.getAttribute("data-album-path"), button.getAttribute("data-album-title"));
      });
    });
  }

  function openAlbumLightbox(contentPath, title) {
    if (!els.photoLightbox) return;
    closePhotoLightbox();
    els.photoLightboxTitle.textContent = title || "客戶照片";
    els.photoLightbox.classList.remove("hidden");
    photoLightboxState.savedBodyOverflow = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";
    var cachedBlob = photoState.albumBlobs[contentPath];
    var blobPromise = cachedBlob
      ? Promise.resolve(cachedBlob)
      : window.ownerApi.fetchCustomerAlbumPhoto(contentPath);
    blobPromise.then(function (blob) {
      photoState.albumBlobs[contentPath] = blob;
      var objectUrl = window.URL.createObjectURL(blob); photoLightboxState.objectUrl = objectUrl;
      els.photoLightboxImg.src = objectUrl;
      var reveal = function () {
        els.photoLightboxImg.hidden = false; els.photoLightboxStatus.hidden = true;
      };
      if (typeof els.photoLightboxImg.decode === "function") {
        els.photoLightboxImg.decode().then(reveal).catch(reveal);
      } else els.photoLightboxImg.addEventListener("load", reveal, { once: true });
    }).catch(function () { els.photoLightboxStatus.textContent = "照片載入失敗，請稍後再試"; });
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
      revokePhotoObjectUrls();
      var responses = await Promise.all([
        window.ownerApi.listPhotoSets(photoState.customerId),
        typeof window.ownerApi.listCustomerAlbum === "function"
          ? window.ownerApi.listCustomerAlbum(photoState.customerId)
          : Promise.resolve({ photos: [] })
      ]);
      var result = responses[0];
      photoState.sets = (result && result.photoSets) || [];
      photoState.album = (responses[1] && responses[1].photos) || [];
      renderCustomerAlbum();
      renderPhotoSets();
    } catch (error) {
      photoState.sets = [];
      photoState.album = [];
      photoState.albumBlobs = {};
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
    if (!await confirmOwnerAction(
      "確定要刪除這張照片嗎？刪除後無法復原。",
      { title: "確認刪除照片", confirmLabel: "確認刪除", danger: true }
    )) return;

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
    if (!await confirmOwnerAction(
      "確定要刪除整組前後對比照片嗎？組內照片會一併刪除，無法復原。",
      { title: "確認刪除照片組", confirmLabel: "全部刪除", danger: true }
    )) {
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
    els.customerEditSave.disabled = true;
    try {
      var updated = await window.ownerApi.updateCustomerById(detail.customerId, payload);
      state.selectedCustomer = Object.assign({}, detail, updated || {}, payload, {
        customerId: detail.customerId
      });
      renderCustomerDetailHeader(state.selectedCustomer);
      fillCustomerEditForm(state.selectedCustomer);
      setStatus("success", "客戶資料已更新");
      window.ownerApi.getCustomers(state.customerQuery).then(function (data) {
        state.customers = (data && data.customers) || [];
        renderCustomerList();
      }).catch(function () {
        // 詳情已成功儲存；名單背景刷新失敗不應讓業主誤以為儲存失敗。
      });
    } catch (error) {
      setStatus("error", error.message || "儲存客戶資料失敗，請稍後再試");
      updateCustomerEditDirtyState();
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
    { key: "customer_no", label: "會員／客戶編號" },
    { key: "previous_service", label: "曾做過的服務項目" },
    { key: "previous_service_date", label: "服務日期" }
  ];

  // 與後端 customer-import.js 的常見標頭別名一致，只用於預設帶入，
  // 實際對應仍以使用者選擇＋後端驗證為準
  var IMPORT_ALIASES = {
    name: ["name", "姓名", "名字", "客戶姓名"],
    phone: ["phone", "電話", "手機", "手機號碼", "聯絡電話"],
    birthday: ["birthday", "生日", "出生日期"],
    note: ["note", "備註", "特別事項", "客戶備註"],
    customer_no: ["customer_no", "客戶編號", "會員編號"],
    previous_service: ["previous_service", "曾做過的服務項目", "曾做服務", "過往服務"],
    previous_service_date: ["previous_service_date", "服務日期", "曾做服務日期", "過往服務日期"]
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
    previewSummary: null,
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
    importState.previewSummary = null;
    closeImportConfirmModal();
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
    if (els.importCloseBtn) {
      els.importCloseBtn.classList.add("hidden");
      els.importCloseBtn.hidden = true;
    }
    updateImportButtons();
  }

  function closeImportWindow() {
    if (els.customerImportCard) {
      els.customerImportCard.classList.add("hidden");
    }
    showCustomerListView();
    if (els.customerList && typeof els.customerList.scrollIntoView === "function") {
      els.customerList.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (typeof window.scrollTo === "function") {
      window.scrollTo(0, 0);
    }
    if (window.liff &&
        typeof window.liff.isInClient === "function" &&
        window.liff.isInClient() &&
        typeof window.liff.closeWindow === "function") {
      window.liff.closeWindow();
      return;
    }
    setStatus("success", "匯入已完成，已返回客戶名單。");
  }

  function handleCustomerImportTemplateDownload(event) {
    if (event) event.preventDefault();
    var templateUrl = new URL("/owner/customer-import-template-v2.csv?v=20260822002", window.location.origin).href;
    if (window.liff && typeof window.liff.isInClient === "function" &&
        window.liff.isInClient() && typeof window.liff.openWindow === "function") {
      window.liff.openWindow({ url: templateUrl, external: true });
      return;
    }
    var csvText = "\uFEFF姓名,電話,生日,備註,客戶編號,曾做過的服務項目,服務日期\r\n" +
      "王小美,0912-345-678,1990-05-20,對精油過敏,C0001,韓系霧眉,2025-08-08\r\n" +
      "陳小姐,0987-654-321,,,C0002,,\r\n";
    var blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    var objectUrl = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "客戶匯入範本.csv";
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
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
      if (preview.previousService) metaParts.push("曾做服務 " + preview.previousService);
      if (preview.previousServiceDate) metaParts.push("服務日期 " + preview.previousServiceDate);
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
      importState.previewSummary = (result && result.summary) || {};
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

  function closeImportConfirmModal() {
    if (els.importConfirmModal) {
      els.importConfirmModal.classList.add("hidden");
    }
  }

  function handleImportCommit() {
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
    var summary = importState.previewSummary || {};
    if (els.importConfirmCreateCount) {
      els.importConfirmCreateCount.textContent = String(Number(summary.willCreate || 0));
    }
    if (els.importConfirmExcludedCount) {
      els.importConfirmExcludedCount.textContent = String(
        Number(summary.skipped || 0) + Number(summary.conflicts || 0)
      );
    }
    if (els.importConfirmModal) {
      els.importConfirmModal.classList.remove("hidden");
    }
  }

  async function executeImportCommit() {
    if (importState.committing) return;
    closeImportConfirmModal();
    var collected = collectImportMapping();
    if (collected.error || !importState.canonicalHash || importState.previewErrors > 0) {
      setStatus("error", collected.error || "預覽已失效，請重新產生預覽");
      return;
    }
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
      if (els.importCloseBtn) {
        els.importCloseBtn.classList.remove("hidden");
        els.importCloseBtn.hidden = false;
      }
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
    if (tabName === "ai") {
      focusPendingAiInquiry();
      loadAiWorkQueue().catch(function (error) {
        setAiStatus(els.aiWorkQueueStatus, error.message || "無法載入待辦", true);
      });
      loadAiInquiries().then(function () {
        focusPendingAiInquiry();
      }).catch(function (error) {
        setAiStatus(els.aiInquiryStatus, error.message || "無法載入洽詢回報", true);
      });
      loadBrowIntakes().catch(function (error) {
        setAiStatus(els.browIntakeStatus, error.message || "無法載入評估案件", true);
      });
    }

    if (tabName === "customers") {
      showCustomerListView();
      loadCustomers(els.customerSearch ? els.customerSearch.value : "").catch(function (e) {
        setStatus("error", e.message);
      });
    }
  }

  function cacheElements() {
    els.status = $("status");
    els.ownerConfirmModal = $("owner-confirm-modal");
    els.ownerConfirmTitle = $("owner-confirm-title");
    els.ownerConfirmMessage = $("owner-confirm-message");
    els.ownerConfirmCancel = $("owner-confirm-cancel");
    els.ownerConfirmSubmit = $("owner-confirm-submit");
    els.pigmentReminderModal = $("pigment-reminder-modal");
    els.pigmentTouchupDate = $("pigment-touchup-date");
    els.pigmentMaintenanceDate = $("pigment-maintenance-date");
    els.pigmentReminderCancel = $("pigment-reminder-cancel");
    els.pigmentReminderSubmit = $("pigment-reminder-submit");
    els.ownerTenantSelector = $("owner-tenant-selector");
    els.ownerTenantOptions = $("owner-tenant-options");
    els.brand = $("brand");
    els.ownerSubscriptionCard = $("owner-subscription-card");
    els.ownerTrialBanner = $("owner-trial-banner");
    els.ownerSubscriptionStatus = $("owner-subscription-status");
    els.ownerTrialEndDate = $("owner-trial-end-date");
    els.ownerSubscriptionEndDate = $("owner-subscription-end-date");
    els.subscriptionReminderModal = $("subscription-reminder-modal");
    els.subscriptionReminderMessage = $("subscription-reminder-message");
    els.subscriptionReminderClose = $("subscription-reminder-close");
    els.todayList = $("today-list");
    els.calendarGrid = $("calendar-grid");
    els.calendarMonthLabel = $("calendar-month-label");
    els.bookingDateSummary = $("booking-date-summary");
    els.serviceList = $("service-list");
    els.slotEditor = $("slot-editor");
    els.saveSlots = $("save-slots");
    els.closedDateInput = $("closed-date-input");
    els.closedDateMonth = $("closed-date-month");
    els.closedDateList = $("closed-date-list");
    els.addClosedDate = $("add-closed-date");
    els.brandName = $("brand-name");
    els.primaryColor = $("primary-color");
    els.announcement = $("announcement");
    els.cancelPolicy = $("cancel-policy");
    els.bookingMinNoticeDays = $("booking-min-notice-days");
    els.cancellationMinNoticeDays = $("cancellation-min-notice-days");
    els.nextMonthBookingOpenDay = $("next-month-booking-open-day");
    els.arrivalReminderMinutes = $("arrival-reminder-minutes");
    els.tomorrowReminderTime = $("tomorrow-reminder-time");
    els.tomorrowReminderMessage = $("tomorrow-reminder-message");
    els.tomorrowReminderTimeDefaultNote = $("tomorrow-reminder-time-default-note");
    els.tomorrowReminderMessageDefaultNote = $("tomorrow-reminder-message-default-note");
    els.saveSettings = $("save-settings");
    els.depositEnabled = $("deposit-enabled");
    els.depositFields = $("deposit-fields");
    els.depositAmount = $("deposit-amount");
    els.bankName = $("bank-name");
    els.bankCode = $("bank-code");
    els.bankAccount = $("bank-account");
    els.bankAccountName = $("bank-account-name");
    els.depositNote = $("deposit-note");
    els.customerBookingUrl = $("customer-booking-url");
    els.customerAiSettings = $("customer-ai-settings");
    els.customerAiEnabled = $("customer-ai-enabled");
    els.customerAiFields = $("customer-ai-fields");
    els.customerAiTone = $("customer-ai-tone");
    els.customerAiBusinessType = $("customer-ai-business-type");
    els.applyBrowAiPreset = $("apply-brow-ai-preset");
    els.applyLipAiPreset = $("apply-lip-ai-preset");
    els.applyAllRoundAiPreset = $("apply-all-round-ai-preset");
    els.assessmentTemplateSettings = $("assessment-template-settings");
    els.assessmentTemplateList = $("assessment-template-list");
    els.assessmentTemplateStatus = $("assessment-template-status");
    els.assessmentTemplateRefresh = $("assessment-template-refresh");
    els.customerAiStudioIntro = $("customer-ai-studio-intro");
    els.customerAiKnowledge = $("customer-ai-knowledge");
    els.customerAiAnswerScope = $("customer-ai-answer-scope");
    els.customerAiHandoffRule = $("customer-ai-handoff-rule");
    els.ownerReviewModal = $("owner-review-modal");
    els.ownerReviewContent = $("owner-review-content");
    els.ownerReviewPhotoNote = $("owner-review-photo-note");
    els.ownerReviewPhotos = $("owner-review-photos");
    els.ownerReviewStatus = $("owner-review-status");
    els.ownerReviewDismiss = $("owner-review-dismiss");
    els.ownerReviewClearPhoto = $("owner-review-clear-photo");
    els.ownerReviewRequestPhoto = $("owner-review-request-photo");
    els.ownerReviewRequestSurgery = $("owner-review-request-surgery");
    els.ownerReviewRequestDisease = $("owner-review-request-disease");
    els.ownerReviewRequestLastTreatment = $("owner-review-request-last-treatment");
    els.ownerReviewQuestionNote = $("owner-review-question-note");
    els.ownerReviewRequestAnswers = $("owner-review-request-answers");
    els.ownerReviewAi = $("owner-review-ai");
    els.ownerReviewAiGenerate = $("owner-review-ai-generate");
    els.ownerReviewAiResult = $("owner-review-ai-result");
    if (els.ownerReviewAi) els.ownerReviewAi.hidden = !aiFeatureEnabled;
    els.svcName = $("svc-name");
    els.svcDuration = $("svc-duration");
    els.svcPrice = $("svc-price");
    els.svcDesc = $("svc-desc");
    els.svcFollowUpDays = $("svc-follow-up-days");
    els.svcAssessmentType = $("svc-assessment-type");
    els.svcAssessmentGroup = $("svc-assessment-group");
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
    els.aiPlanBlock = $("owner-ai-plan-block");
    els.aiGoBookings = $("ai-go-bookings");
    els.aiSummaryCard = $("ai-summary-card");
    els.aiSummaryDate = $("ai-summary-date");
    els.aiSummaryGenerate = $("ai-summary-generate");
    els.aiSummaryStatus = $("ai-summary-status");
    els.aiSummaryResult = $("ai-summary-result");
    els.aiSummaryCopy = $("ai-summary-copy");
    els.aiInquiryList = $("ai-inquiry-list");
    els.aiInquiryCount = $("ai-inquiry-count");
    els.aiInquiryStatus = $("ai-inquiry-status");
    els.aiInquiryRefresh = $("ai-inquiry-refresh");
    els.browIntakeList = $("brow-intake-list");
    els.browIntakeCount = $("brow-intake-count");
    els.browIntakeStatus = $("brow-intake-status");
    els.browIntakeRefresh = $("brow-intake-refresh");
    els.browReviewConfirmModal = $("brow-review-confirm-modal");
    els.browReviewConfirmSummary = $("brow-review-confirm-summary");
    els.browReviewMessageWrap = $("brow-review-message-wrap");
    els.browReviewMessage = $("brow-review-message");
    els.browReviewConfirmStatus = $("brow-review-confirm-status");
    els.browReviewConfirmCancel = $("brow-review-confirm-cancel");
    els.browReviewConfirmSubmit = $("brow-review-confirm-submit");
    els.aiUnreadBadge = $("ai-unread-badge");
    els.aiWorkQueueCounts = $("ai-work-queue-counts");
    els.aiWorkQueueSummary = $("ai-work-queue-summary");
    els.aiWorkQueueStatus = $("ai-work-queue-status");
    els.aiWorkQueueList = $("ai-work-queue-list");
    els.aiWorkQueueRefresh = $("ai-work-queue-refresh");
    els.ownerAiDraftModal = $("owner-ai-draft-modal");
    els.ownerAiDraftSummary = $("owner-ai-draft-summary");
    els.ownerAiDraftType = $("owner-ai-draft-type");
    els.ownerAiDraftGenerate = $("owner-ai-draft-generate");
    els.ownerAiDraftStatus = $("owner-ai-draft-status");
    els.ownerAiDraftResult = $("owner-ai-draft-result");
    els.ownerAiDraftDismiss = $("owner-ai-draft-dismiss");
    els.ownerAiDraftCopy = $("owner-ai-draft-copy");
    els.customerListView = $("customer-list-view");
    els.customerDetailView = $("customer-detail-view");
    els.customerSearch = $("customer-search");
    els.customerList = $("customer-list");
    els.customerImportCard = $("customer-import-card");
    els.customerImportUpgrade = $("customer-import-upgrade");
    els.customerImportTemplateDownload = $("customer-import-template-download");
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
    els.customerAlbumList = $("customer-album-list");
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
    els.photoLightboxZoomOut = $("photo-lightbox-zoom-out");
    els.photoLightboxZoomReset = $("photo-lightbox-zoom-reset");
    els.photoLightboxZoomIn = $("photo-lightbox-zoom-in");
    els.importFile = $("import-file");
    els.importMapping = $("import-mapping");
    els.importPreviewBtn = $("import-preview-btn");
    els.importCommitBtn = $("import-commit-btn");
    els.importConfirmModal = $("import-confirm-modal");
    els.importConfirmCreateCount = $("import-confirm-create-count");
    els.importConfirmExcludedCount = $("import-confirm-excluded-count");
    els.importConfirmDismiss = $("import-confirm-dismiss");
    els.importConfirmSubmit = $("import-confirm-submit");
    els.importSummary = $("import-summary");
    els.importPreviewList = $("import-preview-list");
    els.importResult = $("import-result");
    els.importCloseBtn = $("import-close-btn");
    if (els.importCloseBtn) {
      els.importCloseBtn.classList.add("hidden");
      els.importCloseBtn.hidden = true;
    }
  }

  function bindEvents() {
    els.ownerConfirmCancel.addEventListener("click", function () {
      closeOwnerConfirm(false);
    });
    els.ownerConfirmSubmit.addEventListener("click", function () {
      closeOwnerConfirm(true);
    });
    els.ownerConfirmModal.addEventListener("click", function (event) {
      if (event.target === els.ownerConfirmModal) closeOwnerConfirm(false);
    });
    els.pigmentReminderCancel.addEventListener("click", closePigmentReminderModal);
    els.pigmentReminderSubmit.addEventListener("click", function () {
      submitPigmentReminderDates().catch(function (error) {
        setStatus("error", error.message || "補色提醒日期更新失敗");
      });
    });
    els.pigmentReminderModal.addEventListener("click", function (event) {
      if (event.target === els.pigmentReminderModal) closePigmentReminderModal();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && ownerConfirmResolver) closeOwnerConfirm(false);
    });
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
    if (els.aiGoBookings) {
      els.aiGoBookings.addEventListener("click", function () {
        switchTab("today");
      });
    }
    els.svcSubmit.addEventListener("click", handleServiceSubmit);
    els.svcName.addEventListener("input", syncServiceAssessmentAvailability);
    $("cancel-edit").addEventListener("click", clearServiceForm);
    $("save-slots").addEventListener("click", handleSaveSlots);
    els.addClosedDate.addEventListener("click", function () {
      updateClosedDate(els.closedDateInput.value, true);
    });
    els.closedDateMonth.addEventListener("change", function () {
      loadClosedDates().catch(function (error) { setStatus("error", error.message); });
    });
    $("save-settings").addEventListener("click", handleSaveSettings);
    els.depositEnabled.addEventListener("change", updateDepositFieldsState);
    if (els.customerAiEnabled) {
      els.customerAiEnabled.addEventListener("change", updateCustomerAiFieldsState);
    }
    if (els.applyBrowAiPreset) {
      els.applyBrowAiPreset.addEventListener("click", applyBrowAiPreset);
    }
    if (els.applyLipAiPreset) {
      els.applyLipAiPreset.addEventListener("click", applyLipAiPreset);
    }
    if (els.applyAllRoundAiPreset) {
      els.applyAllRoundAiPreset.addEventListener("click", applyAllRoundAiPreset);
    }
    if (els.assessmentTemplateRefresh) els.assessmentTemplateRefresh.addEventListener("click", toggleAssessmentTemplates);
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
    els.ownerRescheduleDate.addEventListener("change", function () {
      var date = String(els.ownerRescheduleDate.value || "").trim();
      if (!date) {
        resetRescheduleSlotState();
        return;
      }
      loadRescheduleSlotsForDate(date).catch(function (e) {
        setStatus("error", e.message);
      });
    });
    els.ownerRescheduleTime.addEventListener("change", function () {
      updateRescheduleConfirmEnabled();
    });
    els.ownerRescheduleTime.addEventListener("input", function () {
      updateRescheduleConfirmEnabled();
    });
    els.ownerRescheduleModal.addEventListener("click", function (event) {
      if (event.target === els.ownerRescheduleModal) {
        closeOwnerRescheduleModal();
      }
    });
    if (els.aiSummaryGenerate) {
      els.aiSummaryGenerate.addEventListener("click", function () {
        handleAiSummaryGenerate().catch(function (e) {
          setAiStatus(els.aiSummaryStatus, e.message || "AI 產生失敗", true);
        });
      });
    }
    if (els.aiInquiryRefresh) {
      els.aiInquiryRefresh.addEventListener("click", function () {
        loadAiInquiries().catch(function (error) {
          setAiStatus(els.aiInquiryStatus, error.message || "無法載入洽詢回報", true);
        });
      });
    }
    if (els.browIntakeRefresh) {
      els.browIntakeRefresh.addEventListener("click", function () {
        loadBrowIntakes().catch(function (error) {
          setAiStatus(els.browIntakeStatus, error.message || "無法載入評估案件", true);
        });
      });
    }
    if (els.browReviewConfirmCancel) els.browReviewConfirmCancel.addEventListener("click", closeBrowReviewModal);
    if (els.browReviewConfirmSubmit) els.browReviewConfirmSubmit.addEventListener("click", function () {
      reviewBrowIntake();
    });
    if (els.browReviewConfirmModal) els.browReviewConfirmModal.addEventListener("click", function (event) {
      if (event.target === els.browReviewConfirmModal && !browIntakeBusy) closeBrowReviewModal();
    });
    if (els.subscriptionReminderClose) {
      els.subscriptionReminderClose.addEventListener("click", closeSubscriptionReminder);
    }
    if (els.subscriptionReminderModal) {
      els.subscriptionReminderModal.addEventListener("click", function (event) {
        if (event.target === els.subscriptionReminderModal) {
          closeSubscriptionReminder();
        }
      });
    }
    if (els.aiWorkQueueRefresh) {
      els.aiWorkQueueRefresh.addEventListener("click", function () {
        loadAiWorkQueue().catch(function (error) {
          setAiStatus(els.aiWorkQueueStatus, error.message || "無法載入待辦", true);
        });
      });
    }
    if (els.aiSummaryCopy) {
      els.aiSummaryCopy.addEventListener("click", function () {
        handleAiSummaryCopy().catch(function (e) {
          setAiStatus(els.aiSummaryStatus, e.message || "複製失敗", true);
        });
      });
    }
    if (els.ownerAiDraftGenerate) {
      els.ownerAiDraftGenerate.addEventListener("click", function () {
        handleOwnerAiDraftGenerate().catch(function (e) {
          setAiStatus(els.ownerAiDraftStatus, e.message || "AI 產生失敗", true);
        });
      });
    }
    if (els.ownerAiDraftCopy) {
      els.ownerAiDraftCopy.addEventListener("click", function () {
        handleOwnerAiDraftCopy().catch(function (e) {
          setAiStatus(els.ownerAiDraftStatus, e.message || "複製失敗", true);
        });
      });
    }
    if (els.ownerAiDraftDismiss) {
      els.ownerAiDraftDismiss.addEventListener("click", closeOwnerAiDraftModal);
    }
    if (els.ownerAiDraftModal) {
      els.ownerAiDraftModal.addEventListener("click", function (event) {
        if (event.target === els.ownerAiDraftModal) {
          closeOwnerAiDraftModal();
        }
      });
    }
    if (els.photoLightboxClose) {
      els.photoLightboxClose.addEventListener("click", closePhotoLightbox);
    }
    if (els.photoLightboxZoomOut) {
      els.photoLightboxZoomOut.addEventListener("click", function () {
        applyPhotoLightboxZoom(photoLightboxState.zoom - 0.5);
      });
    }
    if (els.photoLightboxZoomReset) {
      els.photoLightboxZoomReset.addEventListener("click", function () { applyPhotoLightboxZoom(1); });
    }
    if (els.photoLightboxZoomIn) {
      els.photoLightboxZoomIn.addEventListener("click", function () {
        applyPhotoLightboxZoom(photoLightboxState.zoom + 0.5);
      });
    }
    if (els.photoLightboxImg) {
      els.photoLightboxImg.addEventListener("click", function () {
        applyPhotoLightboxZoom(photoLightboxState.zoom > 1 ? 1 : 2);
      });
    }
    if (els.ownerReviewDismiss) {
      els.ownerReviewDismiss.addEventListener("click", closeOwnerReview);
    }
    if (els.ownerReviewRequestPhoto) {
      els.ownerReviewRequestPhoto.addEventListener("click", function () {
        setOwnerPhotoRequest(true);
      });
    }
    if (els.ownerReviewRequestAnswers) {
      els.ownerReviewRequestAnswers.addEventListener("click", requestOwnerReviewAnswers);
    }
    if (els.ownerReviewClearPhoto) {
      els.ownerReviewClearPhoto.addEventListener("click", function () {
        setOwnerPhotoRequest(false);
      });
    }
    if (els.ownerReviewAiGenerate) {
      els.ownerReviewAiGenerate.addEventListener("click", generateOwnerReviewAiSummary);
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
    if (els.customerImportTemplateDownload) {
      els.customerImportTemplateDownload.addEventListener("click", handleCustomerImportTemplateDownload);
    }
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
      els.customerEditNote.addEventListener("input", function () {
        updateCustomerNoteCount(); updateCustomerEditDirtyState();
      });
    }
    [els.customerEditName, els.customerEditPhone, els.customerEditBirthday].forEach(function (input) {
      if (input) input.addEventListener("input", updateCustomerEditDirtyState);
    });
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
      els.importCommitBtn.addEventListener("click", handleImportCommit);
    }
    if (els.importConfirmDismiss) {
      els.importConfirmDismiss.addEventListener("click", closeImportConfirmModal);
    }
    if (els.importConfirmSubmit) {
      els.importConfirmSubmit.addEventListener("click", function () {
        executeImportCommit().catch(function (e) { setStatus("error", e.message); });
      });
    }
    if (els.importConfirmModal) {
      els.importConfirmModal.addEventListener("click", function (event) {
        if (event.target === els.importConfirmModal) closeImportConfirmModal();
      });
    }
    if (els.importCloseBtn) {
      els.importCloseBtn.addEventListener("click", closeImportWindow);
    }
    importMappingSelects().forEach(function (item) {
      if (item.el) {
        item.el.addEventListener("change", handleImportMappingChange);
      }
    });
  }

  async function boot() {
    cacheElements();
    var productConfig = window.BEAUTY_CONFIG || {};
    var isAiTier = productConfig.PRODUCT_TIER === "ai";
    var customerImportEnabled =
      productConfig.CUSTOMER_IMPORT_ENABLED === true;
    if (els.customerImportCard) {
      els.customerImportCard.classList.toggle("hidden", !customerImportEnabled);
    }
    if (els.customerImportUpgrade) {
      els.customerImportUpgrade.hidden = customerImportEnabled;
      els.customerImportUpgrade.classList.toggle("hidden", customerImportEnabled);
    }
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

      state.ownerMembership = await initializeOwnerTenant();
      if (state.ownerMembership && state.ownerMembership.features) {
        applyOwnerPlanTheme(state.ownerMembership.features.plan);
        if (els.customerImportCard) {
          els.customerImportCard.classList.toggle("hidden",
            state.ownerMembership.features.customerImport !== true);
        }
        if (els.customerImportUpgrade) {
          var importEnabled = state.ownerMembership.features.customerImport === true;
          els.customerImportUpgrade.hidden = importEnabled;
          els.customerImportUpgrade.classList.toggle("hidden", importEnabled);
        }
      }
      loadSubscriptionStatus();
      var today = getTodayIso();
      document.body.classList.remove("auth-pending");
      setStatus("info", "載入今日預約中…");
      await Promise.all([
        loadSettings(),
        refreshAiCapability(),
        loadMonthBookings(getCurrentMonthIso(), today),
        loadServices(),
        loadSlots()
      ]);
      setStatus("");
    } catch (error) {
      setStatus("error", error.message || "發生未知錯誤");
    }
  }

  boot();
})();
