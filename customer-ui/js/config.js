/**
 * 美業工作室 — 前端設定
 * 依 hostname 自動切換環境：
 * - 精確 juliet-studio.pages.dev → v2-production Worker
 * - preview 子網域（*.juliet-studio.pages.dev）→ v2-test Worker
 * - 其他 hostname → Demo v1
 *
 * CLAIM_ENABLED／CUSTOMER_APP_URL 為非秘密環境設定：
 * 正式與 preview 的 v2 hostname 皆啟用 LINE 認領流程；CUSTOMER_APP_URL
 * 以目前 hostname 組合（preview 子網域各自隔離），Demo v1 一律停用。
 */
window.BEAUTY_CONFIG = (function () {
  var hostname = window.location.hostname;
  var isV2Host =
    hostname === "juliet-studio.pages.dev" ||
    hostname.endsWith(".juliet-studio.pages.dev");
  var isV2Production = hostname === "juliet-studio.pages.dev";

  if (isV2Host) {
    // v2 專屬樣式 scope：正式與 preview 皆加 class；Demo v1 不加
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.classList.add("is-v2");
    }
    return {
      LIFF_ID: "2010530394-orSKMGcU",
      API_BASE_URL: isV2Production
        ? "https://beauty-studio-api-v2-production.gosu-chill-book.workers.dev"
        : "https://beauty-studio-api-v2-test.gosu-chill-book.workers.dev",
      CLAIM_ENABLED: true,
      CUSTOMER_APP_URL: "https://" + hostname + "/"
    };
  }

  return {
    LIFF_ID: "2010678480-dKQ3afnw",
    API_BASE_URL: "https://beauty-studio-api.gosu-chill-book.workers.dev",
    CLAIM_ENABLED: false,
    CUSTOMER_APP_URL: null
  };
})();
