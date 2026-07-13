/**
 * LINE LIFF 登入模組（業主端）
 * idToken 僅存記憶體；過期時自動導向 LINE 重新登入。
 */
(function () {
  "use strict";

  var LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";
  var LOGIN_COOLDOWN_MS = 15000;
  var lastLoginAttemptAt = 0;
  var loginRequested = false;

  window.beautyUser = null;
  window.beautyIdToken = null;

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
      script.onerror = function () { reject(new Error("LIFF SDK 載入失敗")); };
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

  function getRedirectUri() {
    return window.location.href;
  }

  function clearBeautyToken() {
    window.beautyIdToken = null;
  }

  function canRequestLoginNow() {
    if (loginRequested) {
      return false;
    }
    if (lastLoginAttemptAt && Date.now() - lastLoginAttemptAt < LOGIN_COOLDOWN_MS) {
      return false;
    }
    return true;
  }

  function requestLogin() {
    if (typeof liff === "undefined") {
      return false;
    }
    if (!canRequestLoginNow()) {
      return false;
    }
    loginRequested = true;
    lastLoginAttemptAt = Date.now();
    clearBeautyToken();
    try {
      if (liff.isLoggedIn()) {
        liff.logout();
      }
    } catch (ignore) {}
    liff.login({ redirectUri: getRedirectUri() });
    return true;
  }

  window.beautyOwnerRequestReLogin = function () {
    return requestLogin();
  };

  window.getBeautyIdToken = function () {
    if (window.beautyIdToken) {
      return window.beautyIdToken;
    }
    if (typeof liff !== "undefined" && liff.isLoggedIn()) {
      var freshToken = liff.getIDToken();
      if (freshToken) {
        window.beautyIdToken = freshToken;
        return freshToken;
      }
    }
    return null;
  };

  function completeLogin(profile, idToken) {
    window.beautyIdToken = idToken;
    window.beautyUser = {
      userId: profile.userId,
      displayName: profile.displayName || "業主",
      pictureUrl: profile.pictureUrl || ""
    };
    loginRequested = false;
    lastLoginAttemptAt = 0;
    if (window.__resolveBeautyLiff) {
      window.__resolveBeautyLiff();
    }
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

    var profile = await liff.getProfile();
    var idToken = liff.getIDToken();
    if (!idToken) {
      requestLogin();
      return;
    }

    completeLogin(profile, idToken);
  }

  initLiff().catch(function (error) {
    console.error("[LIFF]", error);
    if (loginRequested) {
      return;
    }
    if (window.__rejectBeautyLiff) {
      window.__rejectBeautyLiff(error);
    }
  });
})();
