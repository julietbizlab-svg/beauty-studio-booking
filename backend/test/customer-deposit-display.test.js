import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

var root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

["customer-ui/js/app.js", "docs/js/app.js"].forEach(function (relativePath) {
  test(relativePath + "：申請送出時不提早顯示付款帳號", function () {
    var source = readFileSync(join(root, relativePath), "utf8");
    assert.doesNotMatch(
      source,
      /renderDepositTransferBox\(state\.settings\);\s*showBookingSuccessModal/
    );
    assert.match(
      source,
      /工作室確認受理後才會開始 24 小時訂金期限/
    );
  });

  test(relativePath + "：只有待訂金預約顯示轉帳資料", function () {
    var source = readFileSync(join(root, relativePath), "utf8");
    assert.match(
      source,
      /var depositTransfer = isPendingDeposit[\s\S]*buildDepositTransferHtml/
    );
    assert.match(
      source,
      /b\.internalStatus === "pending_customer_confirmation"[\s\S]*wireDepositCopyButton/
    );
    assert.match(source, /轉帳後請記得通知工作室核對/);
    assert.match(source, /24 小時內完成訂金確認[\s\S]*釋放時段/);
  });

  test(relativePath + "：確認訂金後明確顯示已收金額與預約已保留", function () {
    var source = readFileSync(join(root, relativePath), "utf8");
    assert.match(source, /isConfirmed && b\.depositConfirmedAt/);
    assert.match(source, /booking-deposit-confirmed/);
    assert.match(source, /✓ 已收訂金/);
    assert.match(source, /bookingSettings\.depositAmount/);
    assert.match(source, /本次預約已保留/);
    assert.match(source, /確認時間：/);
  });

  test(relativePath + "：只有未來且真正 confirmed 的預約可變更時間", function () {
    var source = readFileSync(join(root, relativePath), "utf8");
    assert.match(source, /var isConfirmed = b\.internalStatus === "confirmed"/);
    assert.match(source, /bookingDateTimeKey\(b\) > getNowDateTimeKey\(\)/);
    assert.match(source, /var isCompleted = b\.internalStatus === "completed"/);
  });

  test(relativePath + "：設定尚未載入時預約清單不會讀取 null 銀行帳號", function () {
    var source = readFileSync(join(root, relativePath), "utf8");
    assert.match(source, /settings: \{\}/);
    assert.match(source, /var bookingSettings = state\.settings && typeof state\.settings === "object"/);
    assert.match(source, /buildDepositTransferHtml\(bookingSettings/);
    assert.match(source, /bookingSettings\.bankAccount/);
    assert.doesNotMatch(source, /state\.settings\.bankAccount/);
  });
});

test("LINE 成立通知明確告知已收到訂金金額與保留時段", function () {
  var notices = readFileSync(join(root, "backend/src/d1-notifications.js"), "utf8");
  assert.match(notices, /setting_key = 'deposit_amount'/);
  assert.match(notices, /工作室已確認收到訂金/);
  assert.match(notices, /預約時段已為您保留/);
});

test("客戶端實際載入的版本化 CSS 含已收訂金信任提示", function () {
  ["customer-ui", "docs"].forEach(function (base) {
    var html = readFileSync(join(root, base, "index.html"), "utf8");
    var css = readFileSync(join(root, base, "css/style.css"), "utf8");
    assert.match(html, /css\/style\.css\?v=20260825002/);
    assert.match(html, /js\/app\.js\?v=20260825003/);
    assert.match(css, /\.booking-deposit-confirmed/);
  });
});

test("預約卡顯示服務費用、已收訂金與到店應付，免費補色顯示雅緻赴約提醒", function () {
  ["customer-ui/js/app.js", "docs/js/app.js"].forEach(function (relativePath) {
    var source = readFileSync(join(root, relativePath), "utf8");
    assert.match(source, /服務費用/);
    assert.doesNotMatch(source, /服務原價/);
    assert.match(source, /到店應付/);
    assert.match(source, /本次為免費補色・免收訂金/);
    assert.match(source, /敬請準時赴約/);
  });
});

test("標準版與旗艦版共用：已確認訂金改顯示變更時間並通知業主", function () {
  var app = readFileSync(join(root, "customer-ui/js/app.js"), "utf8");
  var api = readFileSync(join(root, "customer-ui/js/api.js"), "utf8");
  var html = readFileSync(join(root, "customer-ui/index.html"), "utf8");
  var repo = readFileSync(join(root, "backend/src/d1-repository.js"), "utf8");
  var notices = readFileSync(join(root, "backend/src/d1-notifications.js"), "utf8");
  assert.match(app, /isConfirmed && b\.depositConfirmedAt[\s\S]*變更時間/);
  assert.match(app, /requestBookingReschedule/);
  assert.match(api, /reschedule-request/);
  assert.match(html, /選擇希望變更的時間/);
  assert.match(html, /customer-reschedule-calendar-grid/);
  assert.match(html, /業主開放的可預約時段/);
  assert.doesNotMatch(html, /id="customer-reschedule-(?:date|time)"/);
  assert.match(app, /getSlotsForMonth\(month, customerRescheduleState\.serviceId\)/);
  assert.match(app, /getSlots\(date, customerRescheduleState\.serviceId\)/);
  assert.match(app, /summary\.bookable/);
  assert.match(repo, /deposit_confirmed_reschedule_required/);
  assert.match(repo, /paid_booking_reschedule_requested/);
  assert.match(repo, /b\.status='confirmed' AND b\.start_at>\?4/);
  assert.match(repo, /available\.indexOf\(time\) === -1/);
  assert.match(repo, /此時段目前不可預約/);
  assert.match(notices, /已確認訂金的客戶提出變更時間需求/);
  assert.match(notices, /staff_line_accounts/);
});

test("客戶改期視窗：返回與送出事件在初始化時綁定，不依賴取消視窗", function () {
  var app = readFileSync(join(root, "customer-ui/js/app.js"), "utf8");
  var hideCancelBody = app.match(/function hideCancelConfirmModal\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(hideCancelBody);
  assert.doesNotMatch(hideCancelBody[0], /customerReschedule(?:Submit|Close)\.addEventListener/);
  assert.match(app, /customerRescheduleClose\.addEventListener\("click", closeCustomerRescheduleModal\)/);
  assert.match(app, /customerRescheduleSubmit\.addEventListener\("click", submitCustomerRescheduleRequest\)/);
  assert.match(
    app,
    /event\.target === els\.customerRescheduleModal[\s\S]*closeCustomerRescheduleModal\(\)/
  );
});
