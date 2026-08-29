/**
 * LINE LIFF 登入模組（業主端）
 * idToken 僅存記憶體；過期時自動導向 LINE 重新登入。
 */
(function () {
  "use strict";

  var LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";
  var AUTH_RECOVERY_KEY = "beauty-owner-liff-auth-recovery-at";
  var REQUESTED_TENANT_KEY = "beauty-owner-requested-tenant";
  var AUTH_RECOVERY_COOLDOWN_MS = 90000;
  var LOGIN_COOLDOWN_MS = 15000;
  var lastLoginAttemptAt = 0;
  var loginRequested = false;

  window.beautyUser = null;
  window.beautyIdToken = null;

  function preserveRequestedTenant() {
    var tenantId = "";
    try { tenantId = new URLSearchParams(window.location.search || "").get("tenant") || ""; } catch (ignore) {}
    if (/^[A-Za-z0-9_-]{1,180}$/.test(tenantId)) {
      try { sessionStorage.setItem(REQUESTED_TENANT_KEY, tenantId); } catch (ignore) {}
      return tenantId;
    }
    try { return sessionStorage.getItem(REQUESTED_TENANT_KEY) || ""; } catch (ignore) { return ""; }
  }

  function restoreRequestedTenantToUrl() {
    var tenantId = preserveRequestedTenant();
    if (!tenantId) return;
    var url = new URL(window.location.href);
    if (url.searchParams.get("tenant") === tenantId) return;
    ["code", "state", "liffRedirectUri", "liffClientId", "liff.state"].forEach(function (key) {
      url.searchParams.delete(key);
    });
    url.searchParams.set("tenant", tenantId);
    history.replaceState(null, "", url.pathname + "?" + url.searchParams.toString() + url.hash);
  }

  window.beautyOwnerClearRequestedTenant = function () {
    try { sessionStorage.removeItem(REQUESTED_TENANT_KEY); } catch (ignore) {}
  };

  preserveRequestedTenant();

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
    var url = new URL(window.location.href);
    ["code", "state", "liffRedirectUri", "liffClientId", "liff.state"].forEach(function (key) {
      url.searchParams.delete(key);
    });
    return url.origin + url.pathname + (url.searchParams.toString() ? "?" + url.searchParams.toString() : "");
  }

  function showRouteTransition() {
    document.title = "Juliet Studio OS | Owner Portal";
    var transition = document.getElementById("route-transition");
    if (transition) transition.hidden = false;
  }

  function clearBeautyToken() {
    window.beautyIdToken = null;
  }

  function isRecoverableLiffAuthError(error) {
    return /(?:access|id)\s*token expired|code_verifier does not match|state(?:\s+parameter)?(?:\s+does not match|\s+mismatch)/i.test(
      String(error && error.message || error || "")
    );
  }

  function recoverLiffAuth() {
    var now = Date.now();
    var lastRecovery = 0;
    try {
      lastRecovery = parseInt(sessionStorage.getItem(AUTH_RECOVERY_KEY) || "0", 10);
    } catch (ignore) {}
    if (now - lastRecovery < AUTH_RECOVERY_COOLDOWN_MS) {
      throw new Error("LINE 登入狀態不一致，請關閉此頁後從官方帳號重新開啟業主中心");
    }
    try { sessionStorage.setItem(AUTH_RECOVERY_KEY, String(now)); } catch (ignore) {}
    clearBeautyToken();
    try {
      if (typeof liff !== "undefined" && typeof liff.logout === "function") liff.logout();
    } catch (ignore) {}
    // 不沿用舊 code／state／liffClientId，改由目前設定的業主 LIFF 建立全新 PKCE 流程。
    showRouteTransition();
    window.location.replace("https://liff.line.me/" + encodeURIComponent(getLiffId()));
  }

  window.beautyOwnerRecoverLiffAuth = recoverLiffAuth;

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

  function profileFromIdToken(idToken) {
    try {
      var payloadPart = String(idToken || "").split(".")[1];
      payloadPart = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
      while (payloadPart.length % 4) payloadPart += "=";
      var payload = JSON.parse(atob(payloadPart));
      return {
        userId: String(payload.sub || ""),
        displayName: String(payload.name || "業主"),
        pictureUrl: String(payload.picture || "")
      };
    } catch (ignore) {
      return { userId: "", displayName: "業主", pictureUrl: "" };
    }
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
    showRouteTransition();
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
    restoreRequestedTenantToUrl();
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

  function getOwnerHubInviteToken() {
    var raw = String(window.location.hash || "").replace(/^#/, "");
    var token = new URLSearchParams(raw).get("owner_invite") || "";
    return /^[0-9a-f]{64}$/.test(token) ? token : "";
  }

  async function claimOwnerHubInvite(idToken, studioName, ownerName) {
    var inviteToken = getOwnerHubInviteToken();
    if (!inviteToken) return;
    var config = window.BEAUTY_CONFIG || {};
    var apiBaseUrl = String(config.API_BASE_URL || "").replace(/\/$/, "");
    if (!apiBaseUrl) throw new Error("業主管理中心 API 尚未設定");

    var response = await fetch(apiBaseUrl + "/api/owner-hub/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + idToken
      },
      body: JSON.stringify({
        inviteToken: inviteToken,
        studioName: studioName,
        ownerName: ownerName,
        accountBindingAccepted: true,
        termsAccepted: true,
        termsVersion: "2026-08-06"
      })
    });
    var body = null;
    try {
      body = await response.json();
    } catch (ignore) {}
    if (!response.ok || !body || body.ok !== true) {
      throw new Error((body && body.message) || "業主邀請無效或已過期");
    }
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  function completeOwnerOnboarding(idToken) {
    return new Promise(function (resolve, reject) {
      var modal = document.getElementById("owner-onboarding");
      var studioInput = document.getElementById("owner-onboarding-studio-name");
      var ownerInput = document.getElementById("owner-onboarding-owner-name");
      var accountConfirm = document.getElementById("owner-onboarding-account-confirm");
      var termsConfirm = document.getElementById("owner-onboarding-terms-confirm");
      var status = document.getElementById("owner-onboarding-status");
      var submit = document.getElementById("owner-onboarding-submit");
      if (!modal || !studioInput || !ownerInput || !accountConfirm ||
          !termsConfirm || !submit) {
        reject(new Error("業主首次設定畫面載入失敗"));
        return;
      }
      modal.hidden = false;
      submit.addEventListener("click", async function () {
        var studioName = String(studioInput.value || "").trim();
        var ownerName = String(ownerInput.value || "").trim();
        if (!studioName || !ownerName) {
          status.textContent = "請填寫工作室名稱與業主顯示名稱";
          return;
        }
        if (!accountConfirm.checked) {
          status.textContent = "請先確認 LINE 綁定、不可轉讓與不可自行改綁";
          return;
        }
        if (!termsConfirm.checked) {
          status.textContent = "請先閱讀並同意使用規範、隱私權及更名付費規則";
          return;
        }
        submit.disabled = true;
        status.textContent = "正在安全綁定此 LINE 帳號…";
        try {
          await claimOwnerHubInvite(idToken, studioName, ownerName);
          modal.hidden = true;
          resolve();
        } catch (error) {
          submit.disabled = false;
          status.textContent = error.message || "無法完成業主開通";
        }
      }, { once: false });
    });
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

    var idToken = liff.getIDToken();
    if (!idToken) {
      requestLogin();
      return;
    }
    if (isExpiredIdToken(idToken)) {
      requestLogin();
      return;
    }
    var profile = profileFromIdToken(idToken);
    if (!profile.userId) {
      profile = await liff.getProfile();
    }

    if (getOwnerHubInviteToken()) {
      await completeOwnerOnboarding(idToken);
    }
    completeLogin(profile, idToken);
  }

  initLiff().catch(function (error) {
    if (isRecoverableLiffAuthError(error)) {
      try {
        recoverLiffAuth();
        return;
      } catch (recoveryError) {
        error = recoveryError;
      }
    }
    console.error("[LIFF]", error);
    if (loginRequested) {
      return;
    }
    if (window.__rejectBeautyLiff) {
      window.__rejectBeautyLiff(error);
    }
  });
})();
