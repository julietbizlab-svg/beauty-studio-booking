/**
 * 後端 API 客戶端（業主端）
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

  function getIdToken() {
    if (typeof window.getBeautyIdToken === "function") {
      return window.getBeautyIdToken();
    }
    return window.beautyIdToken || null;
  }

  function triggerOwnerReLogin() {
    if (typeof window.beautyOwnerRequestReLogin === "function") {
      return window.beautyOwnerRequestReLogin();
    }
    return false;
  }

  function makeAuthError(message) {
    var error = new Error(message);
    error.status = 401;
    error.reloginTriggered = true;
    return error;
  }

  function looksLikeTokenExpiredMessage(message) {
    var msg = String(message || "").toLowerCase();
    return msg.indexOf("access token") !== -1 ||
      msg.indexOf("expired") !== -1 ||
      msg.indexOf("token") !== -1 ||
      String(message || "").indexOf("登入過期") !== -1 ||
      String(message || "").indexOf("憑證") !== -1;
  }

  async function apiFetch(path, options) {
    var baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      throw new Error("API 尚未設定");
    }

    var idToken = getIdToken();
    if (!idToken) {
      if (triggerOwnerReLogin()) {
        throw makeAuthError("登入已過期，正在重新導向 LINE 登入…");
      }
      throw new Error("尚未完成 LINE 登入，無法呼叫管理 API");
    }

    var opts = options || {};
    var headers = Object.assign({
      "Content-Type": "application/json",
      "Authorization": "Bearer " + idToken
    }, opts.headers || {});

    var response = await fetch(baseUrl + path, Object.assign({}, opts, {
      headers: headers
    }));

    var body = null;
    try {
      body = await response.json();
    } catch (ignore) {}

    if (!response.ok) {
      var message = (body && body.message) ? body.message : "伺服器回應錯誤（" + response.status + "）";
      if (response.status === 401 || looksLikeTokenExpiredMessage(message)) {
        if (triggerOwnerReLogin()) {
          throw makeAuthError("登入已過期，正在重新導向 LINE 登入…");
        }
        message = "登入已過期，請重新開啟此頁";
      } else if (response.status === 403 && (!body || !body.message)) {
        message = "無業主管理權限";
      }
      var error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  window.ownerApi = {
    getBookingsForMonth: function (month) {
      return apiFetch("/api/owner/bookings/month?month=" + encodeURIComponent(month));
    },

    getToday: function (userId, date) {
      var query = "/api/owner/today";
      if (date) query += "?date=" + encodeURIComponent(date);
      return apiFetch(query);
    },

    getServices: function (userId) {
      return apiFetch("/api/owner/services");
    },

    createService: function (userId, data) {
      return apiFetch("/api/owner/services", {
        method: "POST",
        body: JSON.stringify(data || {})
      });
    },

    updateService: function (userId, serviceId, data) {
      return apiFetch("/api/owner/services/" + encodeURIComponent(serviceId), {
        method: "PATCH",
        body: JSON.stringify(data || {})
      });
    },

    getSlots: function (userId) {
      return apiFetch("/api/owner/slots");
    },

    saveSlots: function (userId, slots) {
      return apiFetch("/api/owner/slots", {
        method: "POST",
        body: JSON.stringify({ slots: slots || [] })
      });
    },

    getSettings: function (userId) {
      return apiFetch("/api/owner/settings");
    },

    updateSettings: function (userId, data) {
      return apiFetch("/api/owner/settings", {
        method: "PATCH",
        body: JSON.stringify(data || {})
      });
    },

    cancelBooking: function (bookingId, reason) {
      return apiFetch("/api/owner/bookings/cancel", {
        method: "POST",
        body: JSON.stringify({
          bookingId: bookingId,
          reason: reason
        })
      });
    },

    getCustomers: function (q) {
      var query = "/api/owner/customers";
      if (q) query += "?q=" + encodeURIComponent(q);
      return apiFetch(query);
    },

    getCustomerBookings: function (userId) {
      return apiFetch(
        "/api/owner/customer-bookings?userId=" + encodeURIComponent(userId || "")
      );
    },

    isConfigured: function () {
      return Boolean(getApiBaseUrl());
    }
  };
})();
