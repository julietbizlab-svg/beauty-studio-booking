/**
 * 預約／取消提前天數政策測試（node:test ＋ assert，零依賴）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseNoticeDays,
  validateNoticeDaysInput,
  computeCancellationDeadlineAt,
  meetsBookingMinNotice,
  evaluateCustomerCancelPermission,
  isSlotStartBookable,
  formatDeadlineTaipei,
  taipeiSlotStartToDate,
  MS_PER_NOTICE_DAY,
  FALLBACK_CANCELLATION_NOTICE_DAYS
} from "../src/booking-notice-policy.js";

function utc(iso) {
  return new Date(iso);
}

test("預設 parseNoticeDays 為 1 天", function () {
  assert.equal(parseNoticeDays(undefined), 1);
  assert.equal(parseNoticeDays(null), 1);
  assert.equal(parseNoticeDays(""), 1);
});

test("validateNoticeDaysInput 拒絕非整數、負數、超過 30、null、字串偽造", function () {
  assert.throws(function () { validateNoticeDaysInput(null, "測試"); }, /不可為空/);
  assert.throws(function () { validateNoticeDaysInput("abc", "測試"); }, /0～30/);
  assert.throws(function () { validateNoticeDaysInput(1.5, "測試"); }, /0～30/);
  assert.throws(function () { validateNoticeDaysInput(-1, "測試"); }, /0～30/);
  assert.throws(function () { validateNoticeDaysInput(31, "測試"); }, /0～30/);
  assert.throws(function () { validateNoticeDaysInput(true, "測試"); }, /0～30/);
});

test("設定 0 天可預約尚未開始的當日時段", function () {
  var now = utc("2026-07-20T01:00:00.000Z");
  assert.equal(
    isSlotStartBookable("2026-07-20", "14:00", 0, now),
    true,
    "當日下午時段在上午現在時間仍可預約"
  );
});

test("設定 0 天仍不可預約已開始或過去時段", function () {
  var now = utc("2026-07-20T06:00:00.000Z");
  assert.equal(isSlotStartBookable("2026-07-20", "13:00", 0, now), false,
    "台北 14:00 在 UTC 06:00 時已過去");
  assert.equal(meetsBookingMinNotice(
    taipeiSlotStartToDate("2026-07-19", "10:00").toISOString(), 0, now
  ), false);
});

test("設定 1 天：距離正好 24 小時可預約；23:59:59 不可", function () {
  var start = taipeiSlotStartToDate("2026-07-21", "14:00").toISOString();
  var exactly = utc(new Date(start).getTime() - MS_PER_NOTICE_DAY);
  var almost = utc(new Date(start).getTime() - MS_PER_NOTICE_DAY + 1);
  assert.equal(meetsBookingMinNotice(start, 1, exactly), true);
  assert.equal(meetsBookingMinNotice(start, 1, almost), false);
});

test("跨月、跨年邊界：精確天數 × 24h", function () {
  var start = taipeiSlotStartToDate("2027-01-01", "10:00").toISOString();
  var deadline = computeCancellationDeadlineAt(start, 2);
  var expected = new Date(new Date(start).getTime() - 2 * MS_PER_NOTICE_DAY).toISOString();
  assert.equal(deadline, expected);
  var decStart = taipeiSlotStartToDate("2026-12-31", "23:59").toISOString();
  assert.equal(
    meetsBookingMinNotice(decStart, 1, utc(new Date(decStart).getTime() - MS_PER_NOTICE_DAY)),
    true
  );
});

test("取消截止：正好在截止時間可取消；超過 1ms 不可", function () {
  var start = "2027-06-15T02:00:00.000Z";
  var deadline = computeCancellationDeadlineAt(start, 1);
  var atDeadline = utc(new Date(deadline).getTime());
  var afterDeadline = utc(new Date(deadline).getTime() + 1);
  var ok = evaluateCustomerCancelPermission(start, deadline, 1, atDeadline, "confirmed");
  var blocked = evaluateCustomerCancelPermission(start, deadline, 1, afterDeadline, "confirmed");
  assert.equal(ok.canCancel, true);
  assert.equal(blocked.canCancel, false);
  assert.equal(blocked.reasonCode, "past_cancellation_deadline");
});

test("已開始及已過期預約不可取消（無論設定是否為 0）", function () {
  var start = "2026-07-19T02:00:00.000Z";
  var now = utc("2026-07-20T00:00:00.000Z");
  var eval0 = evaluateCustomerCancelPermission(start, null, 0, now, "confirmed");
  var eval1 = evaluateCustomerCancelPermission(start, null, 1, now, "confirmed");
  assert.equal(eval0.canCancel, false);
  assert.equal(eval1.canCancel, false);
  assert.equal(eval0.reasonCode, "booking_started");
});

test("舊預約無快照時 fallback 固定 1 天，不使用目前 tenant 設定", function () {
  var start = "2027-08-10T04:00:00.000Z";
  var fallbackDeadline = computeCancellationDeadlineAt(start, FALLBACK_CANCELLATION_NOTICE_DAYS);
  var evalAt = evaluateCustomerCancelPermission(start, null, null, utc(fallbackDeadline), "confirmed");
  var evalAfter = evaluateCustomerCancelPermission(
    start, null, null, utc(new Date(fallbackDeadline).getTime() + 1), "confirmed"
  );
  assert.equal(evalAt.canCancel, true);
  assert.equal(evalAfter.canCancel, false);
});

test("formatDeadlineTaipei 使用 Asia/Taipei 顯示", function () {
  assert.equal(formatDeadlineTaipei("2026-07-20T16:00:00.000Z"), "2026-07-21 00:00");
});
