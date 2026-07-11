/**
 * 客人端預約主程式
 */
(function () {
  "use strict";

  var state = {
    user: null,
    settings: null,
    services: [],
    selectedService: null,
    selectedDate: "",
    selectedTime: "",
    slots: [],
    bookings: []
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

  function getMinDate() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
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
        state.selectedTime = "";
        state.slots = [];
        renderServices();
        renderSlots();
        updateBookButton();
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

  function renderBookings() {
    var container = els.bookingList;
    if (!state.bookings.length) {
      container.innerHTML = '<div class="empty">尚無預約紀錄</div>';
      return;
    }
    container.innerHTML = state.bookings.map(function (b) {
      var statusClass = b.status === "已確認" ? "confirmed" : "cancelled";
      var cancelBtn = b.status === "已確認"
        ? '<button type="button" class="btn btn-danger" data-cancel="' + b.id + '">取消預約</button>'
        : "";
      return (
        '<div class="card">' +
          '<h3>' + escapeHtml(b.serviceName) + '</h3>' +
          '<p>' + formatDateZh(b.date) + ' ' + escapeHtml(b.time) + '</p>' +
          '<span class="booking-status ' + statusClass + '">' + escapeHtml(b.status) + '</span>' +
          cancelBtn +
        '</div>'
      );
    }).join("");

    container.querySelectorAll("[data-cancel]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        handleCancel(btn.getAttribute("data-cancel"));
      });
    });
  }

  function updateBookButton() {
    var ready = state.selectedService && state.selectedDate && state.selectedTime;
    els.bookBtn.disabled = !ready;
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

  async function loadServices() {
    state.services = await window.beautyApi.getServices();
    renderServices();
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
    els.bookBtn.disabled = true;
    setStatus("", "送出預約中…");
    try {
      await window.beautyApi.createBooking({
        userId: state.user.userId,
        displayName: state.user.displayName,
        serviceId: state.selectedService.id,
        date: state.selectedDate,
        time: state.selectedTime
      });
      setStatus("success", "預約成功！");
      state.selectedTime = "";
      await loadSlots();
      await loadBookings();
      switchTab("bookings");
    } catch (error) {
      setStatus("error", error.message);
    } finally {
      updateBookButton();
    }
  }

  async function handleCancel(bookingId) {
    if (!confirm("確定要取消此預約嗎？")) return;
    setStatus("", "取消中…");
    try {
      await window.beautyApi.cancelBooking(state.user.userId, bookingId);
      setStatus("success", "已取消預約");
      await loadBookings();
      if (state.selectedDate && state.selectedService) {
        await loadSlots();
      }
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

    els.dateInput.min = getMinDate();
    els.dateInput.addEventListener("change", function () {
      state.selectedDate = els.dateInput.value;
      loadSlots();
    });

    els.bookBtn.addEventListener("click", handleBook);
  }

  function cacheElements() {
    els.status = $("status");
    els.brand = $("brand");
    els.announcement = $("announcement");
    els.serviceList = $("service-list");
    els.dateInput = $("date-input");
    els.slotGrid = $("slot-grid");
    els.bookBtn = $("book-btn");
    els.bookingList = $("booking-list");
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
