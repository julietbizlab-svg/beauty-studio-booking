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

  async function apiFetch(path, options) {
    var baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      throw new Error("API 尚未設定");
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

  window.ownerApi = {
    getToday: function (userId, date) {
      var query = "/api/owner/today?userId=" + encodeURIComponent(userId);
      if (date) query += "&date=" + encodeURIComponent(date);
      return apiFetch(query);
    },

    getServices: function (userId) {
      return apiFetch("/api/owner/services?userId=" + encodeURIComponent(userId));
    },

    createService: function (userId, data) {
      return apiFetch("/api/owner/services", {
        method: "POST",
        body: JSON.stringify(Object.assign({ userId: userId }, data))
      });
    },

    updateService: function (userId, serviceId, data) {
      return apiFetch("/api/owner/services/" + encodeURIComponent(serviceId), {
        method: "PATCH",
        body: JSON.stringify(Object.assign({ userId: userId }, data))
      });
    },

    getSlots: function (userId) {
      return apiFetch("/api/owner/slots?userId=" + encodeURIComponent(userId));
    },

    saveSlots: function (userId, slots) {
      return apiFetch("/api/owner/slots", {
        method: "POST",
        body: JSON.stringify({ userId: userId, slots: slots })
      });
    },

    getSettings: function (userId) {
      return apiFetch("/api/owner/settings?userId=" + encodeURIComponent(userId));
    },

    updateSettings: function (userId, data) {
      return apiFetch("/api/owner/settings", {
        method: "PATCH",
        body: JSON.stringify(Object.assign({ userId: userId }, data))
      });
    },

    isConfigured: function () {
      return Boolean(getApiBaseUrl());
    }
  };
})();
