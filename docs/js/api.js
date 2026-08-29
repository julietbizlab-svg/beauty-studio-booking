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
    var opts = options || {};
    var showcaseContext = window.BEAUTY_CONFIG &&
      window.BEAUTY_CONFIG.SHOWCASE_CONTEXT;
    var studioEntryKey = window.BEAUTY_CONFIG &&
      window.BEAUTY_CONFIG.STUDIO_ENTRY_KEY;
    var headers = Object.assign({ "Content-Type": "application/json" },
      showcaseContext ? { "X-Beauty-Showcase": showcaseContext } : {},
      studioEntryKey ? { "X-Beauty-Studio-Entry": studioEntryKey } : {},
      opts.headers || {});
    var response = await fetch(baseUrl + path, Object.assign({}, opts, {
      headers: headers
    }));

    var body = null;
    try {
      body = await response.json();
    } catch (ignore) {}

    if (!response.ok) {
      var message = (body && body.message) ? body.message : "伺服器回應錯誤（" + response.status + "）";
      if (
        response.status === 401 &&
        /(?:access|id)\s*token expired|invalid idtoken audience/i.test(message) &&
        typeof window.beautyRecoverExpiredLiffToken === "function"
      ) {
        window.beautyRecoverExpiredLiffToken();
        return new Promise(function () {});
      }
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

    getCustomerAiCapability: function () {
      return authedFetch("/api/customer/ai/capability", { cache: "no-store" });
    },

    getAssessmentTemplate: function (serviceId) {
      return authedFetch("/api/customer/assessment-template?serviceId=" + encodeURIComponent(serviceId || ""), { cache: "no-store" });
    },

    submitCustomerInquiry: function (message, serviceId) {
      return authedFetch("/api/customer/ai/recommend", {
        method: "POST",
        body: JSON.stringify({
          message: message,
          serviceId: serviceId || ""
        })
      });
    },

    getCustomerAiInquiries: function () {
      return authedFetch("/api/customer/ai/inquiries", { cache: "no-store" });
    },

    startAssessment: function (code, serviceId) {
      return authedFetch("/api/customer/assessments/" + encodeURIComponent(code) + "/start", {
        method: "POST", body: JSON.stringify({ serviceId: serviceId || "" })
      });
    },

    answerAssessment: function (code, answer, serviceId) {
      return authedFetch("/api/customer/assessments/" + encodeURIComponent(code) + "/answers", {
        method: "POST", body: JSON.stringify({ answer: answer, serviceId: serviceId || "" })
      });
    },

    uploadAssessmentPhoto: function (code, kind, file, serviceId) {
      return authedFetch("/api/customer/assessments/" + encodeURIComponent(code) +
        "/photos/" + encodeURIComponent(kind) + "?serviceId=" + encodeURIComponent(serviceId || ""), {
        method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file
      });
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

    reportDepositTransfer: function (bookingId, last5) {
      return authedFetch(
        "/api/bookings/" + encodeURIComponent(bookingId || "") + "/deposit-report",
        { method: "PATCH", body: JSON.stringify({ last5: last5 }) }
      );
    },

    cancelBooking: function (bookingId) {
      return authedFetch("/api/bookings/cancel", {
        method: "POST",
        body: JSON.stringify({ bookingId: bookingId })
      });
    },

    requestBookingReschedule: function (bookingId, date, time) {
      return authedFetch("/api/bookings/" + encodeURIComponent(bookingId || "") +
        "/reschedule-request", {
        method: "POST", body: JSON.stringify({ date: date, time: time })
      });
    },

    getBookingReview: function (bookingId) {
      return authedFetch(
        "/api/bookings/" + encodeURIComponent(bookingId || "") + "/review-intake"
      );
    },

    updateBookingReview: function (bookingId, payload) {
      return authedFetch(
        "/api/bookings/" + encodeURIComponent(bookingId || "") + "/review-intake",
        { method: "PATCH", body: JSON.stringify(payload || {}) }
      );
    },

    uploadBookingReviewPhoto: function (bookingId, file) {
      return authedFetch(
        "/api/bookings/" + encodeURIComponent(bookingId || "") + "/review-photos",
        {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file
        }
      );
    },

    getCustomerMe: function () {
      return authedFetch("/api/customer/me");
    },

    saveCustomerMe: function (profile) {
      return authedFetch("/api/customer/me", {
        method: "PATCH",
        body: JSON.stringify(profile || {})
      });
    },

    getBrowIntake: function () {
      return authedFetch("/api/customer/brow-intake");
    },

    uploadBrowIntakePhoto: function (kind, file) {
      return authedFetch("/api/customer/brow-intake/photos/" + encodeURIComponent(kind), {
        method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file
      });
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
