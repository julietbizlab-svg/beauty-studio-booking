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

  /**
   * binary 傳輸用（照片上傳／下載）：沿用 Authorization 與 401
   * 重新登入機制，但不強制 Content-Type: application/json，
   * 成功時回傳原始 Response 由呼叫端處理（blob／json）。
   * 不記錄 blob、base64、object key 或 token。
   */
  async function apiFetchRaw(path, options) {
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
      "Authorization": "Bearer " + idToken
    }, opts.headers || {});

    var response = await fetch(baseUrl + path, Object.assign({}, opts, {
      headers: headers
    }));

    if (!response.ok) {
      var body = null;
      try {
        body = await response.json();
      } catch (ignore) {}
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
    return response;
  }

  function photoSetBasePath(customerId) {
    return "/api/owner/customers/by-id/" + encodeURIComponent(customerId || "") +
      "/photo-sets";
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

    transitionBookingStatus: function (bookingId, toStatus, options) {
      var opts = options || {};
      var body = { toStatus: toStatus };
      if (opts.reasonCode) body.reasonCode = opts.reasonCode;
      if (opts.note) body.note = opts.note;
      return apiFetch(
        "/api/owner/bookings/" + encodeURIComponent(bookingId || "") + "/status",
        {
          method: "PATCH",
          body: JSON.stringify(body)
        }
      );
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

    updateCustomer: function (userId, data) {
      return apiFetch(
        "/api/owner/customers/" + encodeURIComponent(userId || ""),
        {
          method: "PATCH",
          body: JSON.stringify(data || {})
        }
      );
    },

    getCustomerById: function (customerId) {
      return apiFetch(
        "/api/owner/customers/by-id/" + encodeURIComponent(customerId || "")
      );
    },

    updateCustomerById: function (customerId, data) {
      return apiFetch(
        "/api/owner/customers/by-id/" + encodeURIComponent(customerId || ""),
        {
          method: "PATCH",
          body: JSON.stringify(data || {})
        }
      );
    },

    // 前後對比照片：metadata 走 JSON；binary 走 apiFetchRaw
    // （不強制 JSON Content-Type、不記錄 blob／object key）
    listPhotoSets: function (customerId) {
      return apiFetch(photoSetBasePath(customerId));
    },

    createPhotoSet: function (customerId, data) {
      return apiFetch(photoSetBasePath(customerId), {
        method: "POST",
        body: JSON.stringify(data || {})
      });
    },

    updatePhotoSet: function (customerId, setId, data) {
      return apiFetch(
        photoSetBasePath(customerId) + "/" + encodeURIComponent(setId || ""),
        {
          method: "PATCH",
          body: JSON.stringify(data || {})
        }
      );
    },

    deletePhotoSet: function (customerId, setId) {
      return apiFetch(
        photoSetBasePath(customerId) + "/" + encodeURIComponent(setId || ""),
        { method: "DELETE" }
      );
    },

    uploadComparisonPhoto: async function (customerId, setId, kind, blob, metadata) {
      var meta = metadata || {};
      var query = "";
      if (meta.width) {
        query += (query ? "&" : "?") + "width=" + encodeURIComponent(meta.width);
      }
      if (meta.height) {
        query += (query ? "&" : "?") + "height=" + encodeURIComponent(meta.height);
      }
      var response = await apiFetchRaw(
        photoSetBasePath(customerId) + "/" + encodeURIComponent(setId || "") +
        "/photos/" + encodeURIComponent(kind || "") + query,
        {
          method: "PUT",
          headers: { "Content-Type": (blob && blob.type) || "" },
          body: blob
        }
      );
      return response.json();
    },

    fetchComparisonPhotoBlob: async function (customerId, photoId) {
      var response = await apiFetchRaw(
        "/api/owner/customers/by-id/" + encodeURIComponent(customerId || "") +
        "/photos/" + encodeURIComponent(photoId || "") + "/content"
      );
      return response.blob();
    },

    deleteComparisonPhoto: function (customerId, photoId) {
      return apiFetch(
        "/api/owner/customers/by-id/" + encodeURIComponent(customerId || "") +
        "/photos/" + encodeURIComponent(photoId || ""),
        { method: "DELETE" }
      );
    },

    // LINE 認領邀請：POST 回應含一次性原始 token（僅該次），
    // GET／DELETE 永不涉及原始 token；一律不記錄 request／response body
    createClaimInvite: function (customerId) {
      return apiFetch(
        "/api/owner/customers/by-id/" + encodeURIComponent(customerId || "") +
        "/claim-invite",
        { method: "POST" }
      );
    },

    getClaimInvite: function (customerId) {
      return apiFetch(
        "/api/owner/customers/by-id/" + encodeURIComponent(customerId || "") +
        "/claim-invite"
      );
    },

    revokeClaimInvite: function (customerId) {
      return apiFetch(
        "/api/owner/customers/by-id/" + encodeURIComponent(customerId || "") +
        "/claim-invite",
        { method: "DELETE" }
      );
    },

    previewCustomerImport: function (csvText, mapping) {
      return apiFetch("/api/owner/customers/import/preview", {
        method: "POST",
        body: JSON.stringify({
          csvText: csvText,
          mapping: mapping || {}
        })
      });
    },

    commitCustomerImport: function (csvText, mapping, canonicalHash) {
      return apiFetch("/api/owner/customers/import/commit", {
        method: "POST",
        body: JSON.stringify({
          csvText: csvText,
          mapping: mapping || {},
          canonicalHash: canonicalHash
        })
      });
    },

    isConfigured: function () {
      return Boolean(getApiBaseUrl());
    }
  };
})();
