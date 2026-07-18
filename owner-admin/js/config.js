/**
 * 美業工作室 — 前端設定（業主端）
 * 依 hostname 自動切換環境：
 * - juliet-studio.pages.dev（含 Cloudflare Pages preview 子網域）→ v2-test
 * - 其他 hostname → Demo v1
 */
window.BEAUTY_CONFIG = (function () {
  var hostname = window.location.hostname;
  var isV2Test =
    hostname === "juliet-studio.pages.dev" ||
    hostname.endsWith(".juliet-studio.pages.dev");

  if (isV2Test) {
    return {
      LIFF_ID: "2010530394-orSKMGcU",
      API_BASE_URL: "https://beauty-studio-api-v2-test.gosu-chill-book.workers.dev"
    };
  }

  return {
    LIFF_ID: "2010678480-dKQ3afnw",
    API_BASE_URL: "https://beauty-studio-api.gosu-chill-book.workers.dev"
  };
})();
