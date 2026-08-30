/**
 * JULIET Studio OS — 單一產品設定產生器
 *
 * 唯一判斷來源：
 * - hostname → demo-v1 / v2-test / v2-production
 * - BEAUTY_APP_ROLE → customer / owner
 * - pathname → standard / flagship 方案
 *
 * 客戶端與業主端使用完全相同的產生器，避免 LIFF、Pages、API、
 * 方案標籤分散手動設定而接錯環境。
 */
window.BEAUTY_CONFIG = (function () {
  var hostname = window.location.hostname;
  var pathname = window.location.pathname || "/";
  var htmlRole = "";
  if (typeof document !== "undefined" && document.documentElement &&
      typeof document.documentElement.getAttribute === "function") {
    htmlRole = document.documentElement.getAttribute("data-app-role") || "";
  }
  var role = window.BEAUTY_APP_ROLE || htmlRole ||
    (/\/owner(?:\/|$)/.test(pathname) ? "owner" : "customer");
  if (role !== "owner") role = "customer";

  var isV2Host =
    hostname === "juliet-studio.pages.dev" ||
    hostname.endsWith(".juliet-studio.pages.dev");
  var isProduction = hostname === "juliet-studio.pages.dev";
  var environment = isV2Host
    ? (isProduction ? "v2-production" : "v2-test")
    : "demo-v1";
  var isStandardPath = /^\/standard(?:\/|$)/.test(pathname);
  var isFlagshipPath = /^\/flagship(?:\/|$)/.test(pathname);
  var isFlagshipShowcaseCustomerPath =
    /^\/flagship\/showcase\/customer\/?$/.test(pathname);
  var studioEntryMatch = pathname.match(/^\/studio\/([a-f0-9]{64})\/?$/i);
  var studioEntryKey = studioEntryMatch ? studioEntryMatch[1].toLowerCase() : "";
  var queryLiffClientId = "";
  var hasOwnerInvite = false;
  try {
    queryLiffClientId = new URLSearchParams(window.location.search || "")
      .get("liffClientId") || "";
    hasOwnerInvite = new URLSearchParams(
      String(window.location.hash || "").replace(/^#/, "")
    ).has("owner_invite");
  } catch (ignore) {}
  var isOwnerHubPath =
    /^\/owner\/hub(?:\/|$)/.test(pathname) ||
    /^\/(?:standard|flagship)\/owner(?:\/|$)/.test(pathname) ||
    queryLiffClientId === "2010868233" ||
    hasOwnerInvite;
  var tier = isStandardPath
    ? "standard"
    : (isFlagshipPath ? "ai" : (environment === "v2-test" ? "ai" : "standard"));

  var matrix = {
    "v2-production": {
      customerLiffId: "2011217307-krdMabXG",
      ownerLiffId: "2011217307-pdNvwLwJ",
      apiBaseUrl: "https://beauty-studio-api-v2-production.gosu-chill-book.workers.dev",
      claimEnabled: true
    },
    "v2-test": {
      customerLiffId: "2010530394-QcklvIHd",
      ownerLiffId: "2010530394-TTtQkgne",
      ownerHubLiffId: "2010868233-3ziIABwR",
      apiBaseUrl: "https://beauty-studio-api-v2-test.gosu-chill-book.workers.dev",
      claimEnabled: true
    },
    "demo-v1": {
      customerLiffId: "2010678480-dKQ3afnw",
      ownerLiffId: "2010678480-dKQ3afnw",
      apiBaseUrl: "https://beauty-studio-api.gosu-chill-book.workers.dev",
      claimEnabled: false
    }
  };
  var selected = matrix[environment];
  var customerLiffId = selected.customerLiffId;
  var tenantCustomerLiffId = "";
  try {
    tenantCustomerLiffId = new URLSearchParams(window.location.search || "")
      .get("tenant_liff_id") || "";
  } catch (ignore) {}
  if (environment === "v2-test" && role === "customer" && studioEntryKey &&
      /^\d+-[A-Za-z0-9_-]+$/.test(tenantCustomerLiffId)) {
    customerLiffId = tenantCustomerLiffId;
  }
  var ownerLiffId = environment === "v2-test"
    ? selected.ownerHubLiffId
    : selected.ownerLiffId;
  if (environment === "v2-test" && role === "owner" &&
      /^\d+-[A-Za-z0-9_-]+$/.test(tenantCustomerLiffId)) {
    ownerLiffId = tenantCustomerLiffId;
  }
  var pagesOrigin = environment === "v2-test"
    ? "https://v2-test.juliet-studio.pages.dev"
    : (environment === "v2-production" ? "https://juliet-studio.pages.dev" : "");
  var canonicalPath = pathname;
  if (isV2Host) {
    if (/^\/(?:index\.html)?$/.test(pathname)) canonicalPath = "/";
    else if (/^\/standard\/customer\/?$/.test(pathname)) canonicalPath = "/standard/customer/";
    else if (/^\/flagship\/(?:customer|showcase\/customer)\/?$/.test(pathname)) canonicalPath = "/flagship/showcase/customer";
    else if (/^\/(?:owner|owner\/hub|standard\/owner|flagship\/owner)\/?$/.test(pathname)) canonicalPath = "/owner/hub/";
    else if (/^\/(?:platform|owner\/hub\/platform)\/?$/.test(pathname)) canonicalPath = "/owner/hub/platform/";
    if (canonicalPath !== pathname && window.history && window.history.replaceState) {
      window.history.replaceState(null, "", canonicalPath + window.location.search + window.location.hash);
    }
  }
  var tierLabel = tier === "ai"
    ? "旗艦版｜含 AI"
    : (environment === "demo-v1"
      ? "Demo 標準版｜不含 AI"
      : "標準版｜不含 AI");
  var appTitle = environment === "v2-test" && role === "customer" &&
      isFlagshipShowcaseCustomerPath
    ? "紋繡客戶專屬預約平台"
    : (environment === "v2-test" && role === "owner"
      ? "茱麗葉工作室｜" + (tier === "ai" ? "旗艦版" : "標準版") + "業主端"
      : "");
  var browserTitle = environment === "v2-test" && role === "customer"
    ? "Juliet Studio OS | Booking"
    : appTitle;

  if (isV2Host && typeof document !== "undefined" && document.documentElement) {
    document.documentElement.classList.add("is-v2");
  }
  if (browserTitle && typeof document !== "undefined") {
    document.title = browserTitle;
  }
  if (appTitle && typeof document !== "undefined") {
    if (typeof document.addEventListener === "function") {
      document.addEventListener("DOMContentLoaded", function () {
        var brand = document.getElementById("brand");
        if (brand) brand.textContent = appTitle;
      });
    }
  }

  return {
    APP_TITLE: appTitle,
    APP_ROLE: role,
    ROLE_LABEL: role === "owner" ? "業主端" : "客戶端",
    PRODUCT_TIER: tier,
    PRODUCT_TIER_LABEL: tierLabel,
    PRODUCT_KEY: environment + ":" + tier + ":" + role,
    SHOWCASE_CONTEXT: isFlagshipShowcaseCustomerPath
      ? "flagship"
      : (isStandardPath && role === "customer" ? "standard" : ""),
    STUDIO_ENTRY_KEY: studioEntryKey,
    ENVIRONMENT: environment,
    LIFF_ID: role === "owner" ? ownerLiffId : customerLiffId,
    CUSTOMER_LIFF_ID: customerLiffId,
    OWNER_LIFF_ID: ownerLiffId,
    CUSTOMER_LIFF_URL: "https://liff.line.me/" + customerLiffId,
    OWNER_LIFF_URL: "https://liff.line.me/" + ownerLiffId,
    API_BASE_URL: selected.apiBaseUrl,
    CLAIM_ENABLED: selected.claimEnabled,
    CUSTOMER_IMPORT_ENABLED: tier === "ai",
    CUSTOMER_APP_URL: isV2Host
      ? pagesOrigin + (studioEntryKey ? "/studio/" + studioEntryKey + "/" :
        (isStandardPath ? "/standard/customer/" :
          (isFlagshipPath ? "/flagship/showcase/customer" : "/")))
      : null,
    OWNER_APP_URL: isV2Host ? pagesOrigin + "/owner/hub/" : null
  };
})();
