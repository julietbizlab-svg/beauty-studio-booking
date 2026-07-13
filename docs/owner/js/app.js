/**
 * 業主端管理主程式
 */
(function () {
  "use strict";

  var WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

  var state = {
    user: null,
    todayBookings: [],
    bookingQueryDate: "",
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

  function getSelectedBookingDate() {
    return els.todayDate.value || getTodayIso();
  }

  function updateBookingDateSummary() {
    var date = state.bookingQueryDate || getSelectedBookingDate();
    if (els.bookingDateSummary) {
      els.bookingDateSummary.textContent = "目前查詢：" + formatDateZh(date) + "（" + getWeekdayLabel(date) + "）";
    }
  }

  function renderToday() {
    var container = els.todayList;
    var date = state.bookingQueryDate || getSelectedBookingDate();
    updateBookingDateSummary();

    if (!state.todayBookings.length) {
      container.innerHTML = '<div class="empty">' + formatDateZh(date) + " 尚無預約</div>";
      return;
    }

    container.innerHTML = state.todayBookings.map(function (b) {
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
        '</div>'
      );
    }).join("");
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
    var date = getSelectedBookingDate();
    state.bookingQueryDate = date;
    setStatus("info", "載入預約中…");
    try {
      var result = await window.ownerApi.getToday(state.user.userId, date);
      state.todayBookings = result.bookings || [];
      setStatus("");
      renderToday();
    } catch (error) {
      setStatus("error", error.message);
    }
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
    setStatus("info", "儲存設定中…");
    try {
      await window.ownerApi.updateSettings(state.user.userId, {
        brandName: els.brandName.value.trim(),
        primaryColor: els.primaryColor.value.trim(),
        announcement: els.announcement.value.trim(),
        cancelPolicy: els.cancelPolicy.value.trim()
      });
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
    els.todayDate = $("today-date");
    els.bookingDateSummary = $("booking-date-summary");
    els.serviceList = $("service-list");
    els.slotEditor = $("slot-editor");
    els.brandName = $("brand-name");
    els.primaryColor = $("primary-color");
    els.announcement = $("announcement");
    els.cancelPolicy = $("cancel-policy");
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
    els.todayDate.value = getTodayIso();
    state.bookingQueryDate = els.todayDate.value;
    els.todayDate.addEventListener("change", function () {
      loadToday().catch(function (e) { setStatus("error", e.message); });
    });
    $("booking-today-btn").addEventListener("click", function () {
      els.todayDate.value = getTodayIso();
      loadToday().catch(function (e) { setStatus("error", e.message); });
    });
    $("refresh-today").addEventListener("click", function () {
      loadToday().catch(function (e) { setStatus("error", e.message); });
    });
    els.svcSubmit.addEventListener("click", handleServiceSubmit);
    $("cancel-edit").addEventListener("click", clearServiceForm);
    $("save-slots").addEventListener("click", handleSaveSlots);
    $("save-settings").addEventListener("click", handleSaveSettings);
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
      await loadToday();
      await loadServices();
      await loadSlots();
      setStatus("");
    } catch (error) {
      setStatus("error", error.message || "發生未知錯誤");
    }
  }

  boot();
})();
