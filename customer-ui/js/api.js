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

  function getIdToken() {
    if (window.beautyUser && window.beautyUser.idToken) {
      return window.beautyUser.idToken;
    }
    if (typeof liff !== "undefined" && liff.isLoggedIn && liff.isLoggedIn()) {
      try {
        var freshToken = liff.getIDToken();
        if (freshToken) {
          if (window.beautyUser) {
            window.beautyUser.idToken = freshToken;
          }
          return freshToken;
        }
      } catch (ignore) {}
    }
    return null;
  }

  /** 需要客人身分的 API：附上 LINE ID token（Authorization: Bearer） */
  function authedFetch(path, options) {
    var idToken = getIdToken();
    if (!idToken) {
      return Promise.reject(new Error("尚未完成 LINE 登入，請從 LINE 重新開啟"));
    }
    var opts = options || {};
    return apiFetch(path, Object.assign({}, opts, {
      headers: Object.assign({
        "Content-Type": "application/json",
        "Authorization": "Bearer " + idToken
      }, opts.headers || {})
    }));
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

    getSlotsForMonth: function (month, serviceId) {
      var query = "/api/slots/month?month=" + encodeURIComponent(month) +
        "&serviceId=" + encodeURIComponent(serviceId);
      return apiFetch(query);
    },

    createBooking: function (payload) {
      return authedFetch("/api/bookings", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },

    getMyBookings: function () {
      return authedFetch("/api/bookings/me");
    },

    cancelBooking: function (bookingId) {
      return authedFetch("/api/bookings/cancel", {
        method: "POST",
        body: JSON.stringify({ bookingId: bookingId })
      });
    },

    getCustomerMe: function () {
      return authedFetch("/api/customer/me");
    },

    // 一次性認領邀請：token 只放在 request body，不進 URL、log 或儲存
    claimInvite: function (claimToken) {
      return authedFetch("/api/customer/claim-invite", {
        method: "POST",
        body: JSON.stringify({ claimToken: claimToken })
      });
    },

    isConfigured: function () {
      return Boolean(getApiBaseUrl());
    }
  };
})();
