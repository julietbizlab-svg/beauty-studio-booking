import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

var root = join(import.meta.dirname, "../..");

for (const frontend of ["owner-admin", "docs/owner"]) {
  test(frontend + " 一般業主端不包含平台管理功能", function () {
    var html = readFileSync(join(root, frontend, "index.html"), "utf8");
    var app = readFileSync(join(root, frontend, "js/app.js"), "utf8");
    var liff = readFileSync(join(root, frontend, "js/liff-init.js"), "utf8");

    assert.doesNotMatch(html, /id="platform-provisioning"/);
    assert.doesNotMatch(html, /data-tab="platform"/);
    assert.doesNotMatch(app, /provisionOwnerStudio/);
    assert.match(html, /id="brand-name" readonly/);
    assert.doesNotMatch(app, /brandName:\s*els\.brandName/);
    assert.match(html, /id="owner-onboarding-studio-name"/);
    assert.match(html, /id="owner-onboarding-owner-name"/);
    assert.match(html, /id="owner-onboarding-account-confirm"/);
    assert.match(html, /id="owner-onboarding-terms-confirm"/);
    assert.match(html, /class="modal-overlay" id="owner-onboarding"/);
    assert.doesNotMatch(html, /class="modal-backdrop"/);
    assert.match(readFileSync(join(root, frontend, "css/style.css"), "utf8"),
      /\.modal-overlay\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);
    assert.match(html, /須由平台處理且屬付費服務/);
    assert.match(html, /href="terms\.html"/);
    assert.match(html, /href="privacy\.html"/);
    assert.match(liff, /studioName:\s*studioName/);
    assert.match(liff, /ownerName:\s*ownerName/);
    assert.match(liff, /accountBindingAccepted:\s*true/);
    assert.match(liff, /termsAccepted:\s*true/);
    assert.match(liff, /termsVersion:\s*"2026-08-06"/);
    assert.match(liff, /profileFromIdToken/);
    assert.match(liff, /if \(!profile\.userId\) \{\s*profile = await liff\.getProfile\(\)/);
    assert.match(app, /state\.ownerMembership\.features\.plan !== "flagship"/);
    assert.match(app, /await Promise\.all\(\[/);
  });
}

for (const frontend of ["platform-admin", "docs/platform"]) {
  test(frontend + " 獨立平台中心要求專屬權限與本人確認", function () {
    var html = readFileSync(join(root, frontend, "index.html"), "utf8");
    var app = readFileSync(join(root, frontend, "platform.js"), "utf8");
    var css = readFileSync(join(root, frontend, "platform.css"), "utf8");

    assert.match(html, /僅限平台負責人/);
    assert.match(html, /id="platform-approval-confirm"/);
    assert.match(html, /標準版（美甲／美睫／睫毛嫁接／睫毛提升／翹睫管理）/);
    assert.match(html, /標準版免費試用 14 天/);
    assert.match(html, /旗艦版免費試用 14 天/);
    assert.match(html, /旗艦版（霧眉／霧唇）/);
    assert.match(html, /核准試用並產生一次性邀請/);
    assert.match(app, /我已確認對方完成付款，並核准開通所選方案/);
    assert.match(app, /確認付款並產生一次性邀請/);
    assert.match(app, /標準版適用美甲、美睫／睫毛嫁接與睫毛提升／翹睫管理，不啟用新客評估問卷/);
    assert.match(app, /旗艦版適用霧眉與霧唇/);
    assert.match(app, /轉正式標準版/);
    assert.match(app, /例外延長試用 14 天/);
    assert.match(app, /剩餘.*天/);
    assert.match(app, /轉為標準版後將停用霧眉／霧唇評估、客戶匯入、客戶 AI 與業主 AI/);
    assert.doesNotMatch(html, /id="platform-studio-name"/);
    assert.doesNotMatch(html, /id="platform-owner-name"/);
    assert.match(html, /名稱只有你能更正/);
    assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
    assert.match(app, /getPlatformCapability\(\)/);
    assert.match(app, /capability\.enabled !== true/);
    assert.match(app, /!approval\.checked/);
    assert.match(app, /updatePlatformStudioIdentity/);
    assert.match(app, /managePlatformStudioSubscription/);
    assert.match(app, /平台管理主帳號|platformRootCard/);
    assert.match(app, /ownerStudios/);
    assert.match(app, /if \(item\.isPlatformStudio\) return false/);
    assert.match(app, /不改 tenant ID、staff ID 或 LINE 綁定/);
    assert.match(app, /已確認付款/);
    assert.match(app, /降級只會在目前租期結束時停用霧眉／霧唇評估、匯入與 AI 能力，不刪除既有資料/);
    assert.match(app, /navigator\.clipboard\.writeText\(input\.value\)/);
    assert.doesNotMatch(html, /雙版本驗收/);
    assert.doesNotMatch(html, /platform-acceptance/);
    assert.doesNotMatch(app, /ensurePlatformAcceptanceStudios/);
    assert.doesNotMatch(app, /進入米色版驗收/);
    assert.doesNotMatch(app, /進入藕粉版驗收/);
    assert.doesNotMatch(app, /prepareAcceptanceStudios/);
    assert.doesNotMatch(css, /\.platform-acceptance/);

    // 手機版資訊架構：摘要、篩選、精簡卡、單一展開、預設收合
    assert.match(html, /id="platform-root-account"/);
    assert.match(html, /平台管理主帳號/);
    assert.match(html, /系統管理主帳號，請勿刪除、改綁 LINE 或提供給其他業主/);
    assert.match(html, /id="platform-status-summary"/);
    assert.match(html, /id="platform-studio-search"/);
    assert.match(html, /id="platform-plan-filter"/);
    assert.match(html, /data-status-filter="pending"/);
    assert.match(html, /data-status-filter="bound"/);
    assert.match(html, /data-status-filter="subscription"/);
    assert.match(html, /id="platform-provision-details"/);
    assert.doesNotMatch(html, /<details[^>]*open/);
    assert.match(html, /platform\.js\?v=20260824001/);
    assert.match(html, /platform\.css\?v=20260823004/);
    assert.match(html, /owner\/js\/api\.js\?v=20260822002/);
    assert.match(app, /expandedTenantId/);
    assert.match(app, /statusFilter/);
    assert.match(app, /planFilter/);
    assert.match(app, /platform-badge/);
    assert.match(app, /待開通/);
    assert.match(app, /正式租用/);
    assert.match(app, /已開通/);
    assert.match(app, /即將到期/);
    assert.match(app, /邀請已過期/);
    assert.match(app, /isInviteExpired/);
    assert.match(app, /data\.summaryStatus|dataset\.summaryStatus/);
    assert.match(app, /function setStatusFilter/);
    assert.match(app, /statusFilter === "trial"/);
    assert.match(app, /statusFilter === "active"/);
    assert.match(app, /statusFilter === "expiring"/);
    assert.match(app, /function customerEntryControls/);
    assert.match(app, /建立客戶入口/);
    assert.match(app, /CUSTOMER_LIFF_URL/);
    assert.match(app, /customerEntryUrl\(item\.customerEntryKey, item\.customerLiffId\)/);
    assert.match(app, /"https:\/\/liff\.line\.me\/" \+ tenantLiffId/);
    assert.match(app, /studio_entry=/);
    assert.match(app, /if \(tenantLiffId\) return liffUrl/);
    assert.match(app, /\/studio\//);
    assert.match(app, /複製客戶入口/);
    assert.match(app, /ensurePlatformStudioCustomerEntry/);
    assert.match(app, /function customerExportControls/);
    assert.match(app, /function requestCustomerExportConfirmation/);
    assert.doesNotMatch(app, /確定匯出.*window\.confirm/);
    assert.match(app, /CSV 已準備好，請再按一次/);
    assert.match(app, /navigator\.share/);
    assert.match(app, /儲存／分享 CSV/);
    assert.match(app, /匯出客戶 CSV/);
    assert.match(app, /只匯出此工作室的客戶，不包含 LINE 識別碼或照片/);
    assert.match(app, /exportPlatformStudioCustomers/);
    assert.match(app, /safeCsvFileName/);
    assert.match(css, /\.platform-customer-entry-row/);
    assert.match(css, /\.platform-summary-chip\.is-active/);
    assert.match(app, /重新產生邀請/);
    assert.match(app, /只會更新邀請，不會建立新工作室或改綁 LINE/);
    assert.match(app, /reissuePlatformOwnerInvite/);
    assert.match(app, /ownerStudios/);
    assert.match(app, /platformRootStudio/);
    assert.match(app, /platformRootCard/);
    assert.match(app, /item\.isPlatformStudio/);
    assert.match(app, /if \(item\.isPlatformStudio\) return false/);
    assert.match(app, /ownerStudios\(items\)\.forEach/);
    assert.match(app, /平台負責人顯示名稱/);
    assert.match(app, /不改 tenant ID、staff ID 或 LINE 綁定/);
    assert.doesNotMatch(app, /platformRootCard[\s\S]*subscriptionControls/);
    assert.doesNotMatch(app, /function platformRootCard[\s\S]*inviteReissueControls/);
    assert.doesNotMatch(app, /function platformRootCard[\s\S]*到期日/);
    assert.match(app, /收合管理/);
    assert.match(app, /makeBadge/);
    assert.match(app, /function lineReadinessBadge/);
    assert.match(app, /function lineReadinessControls/);
    assert.match(app, /LINE 已就緒/);
    assert.match(app, /LINE 未設定/);
    assert.match(app, /不顯示 token、secret、LIFF ID 或 route key/);
    assert.match(app, /studioState\.expandedTenantId === item\.tenantId \? "" : item\.tenantId/);
    assert.match(app, /setPlatformStudioAssessmentTemplate/);
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /\.platform-badge/);
    assert.match(css, /\.platform-badge--bound/);
    assert.match(css, /\.platform-root-account/);
    assert.match(css, /\.platform-root-warning/);
    assert.match(css, /\.platform-status-summary/);
    assert.match(css, /\.platform-studio-detail\[hidden\]/);
    assert.match(css, /\.platform-studio-card \{/);
    assert.match(css, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
    assert.match(css, /min-width:\s*0/);
    assert.match(css, /max-width:\s*100%/);
    assert.match(css, /input\[type="checkbox"\][\s\S]*width:\s*24px/);
    assert.doesNotMatch(css, /\.platform-subscription-controls input,\s*\n\.platform-subscription-controls select,\s*\n\.platform-studio-detail input \{[^}]*width:\s*100%/);
    assert.doesNotMatch(css, /appearance:\s*none/);
  });
}

test("owner api 提供平台重發業主邀請且兩端靜態副本一致", function () {
  ["owner-admin", "docs/owner"].forEach(function (frontend) {
    var api = readFileSync(join(root, frontend, "js/api.js"), "utf8");
    assert.match(api, /reissuePlatformOwnerInvite/);
    assert.match(api, /\/owner-invite/);
    assert.match(api, /ensurePlatformStudioCustomerEntry/);
    assert.match(api, /\/customer-entry/);
    assert.match(api, /exportPlatformStudioCustomers/);
    assert.match(api, /\/customers\.csv/);
  });
  assert.equal(
    readFileSync(join(root, "docs/owner/js/api.js"), "utf8"),
    readFileSync(join(root, "owner-admin/js/api.js"), "utf8"),
    "docs/owner/js/api.js 必須與 owner-admin 一致"
  );
});

test("platform-admin 與 docs/platform 靜態副本完全一致", function () {
  ["index.html", "platform.js", "platform.css"].forEach(function (file) {
    assert.equal(
      readFileSync(join(root, "docs/platform", file), "utf8"),
      readFileSync(join(root, "platform-admin", file), "utf8"),
      "docs/platform/" + file + " 必須與 platform-admin 一致"
    );
  });
});


test("Pages 將私密平台路徑導向獨立平台頁面", function () {
  var worker = readFileSync(join(root, "docs/_worker.js"), "utf8");
  assert.match(worker, /owner\\\/hub\\\/platform/);
  assert.match(worker, /platformEntry \? "\/platform\/"/);
});

for (const frontend of ["owner-admin", "docs/owner"]) {
  test(frontend + " 提供更名付費規範與隱私說明", function () {
    var terms = readFileSync(join(root, frontend, "terms.html"), "utf8");
    var privacy = readFileSync(join(root, frontend, "privacy.html"), "utf8");
    assert.match(terms, /更名或資料更正須由平台處理，屬付費服務/);
    assert.match(terms, /不得出售、出租、轉讓、共用、改綁/);
    assert.match(privacy, /LINE 登入識別/);
    assert.match(privacy, /名稱更正的服務費依合約/);
  });
}
