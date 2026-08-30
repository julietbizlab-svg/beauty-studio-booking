#!/usr/bin/env node

const EXPECTED_OWNER_LIFF_ID = "2010868233-3ziIABwR";
const input = process.argv[2] || "https://v2-test.juliet-studio.pages.dev";
const baseUrl = new URL(input);

if (baseUrl.protocol !== "https:") {
  throw new Error("驗收網址必須使用 HTTPS");
}

baseUrl.pathname = baseUrl.pathname.replace(/\/$/, "");
baseUrl.search = "";
baseUrl.hash = "";

async function fetchText(pathname) {
  const url = new URL(pathname, baseUrl.origin);
  url.searchParams.set("portcheck", Date.now().toString());
  const response = await fetch(url, {
    redirect: "error",
    headers: { "Cache-Control": "no-cache" }
  });
  if (!response.ok) {
    throw new Error(`${url.pathname} 回傳 HTTP ${response.status}`);
  }
  return response.text();
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}

const [customerHtml, ownerHtml, ownerConfig, platformHtml, platformJs] = await Promise.all([
  fetchText("/"),
  fetchText("/owner/hub/"),
  fetchText("/owner/js/config.js"),
  fetchText("/owner/hub/platform/"),
  fetchText("/platform/platform.js")
]);

requireMatch(customerHtml, /data-app-role="customer"/,
  "根目錄不是客戶端角色");
requireMatch(customerHtml, /window\.BEAUTY_APP_ROLE = "customer"/,
  "根目錄缺少客戶端執行角色");
requireMatch(ownerHtml, /data-app-role="owner"/,
  "/owner/hub/ 不是業主端角色");
requireMatch(ownerHtml, /window\.BEAUTY_APP_ROLE = "owner"/,
  "/owner/hub/ 缺少業主端執行角色");
requireMatch(ownerHtml, /<base href="\/owner\/">/,
  "/owner/hub/ 資產根目錄不是 /owner/");
requireMatch(ownerHtml, /<title>茱麗葉工作室｜業主管理<\/title>/,
  "/owner/hub/ 標題不是業主管理");
if (/id="platform-provisioning"|data-tab="platform"/.test(ownerHtml)) {
  throw new Error("一般業主端仍包含平台管理功能");
}
requireMatch(platformHtml, /<title>Juliet Studio OS｜平台管理中心<\/title>/,
  "/owner/hub/platform/ 不是獨立平台管理中心");
requireMatch(platformHtml, /僅限平台負責人/,
  "平台管理中心缺少專屬權限標示");
requireMatch(platformHtml, /noindex, nofollow, noarchive/,
  "平台管理中心未禁止搜尋引擎收錄");
requireMatch(platformJs, /getPlatformCapability\(\)/,
  "平台管理中心未執行後端權限驗證");
requireMatch(ownerConfig, new RegExp(
  `ownerHubLiffId:\\s*"${EXPECTED_OWNER_LIFF_ID}"`
), "業主管理 LIFF ID 不正確");

console.log("PASS root=/ customer");
console.log("PASS owner=/owner/hub/ owner");
console.log("PASS platform=/owner/hub/platform/ platform-only");
console.log(`PASS owner LIFF=${EXPECTED_OWNER_LIFF_ID}`);
