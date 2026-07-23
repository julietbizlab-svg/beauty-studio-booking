/**
 * 美業工作室 — 前端設定
 * 依 hostname 自動切換環境：
 * - 精確 juliet-studio.pages.dev → Demo v1（正式切換前保持不變）
 * - preview 子網域（*.juliet-studio.pages.dev）→ v2-test Worker
 * - 其他 hostname → Demo v1
 *
 * CLAIM_ENABLED／CUSTOMER_APP_URL 為非秘密環境設定：
 * 僅 preview 子網域啟用 LINE 認領流程；CUSTOMER_APP_URL
 * 以 preview hostname 組合。正式站與 Demo v1 在另行核准前維持停用。
 */
window.BEAUTY_CONFIG = (function () {
  var hostname = window.location.hostname;
  var isV2Preview = hostname.endsWith(".juliet-studio.pages.dev");

  if (isV2Preview) {
    // v2 專屬樣式 scope：僅 preview 加 class；正式站與 Demo v1 不加
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.classList.add("is-v2");
    }
    return {
      LIFF_ID: "2010530394-QcklvIHd",
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
