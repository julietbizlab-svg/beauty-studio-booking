/**
 * 美業工作室 — 前端設定
 * 依 hostname 自動切換環境：
 * - juliet-studio.pages.dev（含 Cloudflare Pages preview 子網域）→ v2-test
 * - 其他 hostname → Demo v1
 *
 * CLAIM_ENABLED／CUSTOMER_APP_URL 為非秘密環境設定：
 * 只有 v2 hostname 啟用 LINE 認領流程；CUSTOMER_APP_URL 以目前
 * hostname 組合（preview 子網域各自隔離），Demo v1 一律停用。
 */
window.BEAUTY_CONFIG = (function () {
  var hostname = window.location.hostname;
  var isV2Test =
    hostname === "juliet-studio.pages.dev" ||
    hostname.endsWith(".juliet-studio.pages.dev");

  if (isV2Test) {
    return {
      LIFF_ID: "2010530394-orSKMGcU",
      API_BASE_URL: "https://beauty-studio-api-v2-test.gosu-chill-book.workers.dev",
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
