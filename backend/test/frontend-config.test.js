/**
 * 前端 config.js hostname 環境切換測試（node:test ＋ assert，零依賴）
 *
 * 以假 window 執行 customer-ui／owner-admin／docs 四份 config.js，
 * 驗證：
 * - 精確 juliet-studio.pages.dev → v2-production Worker
 * - preview 子網域 → v2-test Worker
 * - 其他 hostname 維持 Demo v1
 * - 四份檔案行為一致（靜態副本）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

var repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

var CONFIG_FILES = [
  "customer-ui/js/config.js",
  "owner-admin/js/config.js",
  "docs/js/config.js",
  "docs/owner/js/config.js"
];

var V2_PRODUCTION_API =
  "https://beauty-studio-api-v2-production.gosu-chill-book.workers.dev";
var V2_TEST_API =
  "https://beauty-studio-api-v2-test.gosu-chill-book.workers.dev";
var V2_PRODUCTION_LIFF_ID = "2010530394-orSKMGcU";
var V2_PRODUCTION_OWNER_LIFF_ID = "2010530394-zDbXbhXT";
var V2_TEST_LIFF_ID = "2010530394-QcklvIHd";
var V2_TEST_OWNER_LIFF_ID = "2010530394-TTtQkgne";
var V2_TEST_OWNER_HUB_LIFF_ID = "2010868233-3ziIABwR";

function roleForFile(file) {
  return /owner/.test(file) ? "owner" : "customer";
}

function v2Config(
  hostname, apiBaseUrl, customerLiffId, ownerLiffId,
  role, tier, label, environment
) {
  var liffId = role === "owner" ? ownerLiffId : customerLiffId;
  var pagesHostname = environment === "v2-test"
    ? "v2-test.juliet-studio.pages.dev" : hostname;
  return {
    APP_TITLE: environment === "v2-test"
      ? (role === "owner"
        ? "茱麗葉工作室｜" + (tier === "ai" ? "旗艦版" : "標準版") + "業主端"
        : "")
      : "",
    APP_ROLE: role,
    ROLE_LABEL: role === "owner" ? "業主端" : "客戶端",
    PRODUCT_TIER: tier,
    PRODUCT_TIER_LABEL: label,
    PRODUCT_KEY: environment + ":" + tier + ":" + role,
    SHOWCASE_CONTEXT: "",
    STUDIO_ENTRY_KEY: "",
    ENVIRONMENT: environment,
    LIFF_ID: liffId,
    CUSTOMER_LIFF_ID: customerLiffId,
    OWNER_LIFF_ID: ownerLiffId,
    CUSTOMER_LIFF_URL: "https://liff.line.me/" + customerLiffId,
    OWNER_LIFF_URL: "https://liff.line.me/" + ownerLiffId,
    API_BASE_URL: apiBaseUrl,
    CLAIM_ENABLED: true,
    CUSTOMER_IMPORT_ENABLED: tier === "ai",
    CUSTOMER_APP_URL: "https://" + pagesHostname + "/",
    OWNER_APP_URL: "https://" + pagesHostname + "/owner/hub/"
  };
}

function demoV1(role) {
  return {
    APP_TITLE: "",
    APP_ROLE: role,
    ROLE_LABEL: role === "owner" ? "業主端" : "客戶端",
    PRODUCT_TIER: "standard",
    PRODUCT_TIER_LABEL: "Demo 標準版｜不含 AI",
    PRODUCT_KEY: "demo-v1:standard:" + role,
    SHOWCASE_CONTEXT: "",
    STUDIO_ENTRY_KEY: "",
    ENVIRONMENT: "demo-v1",
    LIFF_ID: "2010678480-dKQ3afnw",
    CUSTOMER_LIFF_ID: "2010678480-dKQ3afnw",
    OWNER_LIFF_ID: "2010678480-dKQ3afnw",
    CUSTOMER_LIFF_URL: "https://liff.line.me/2010678480-dKQ3afnw",
    OWNER_LIFF_URL: "https://liff.line.me/2010678480-dKQ3afnw",
    API_BASE_URL: "https://beauty-studio-api.gosu-chill-book.workers.dev",
    CLAIM_ENABLED: false,
    CUSTOMER_IMPORT_ENABLED: false,
    CUSTOMER_APP_URL: null,
    OWNER_APP_URL: null
  };
}

function evalConfigWindow(relativePath, hostname, pathname, search, hash) {
  var code = readFileSync(join(repoRoot, relativePath), "utf8");
  var fakeWindow = {
    BEAUTY_APP_ROLE: roleForFile(relativePath),
    location: {
      hostname: hostname,
      pathname: pathname ||
        (roleForFile(relativePath) === "owner" ? "/owner/" : "/"),
      search: search || "",
      hash: hash || ""
    },
    history: {
      replaceState: function (_state, _title, url) { fakeWindow.replacedUrl = url; }
    }
  };
  new Function("window", code)(fakeWindow);
  return fakeWindow;
}

test("v2-test 專屬工作室入口使用 tenant LIFF ID", function () {
  var entryKey = "a".repeat(64);
  var tenantLiffId = "2011217307-krdMabXG";
  for (const file of CONFIG_FILES.filter(function (item) {
    return !/owner/.test(item);
  })) {
    var fakeWindow = evalConfigWindow(
      file,
      "v2-test.juliet-studio.pages.dev",
      "/studio/" + entryKey + "/",
      "?studio_entry=" + entryKey + "&tenant_liff_id=" + tenantLiffId,
      ""
    );
    assert.equal(fakeWindow.BEAUTY_CONFIG.LIFF_ID, tenantLiffId);
    assert.equal(fakeWindow.BEAUTY_CONFIG.CUSTOMER_LIFF_ID, tenantLiffId);
  }
});

test("v2-test 業主遷移邀請使用 tenant Owner LIFF ID", function () {
  var tenantOwnerLiffId = "2011217307-pdNvwLwJ";
  for (const file of CONFIG_FILES.filter(function (item) {
    return /owner/.test(item);
  })) {
    var fakeWindow = evalConfigWindow(
      file,
      "v2-test.juliet-studio.pages.dev",
      "/owner/hub/",
      "?tenant_liff_id=" + tenantOwnerLiffId,
      ""
    );
    assert.equal(fakeWindow.BEAUTY_CONFIG.LIFF_ID, tenantOwnerLiffId);
    assert.equal(fakeWindow.BEAUTY_CONFIG.OWNER_LIFF_ID, tenantOwnerLiffId);
  }
});

function evalConfig(relativePath, hostname, pathname, search, hash) {
  return evalConfigWindow(relativePath, hostname, pathname, search, hash).BEAUTY_CONFIG;
}

test("正式客戶端與業主端使用各自的 v2-production LIFF", function () {
  var hostname = "juliet-studio.pages.dev";
  ["customer-ui/js/config.js", "docs/js/config.js"].forEach(function (file) {
    assert.deepEqual(
      evalConfig(file, hostname),
      v2Config(
        hostname, V2_PRODUCTION_API,
        V2_PRODUCTION_LIFF_ID, V2_PRODUCTION_OWNER_LIFF_ID,
        "customer", "standard", "標準版｜不含 AI", "v2-production"
      ),
      file + " 應使用正式客戶 LIFF"
    );
  });
  ["owner-admin/js/config.js", "docs/owner/js/config.js"].forEach(function (file) {
    assert.deepEqual(
      evalConfig(file, hostname),
      v2Config(
        hostname, V2_PRODUCTION_API,
        V2_PRODUCTION_LIFF_ID, V2_PRODUCTION_OWNER_LIFF_ID,
        "owner", "standard", "標準版｜不含 AI", "v2-production"
      ),
      file + " 應使用直接指向 /owner/ 的正式業主 LIFF"
    );
  });
});

test("preview 子網域取得 v2-test 設定（四份 config 一致）", function () {
  var previewHostnames = [
    "preview-token.juliet-studio.pages.dev",
    "abc123.juliet-studio.pages.dev"
  ];
  CONFIG_FILES.forEach(function (file) {
    previewHostnames.forEach(function (hostname) {
      assert.deepEqual(
        evalConfig(file, hostname),
        v2Config(
          hostname, V2_TEST_API,
          V2_TEST_LIFF_ID, V2_TEST_OWNER_HUB_LIFF_ID,
          roleForFile(file), "ai", "旗艦版｜含 AI", "v2-test"
        ),
        file + " @ " + hostname + " 應取得 v2-test 設定"
      );
    });
  });
});

test("v2-test 四個方案入口分流，標準版不含 AI、旗艦版含 AI", function () {
  var hostname = "v2-test.juliet-studio.pages.dev";
  var cases = [
    {
      file: "docs/js/config.js",
      path: "/standard/customer/",
      role: "customer",
      tier: "standard",
      label: "標準版｜不含 AI",
      customerUrl: "https://" + hostname + "/standard/customer/",
      ownerUrl: "https://" + hostname + "/owner/hub/"
      , customerLiffId: V2_TEST_LIFF_ID
      , ownerLiffId: V2_TEST_OWNER_HUB_LIFF_ID
    },
    {
      file: "docs/owner/js/config.js",
      path: "/standard/owner/",
      role: "owner",
      tier: "standard",
      label: "標準版｜不含 AI",
      customerUrl: "https://" + hostname + "/standard/customer/",
      ownerUrl: "https://" + hostname + "/owner/hub/"
      , customerLiffId: V2_TEST_LIFF_ID
      , ownerLiffId: V2_TEST_OWNER_HUB_LIFF_ID
    },
    {
      file: "docs/js/config.js",
      path: "/flagship/customer/",
      role: "customer",
      tier: "ai",
      label: "旗艦版｜含 AI",
      customerUrl: "https://" + hostname + "/flagship/showcase/customer",
      ownerUrl: "https://" + hostname + "/owner/hub/"
      , customerLiffId: V2_TEST_LIFF_ID
      , ownerLiffId: V2_TEST_OWNER_HUB_LIFF_ID
    },
    {
      file: "docs/owner/js/config.js",
      path: "/flagship/owner/",
      role: "owner",
      tier: "ai",
      label: "旗艦版｜含 AI",
      customerUrl: "https://" + hostname + "/flagship/showcase/customer",
      ownerUrl: "https://" + hostname + "/owner/hub/"
      , customerLiffId: V2_TEST_LIFF_ID
      , ownerLiffId: V2_TEST_OWNER_HUB_LIFF_ID
    }
  ];

  cases.forEach(function (item) {
    var config = evalConfig(item.file, hostname, item.path);
    assert.equal(config.APP_ROLE, item.role);
    assert.equal(
      config.APP_TITLE,
      item.role === "owner"
        ? "茱麗葉工作室｜" + (item.tier === "ai" ? "旗艦版" : "標準版") + "業主端"
        : ""
    );
    assert.equal(config.PRODUCT_TIER, item.tier);
    assert.equal(config.CUSTOMER_IMPORT_ENABLED, item.tier === "ai");
    assert.equal(config.PRODUCT_TIER_LABEL, item.label);
    assert.equal(config.CUSTOMER_APP_URL, item.customerUrl);
    assert.equal(config.OWNER_APP_URL, item.ownerUrl);
    assert.equal(config.CUSTOMER_LIFF_ID, item.customerLiffId);
    assert.equal(config.OWNER_LIFF_ID, item.ownerLiffId);
    assert.equal(
      config.LIFF_ID,
      item.role === "owner" ? item.ownerLiffId : item.customerLiffId
    );
    assert.equal(config.API_BASE_URL, V2_TEST_API);
    assert.equal(
      config.SHOWCASE_CONTEXT,
      item.path === "/standard/customer/" ? "standard" : ""
    );
  });
});

test("v2-test 業主中心與獨立平台中心使用同一個正確業主 LIFF", function () {
  ["owner-admin/js/config.js", "docs/owner/js/config.js"].forEach(function (file) {
    ["/owner/hub/", "/owner/hub/platform/"].forEach(function (pathname) {
      var config = evalConfig(
        file,
        "v2-test.juliet-studio.pages.dev",
        pathname
      );
      assert.equal(config.APP_ROLE, "owner");
      assert.equal(config.LIFF_ID, V2_TEST_OWNER_HUB_LIFF_ID);
      assert.equal(config.OWNER_LIFF_ID, V2_TEST_OWNER_HUB_LIFF_ID);
      assert.equal(
        config.OWNER_LIFF_URL,
        "https://liff.line.me/" + V2_TEST_OWNER_HUB_LIFF_ID
      );
    });
  });
});

test("v2-test 舊入口與斜線差異以 replaceState 靜默統一，不新增 HTTP 跳轉", function () {
  var hostname = "v2-test.juliet-studio.pages.dev";
  [
    ["docs/js/config.js", "/standard/customer", "/standard/customer/"],
    ["docs/js/config.js", "/flagship/customer/", "/flagship/showcase/customer"],
    ["docs/js/config.js", "/flagship/showcase/customer/", "/flagship/showcase/customer"],
    ["docs/owner/js/config.js", "/standard/owner/", "/owner/hub/"],
    ["docs/owner/js/config.js", "/flagship/owner", "/owner/hub/"],
    ["docs/owner/js/config.js", "/owner", "/owner/hub/"],
    ["docs/owner/js/config.js", "/owner/hub/platform", "/owner/hub/platform/"]
  ].forEach(function (item) {
    var evaluated = evalConfigWindow(item[0], hostname, item[1], "?keep=1", "#section");
    assert.equal(evaluated.replacedUrl, item[2] + "?keep=1#section");
  });
});

test("Pages 專屬部署網址產生的應用連結固定使用 v2-test alias", function () {
  var config = evalConfig(
    "docs/js/config.js",
    "a45ba000.juliet-studio.pages.dev",
    "/standard/customer/"
  );
  assert.equal(config.CUSTOMER_APP_URL,
    "https://v2-test.juliet-studio.pages.dev/standard/customer/");
  assert.equal(config.OWNER_APP_URL,
    "https://v2-test.juliet-studio.pages.dev/owner/hub/");
});

test("v2-test 新 LIFF 在既有 /owner/ Endpoint 仍自動辨識業主管理中心", function () {
  ["owner-admin/js/config.js", "docs/owner/js/config.js"].forEach(function (file) {
    var byChannel = evalConfig(
      file,
      "v2-test.juliet-studio.pages.dev",
      "/owner/",
      "?liffClientId=2010868233"
    );
    assert.equal(byChannel.LIFF_ID, V2_TEST_OWNER_HUB_LIFF_ID);

    var byInvite = evalConfig(
      file,
      "v2-test.juliet-studio.pages.dev",
      "/owner/",
      "",
      "#owner_invite=" + "a".repeat(64)
    );
    assert.equal(byInvite.LIFF_ID, V2_TEST_OWNER_HUB_LIFF_ID);
  });
});

test("紋繡旗艦客戶展示使用專屬預約平台標題", function () {
  ["customer-ui/js/config.js", "docs/js/config.js"].forEach(function (file) {
    var config = evalConfig(
      file,
      "v2-test.juliet-studio.pages.dev",
      "/flagship/showcase/customer"
    );
    assert.equal(config.APP_TITLE, "紋繡客戶專屬預約平台");
    assert.equal(config.SHOWCASE_CONTEXT, "flagship");
  });
});

test("客戶端載入 tenant 設定後以業主店名覆蓋產品展示標題", function () {
  ["customer-ui/js/app.js", "docs/js/app.js"].forEach(function (file) {
    var app = readFileSync(join(repoRoot, file), "utf8");
    assert.match(app, /els\.brand\.textContent = brandName \|\| appTitle \|\| "工作室"/);
    assert.match(app, /document\.title = brandName;/);
    assert.doesNotMatch(app, /document\.title = brandName \+ "｜線上預約"/);
  });
});

test("標準客戶入口帶 standard showcase context", function () {
  ["customer-ui/js/config.js", "docs/js/config.js"].forEach(function (file) {
    var config = evalConfig(
      file,
      "v2-test.juliet-studio.pages.dev",
      "/standard/customer/"
    );
    assert.equal(config.SHOWCASE_CONTEXT, "standard");
    assert.equal(config.CUSTOMER_LIFF_ID, V2_TEST_LIFF_ID);
    assert.equal(config.PRODUCT_TIER, "standard");
    assert.equal(config.CUSTOMER_IMPORT_ENABLED, false);
  });
});

test("客戶頁與業主頁都不顯示系統角色或方案文字／色塊", function () {
  var customerHtml = readFileSync(join(repoRoot, "customer-ui/index.html"), "utf8");
  var ownerHtml = readFileSync(join(repoRoot, "owner-admin/index.html"), "utf8");
  assert.doesNotMatch(customerHtml, /product-identity|product-role|product-tier-label/);
  assert.doesNotMatch(customerHtml, />客戶端</);
  assert.doesNotMatch(ownerHtml, /product-identity|product-role|product-tier-label/);
});

test("正式與 preview 的 v2 hostname 皆啟用 LINE 認領（Demo v1 一律停用）", function () {
  CONFIG_FILES.forEach(function (file) {
    assert.equal(
      evalConfig(file, "juliet-studio.pages.dev").CLAIM_ENABLED, true,
      file + " production hostname 應啟用認領"
    );
    assert.equal(
      evalConfig(file, "abc123.juliet-studio.pages.dev").CLAIM_ENABLED, true,
      file + " preview hostname 應啟用認領"
    );
    ["julietbizlab-svg.github.io", "localhost"].forEach(function (hostname) {
      var config = evalConfig(file, hostname);
      assert.equal(config.CLAIM_ENABLED, false, file + " @ " + hostname + " 不得啟用認領");
      assert.equal(config.CUSTOMER_APP_URL, null);
    });
  });
});

test("其他 hostname 維持 Demo v1 設定（四份 config 一致）", function () {
  var v1Hostnames = [
    "julietbizlab-svg.github.io",
    "localhost",
    "evil-juliet-studio.pages.dev",
    "juliet-studio.pages.dev.attacker.example"
  ];
  CONFIG_FILES.forEach(function (file) {
    v1Hostnames.forEach(function (hostname) {
      assert.deepEqual(
        evalConfig(file, hostname),
        demoV1(roleForFile(file)),
        file + " @ " + hostname + " 應維持 Demo v1 設定"
      );
    });
  });
});

test("customer-ui／docs 與 owner-admin／docs/owner 靜態 config 副本一致", function () {
  assert.equal(
    readFileSync(join(repoRoot, "customer-ui/js/config.js"), "utf8"),
    readFileSync(join(repoRoot, "docs/js/config.js"), "utf8")
  );
  assert.equal(
    readFileSync(join(repoRoot, "owner-admin/js/config.js"), "utf8"),
    readFileSync(join(repoRoot, "docs/owner/js/config.js"), "utf8")
  );
});

test("專屬工作室客戶路徑保留入口代碼並由每個 API request 帶給後端", function () {
  var key = "a".repeat(64);
  ["customer-ui/js/config.js", "docs/js/config.js"].forEach(function (file) {
    var config = evalConfig(file, "v2-test.juliet-studio.pages.dev", "/studio/" + key + "/");
    assert.equal(config.STUDIO_ENTRY_KEY, key);
    assert.equal(config.CUSTOMER_APP_URL,
      "https://v2-test.juliet-studio.pages.dev/studio/" + key + "/");
  });
  ["customer-ui/js/api.js", "docs/js/api.js"].forEach(function (file) {
    var api = readFileSync(join(repoRoot, file), "utf8");
    assert.match(api, /X-Beauty-Studio-Entry/);
    assert.match(api, /STUDIO_ENTRY_KEY/);
  });
  var worker = readFileSync(join(repoRoot, "docs/_worker.js"), "utf8");
  assert.match(worker, /studioCustomerEntry/);
});

test("LIFF 初始化前不讀取或改寫 liff.state", function () {
  ["customer-ui/js/config.js", "docs/js/config.js"].forEach(function (file) {
    var code = readFileSync(join(repoRoot, file), "utf8");
    assert.doesNotMatch(code, /get\("liff\.state"\)/);
    assert.doesNotMatch(code, /beauty-customer-studio-entry-path/);
  });
});

test("客戶 LIFF 在 init 完成後才從 liff.state 或 studio_entry 回復專屬路徑", function () {
  ["customer-ui/js/liff-init.js", "docs/js/liff-init.js"].forEach(function (file) {
    var code = readFileSync(join(repoRoot, file), "utf8");
    var initIndex = code.indexOf("await liff.init({");
    var restoreCallIndex = code.indexOf("if (restoreStudioEntryAfterInit()) return;");
    assert.ok(initIndex >= 0 && restoreCallIndex > initIndex, file + " 必須在 init 後回復路徑");
    assert.match(code, /window\.location\.pathname/);
    assert.match(code, /restoredPathMatch/);
    assert.match(code, /params\.get\("studio_entry"\)/);
    assert.match(code, /params\.get\("liff\.state"\)/);
    assert.match(code, /\^\\\/studio\\\/\(\[a-f0-9\]\{64\}\)/i);
  });
});

test("四份 config 不含 secrets／token／.dev.vars 內容", function () {
  CONFIG_FILES.forEach(function (file) {
    var code = readFileSync(join(repoRoot, file), "utf8");
    assert.ok(!/\.dev\.vars/.test(code), file + " 不得引用 .dev.vars");
    assert.ok(!/CHANNEL_SECRET|ACCESS_TOKEN|API_TOKEN|Bearer /i.test(code),
      file + " 不得含 secret／token 字樣");
    assert.ok(!/sk-[a-zA-Z0-9]{10,}/.test(code), file + " 不得含疑似密鑰");
  });
});

test("客戶與業主方案路徑均保留，業主權限仍由安全業主中心身分決定", function () {
  var redirects = readFileSync(join(repoRoot, "docs/_redirects"), "utf8");
  [
    "/standard/customer /index.html 200",
    "/standard/customer/ /index.html 200",
    "/flagship/customer /index.html 200",
    "/flagship/customer/ /index.html 200",
    "/flagship/showcase/customer /index.html 200",
  ].forEach(function (rule) {
    assert.ok(redirects.includes(rule), "缺少路徑規則：" + rule);
  });
  var worker = readFileSync(join(repoRoot, "docs/_worker.js"), "utf8");
  assert.match(worker, /legacyOwnerEntry/);
  assert.match(worker, /indexEntry/);
  assert.match(worker, /legacyOwnerEntry \|\| ownerEntry/);
  assert.match(worker, /flagshipCustomerEntry/);
  assert.match(worker, /studioCustomerEntry/);
  assert.match(worker, /showcase\\\/customer/);
  assert.doesNotMatch(worker, /Response\.redirect/);
  assert.match(worker, /owner\|owner\\\/hub/);
});

test("客戶端依路徑阻擋標準版 AI；業主端依已驗證訂閱能力阻擋", function () {
  var customerApp = readFileSync(join(repoRoot, "customer-ui/js/app.js"), "utf8");
  var ownerApp = readFileSync(join(repoRoot, "owner-admin/js/app.js"), "utf8");
  assert.match(
    customerApp,
    /PRODUCT_TIER !== "ai"[\s\S]*?els\.aiAssistant\.hidden = true;[\s\S]*?return;/
  );
  assert.match(
    ownerApp,
    /state\.ownerMembership\.features\.plan !== "flagship"[\s\S]*?aiFeatureEnabled = false;[\s\S]*?return false;/
  );
});
