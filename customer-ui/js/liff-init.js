/**
 * LINE LIFF 登入模組（客人端 / 業主端共用）
 */
(function () {
  "use strict";

  var LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";
  var LOGIN_COOLDOWN_KEY = "beauty-liff-login-at";
  var LOGIN_COOLDOWN_MS = 90000;
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
    if (!liff.isLoggedIn()) {
      requestLogin();
      return;
    }
    clearLoginAttempt();
    var profile = await liff.getProfile();
    window.beautyUser = {
      userId: profile.userId,
      displayName: profile.displayName || "客人",
      pictureUrl: profile.pictureUrl || ""
    };
    if (window.__resolveBeautyLiff) {
      window.__resolveBeautyLiff();
    }
  }

  initLiff().catch(function (error) {
    console.error("[LIFF]", error);
    if (window.__rejectBeautyLiff) {
      window.__rejectBeautyLiff(error);
    }
  });
})();
