/**
 * 後端 API 客戶端（客人端）
 */
(function () {
  "use strict";

  function getApiBaseUrl() {
    var config = window.BEAUTY_CONFIG || {};
    var url = (config.API_BASE_URL || "").trim();
    if (!url || url.indexOf("請填入") !== -1) {
      return null;
    }
    return url.replace(/\/$/, "");
  }

  async function apiFetch(path, options) {
    var baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      throw new Error("API 尚未設定，請在 config.js 填入 API_BASE_URL");
    }
    var response = await fetch(baseUrl + path, Object.assign({
      headers: { "Content-Type": "application/json" }
    }, options || {}));

    var body = null;
    try {
      body = await response.json();
    } catch (ignore) {}

    if (!response.ok) {
      var message = (body && body.message) ? body.message : "伺服器回應錯誤（" + response.status + "）";
      var error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  window.beautyApi = {
    getSettings: function () {
      return apiFetch("/api/settings");
    },

    getServices: function () {
      return apiFetch("/api/services");
    },

    getSlots: function (date, serviceId) {
      var query = "/api/slots?date=" + encodeURIComponent(date) +
        "&serviceId=" + encodeURIComponent(serviceId);
      return apiFetch(query);
    },

    createBooking: function (payload) {
      return apiFetch("/api/bookings", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },

    getMyBookings: function (userId) {
      return apiFetch("/api/bookings/me?userId=" + encodeURIComponent(userId));
    },

    cancelBooking: function (userId, bookingId) {
      return apiFetch("/api/bookings/cancel", {
        method: "POST",
        body: JSON.stringify({ userId: userId, bookingId: bookingId })
      });
    },

    isConfigured: function () {
      return Boolean(getApiBaseUrl());
    }
  };
})();
