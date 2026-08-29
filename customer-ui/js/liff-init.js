/**
 * LINE LIFF 登入模組（客人端 / 業主端共用）
 */
(function () {
  "use strict";

  var LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";
  var LOGIN_COOLDOWN_KEY = "beauty-liff-login-at";
  var EXPIRED_TOKEN_RECOVERY_KEY = "beauty-liff-expired-token-recovery-at";
  var LOGIN_COOLDOWN_MS = 90000;
  var EXPIRED_TOKEN_RECOVERY_COOLDOWN_MS = 90000;
  var loginRequested = false;

  window.beautyUser = null;

  window.beautyLiffReady = new Promise(function (resolve, reject) {
    window.__resolveBeautyLiff = resolve;
    window.__rejectBeautyLiff = reject;
  });

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("LIFF SDK 載入失敗，請檢查網路")); };
      document.head.appendChild(script);
    });
  }

  function getLiffId() {
    var config = window.BEAUTY_CONFIG || {};
    var liffId = (config.LIFF_ID || "").trim();
    if (!liffId || liffId.indexOf("請填入") !== -1) {
      throw new Error("請先在 js/config.js 填入 LIFF_ID");
    }
    return liffId;
  }

  function getStableRedirectUri() {
    return window.location.origin + window.location.pathname;
  }

  function getStudioEntryKeyAfterInit() {
    var key = "";
    var params;
    try {
      var restoredPathMatch = String(window.location.pathname || "")
        .match(/^\/studio\/([a-f0-9]{64})\/?$/i);
      key = restoredPathMatch ? restoredPathMatch[1] : "";
      params = new URLSearchParams(window.location.search || "");
      if (!key) key = params.get("studio_entry") || "";
      if (!key) {
        var liffState = params.get("liff.state") || "";
        if (liffState) {
          var stateUrl = new URL(liffState, window.location.origin);
          var stateMatch = stateUrl.pathname.match(/^\/studio\/([a-f0-9]{64})\/?$/i);
          key = stateMatch ? stateMatch[1] : (stateUrl.searchParams.get("studio_entry") || "");
        }
      }
    } catch (ignore) {}
    key = String(key || "").trim().toLowerCase();
    return /^[a-f0-9]{64}$/.test(key) ? key : "";
  }

  function restoreStudioEntryAfterInit() {
    var config = window.BEAUTY_CONFIG || {};
    if (config.STUDIO_ENTRY_KEY) return false;
    var key = getStudioEntryKeyAfterInit();
    if (!key) return false;
    var target = "/studio/" + key + "/" + window.location.hash;
    window.location.replace(target);
    return true;
  }

  function getFreshLiffUrl() {
    var config = window.BEAUTY_CONFIG || {};
    var base = "https://liff.line.me/" + encodeURIComponent(getLiffId());
    try {
      var tenantLiffId = new URLSearchParams(window.location.search || "")
        .get("tenant_liff_id") || "";
      if (tenantLiffId === getLiffId()) return base;
    } catch (ignore) {}
    var key = String(config.STUDIO_ENTRY_KEY || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(key)) return base;
    var encodedKey = encodeURIComponent(key);
    return base + "/studio/" + encodedKey + "/?studio_entry=" + encodedKey;
  }

  function showRouteTransition() {
    document.title = "Juliet Studio OS | Booking";
    var transition = document.getElementById("route-transition");
    if (transition) transition.hidden = false;
  }

  function clearLiffRedirectTrace() {
    if (!window.history || !window.history.replaceState) return;
    var url;
    try {
      url = new URL(window.location.href);
    } catch (ignore) {
      return;
    }
    [
      "code",
      "state",
      "liffClientId",
      "liffRedirectUri",
      "liff.state",
      "error",
      "error_description"
    ].forEach(function (key) {
      url.searchParams.delete(key);
    });
    var cleanUrl = url.pathname +
      (url.searchParams.toString() ? "?" + url.searchParams.toString() : "") +
      url.hash;
    window.history.replaceState(null, "", cleanUrl);
  }

  function isExpiredIdToken(idToken) {
    try {
      var payloadPart = String(idToken || "").split(".")[1];
      if (!payloadPart) return true;
      payloadPart = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
      while (payloadPart.length % 4) payloadPart += "=";
      var payload = JSON.parse(atob(payloadPart));
      return !Number.isFinite(payload.exp) ||
        payload.exp * 1000 <= Date.now() + 30000;
    } catch (ignore) {
      return true;
    }
  }

  function idTokenMatchesLiffChannel(idToken) {
    try {
      var payloadPart = String(idToken || "").split(".")[1];
      if (!payloadPart) return false;
      payloadPart = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
      while (payloadPart.length % 4) payloadPart += "=";
      var payload = JSON.parse(atob(payloadPart));
      var expectedChannelId = String(getLiffId()).split("-")[0];
      return String(payload.aud || "") === expectedChannelId;
    } catch (ignore) {
      return false;
    }
  }

  function isRecoverableLiffAuthError(error) {
    return /(?:access|id)\s*token expired|invalid idtoken audience|code_verifier does not match|state(?:\s+parameter)?(?:\s+does not match|\s+mismatch)/i.test(
      String(error && error.message || error || "")
    );
  }

  function recoverExpiredLiffToken() {
    var now = Date.now();
    var lastRecovery = 0;
    try {
      lastRecovery = parseInt(
        sessionStorage.getItem(EXPIRED_TOKEN_RECOVERY_KEY) || "0",
        10
      );
    } catch (ignore) {}
    if (now - lastRecovery < EXPIRED_TOKEN_RECOVERY_COOLDOWN_MS) {
      throw new Error("LINE 登入已過期，請關閉此頁後從官方帳號重新開啟");
    }

    try {
      sessionStorage.setItem(EXPIRED_TOKEN_RECOVERY_KEY, String(now));
    } catch (ignore) {}
    clearLoginAttempt();
    try {
      if (typeof liff !== "undefined" && typeof liff.logout === "function") {
        liff.logout();
      }
    } catch (ignore) {}

    // 改走乾淨 LIFF URL 取得全新登入狀態；只重建已驗證的專屬入口，
    // 不攜帶原 query，避免沿用過期 code／state／token。
    showRouteTransition();
    window.location.replace(getFreshLiffUrl());
  }

  window.beautyRecoverExpiredLiffToken = recoverExpiredLiffToken;

  function isDefaultLiffPage() {
    var path = window.location.pathname;
    return /\/beauty-studio-booking\/?$/.test(path) || /\/index\.html$/.test(path);
  }

  function getLastLoginAttempt() {
    try {
      return parseInt(localStorage.getItem(LOGIN_COOLDOWN_KEY) || "0", 10);
    } catch (ignore) {
      return 0;
    }
  }

  function recordLoginAttempt() {
    try {
      localStorage.setItem(LOGIN_COOLDOWN_KEY, String(Date.now()));
    } catch (ignore) {}
  }

  function clearLoginAttempt() {
    try {
      localStorage.removeItem(LOGIN_COOLDOWN_KEY);
    } catch (ignore) {}
  }

  function shouldBlockLoginRetry() {
    return Date.now() - getLastLoginAttempt() < LOGIN_COOLDOWN_MS;
  }

  function requestLogin() {
    if (loginRequested) return;
    if (shouldBlockLoginRetry()) {
      throw new Error("LINE 登入重試過於頻繁，請完全關閉 LINE 後再開");
    }
    loginRequested = true;
    recordLoginAttempt();
    showRouteTransition();
    if (isDefaultLiffPage()) {
      liff.login();
      return;
    }
    liff.login({ redirectUri: getStableRedirectUri() });
  }

  async function initLiff() {
    await loadScript(LIFF_SDK_URL);
    if (typeof liff === "undefined") {
      throw new Error("LIFF SDK 未就緒");
    }
    await liff.init({
      liffId: getLiffId(),
      withLoginOnExternalBrowser: true
    });
    // LINE 會在初始化期間把 LIFF URL 的附加資訊暫存在 liff.state。
    // 必須等 init 完成後才能讀取或改寫網址；若舊版 WebView 沒有自動
    // 還原專屬路徑，使用隨入口一併傳入的 studio_entry 安全回復。
    if (restoreStudioEntryAfterInit()) return;
    // LIFF 已消化 OAuth callback 後立即整理網址列；不新增瀏覽紀錄，
    // 並保留預約流程真正需要的 query／fragment。
    clearLiffRedirectTrace();
    if (!liff.isLoggedIn()) {
      requestLogin();
      return;
    }
    clearLoginAttempt();
    var profile = await liff.getProfile();
    // idToken 僅保存在記憶體（beautyUser.idToken），
    // 不寫入 localStorage、URL 或任何 log
    var idToken = liff.getIDToken();
    if (!idToken) {
      requestLogin();
      return;
    }
    if (isExpiredIdToken(idToken)) {
      throw new Error("IdToken expired.");
    }
    if (!idTokenMatchesLiffChannel(idToken)) {
      throw new Error("Invalid IdToken Audience.");
    }
    window.beautyUser = {
      userId: profile.userId,
      displayName: profile.displayName || "客人",
      pictureUrl: profile.pictureUrl || "",
      idToken: idToken
    };
    if (window.__resolveBeautyLiff) {
      window.__resolveBeautyLiff();
    }
  }

  initLiff().catch(function (error) {
    if (isRecoverableLiffAuthError(error)) {
      try {
        recoverExpiredLiffToken();
        return;
      } catch (recoveryError) {
        error = recoveryError;
      }
    }
    console.error("[LIFF]", error);
    if (window.__rejectBeautyLiff) {
      window.__rejectBeautyLiff(error);
    }
  });
})();
