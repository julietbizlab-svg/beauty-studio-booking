/**
 * booking-state-machine 單元測試（Phase 1）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_STATUSES as S,
  BOOKING_ACTORS,
  FORMALLY_CONFIRMED_STATUSES,
  LEGACY_SLOT_BLOCKING_STATUSES,
  SLOT_BLOCKING_STATUSES,
  assertTransition,
  assertKnownBookingStatus,
  assertKnownActor,
  canTransition,
  enumerateLegalTransitions,
  getPublicStatus,
  getStatusLabelZh,
  isConfirmedBookingStatus,
  isSlotBlockingStatus,
  isLegacySlotBlockingStatus,
  isSameStatusTransition,
  isTerminalBookingStatus,
  isCustomerCancellableStatus,
  bookingStatusToLegacyApiLabel,
  bookingStatusToDtoExtensions,
  listOwnerStaffTransitionTargets,
  assertOwnerNoShowStartAtReached
} from "../src/booking-state-machine.js";

var ALL_STATUSES = [
  S.DRAFT, S.HELD, S.PENDING_REVIEW, S.PENDING_CUSTOMER_CONFIRMATION,
  S.CONFIRMED, S.COMPLETED, S.CANCELLED_BY_CUSTOMER, S.CANCELLED_BY_STORE,
  S.EXPIRED, S.PENDING, S.CHECKED_IN, S.RESCHEDULED, S.NO_SHOW
];

test("所有合法 internal status 均被辨識", function () {
  ALL_STATUSES.forEach(function (status) {
    assert.doesNotThrow(function () {
      assertKnownBookingStatus(status);
    });
  });
});

test("未知 status fail closed", function () {
  assert.throws(function () {
    assertKnownBookingStatus("hacked");
  }, /未知的預約狀態/);
  assert.equal(canTransition("hacked", S.CONFIRMED, BOOKING_ACTORS.STAFF), false);
});

test("未知 actor fail closed", function () {
  assert.throws(function () {
    assertKnownActor("hacker");
  }, /未知的操作者/);
  assert.throws(function () {
    assertTransition(S.CONFIRMED, S.COMPLETED, "hacker");
  }, /未知的操作者/);
});

test("每一條合法 transition 白名單可通過", function () {
  enumerateLegalTransitions().forEach(function (item) {
    assert.equal(
      canTransition(item.from, item.to, item.actor),
      true,
      item.from + "→" + item.to + " actor=" + item.actor
    );
    assert.doesNotThrow(function () {
      assertTransition(item.from, item.to, item.actor);
    });
  });
});

test("禁止 transition：pending_review→completed、held→completed、終態→confirmed", function () {
  var blocked = [
    [S.PENDING_REVIEW, S.COMPLETED],
    [S.HELD, S.COMPLETED],
    [S.CANCELLED_BY_CUSTOMER, S.CONFIRMED],
    [S.EXPIRED, S.CONFIRMED],
    [S.COMPLETED, S.CONFIRMED],
    [S.NO_SHOW, S.CONFIRMED],
    [S.DRAFT, S.CONFIRMED]
  ];
  blocked.forEach(function (pair) {
    assert.equal(canTransition(pair[0], pair[1], BOOKING_ACTORS.STAFF), false);
    assert.throws(function () {
      assertTransition(pair[0], pair[1], BOOKING_ACTORS.STAFF);
    }, /不允許的預約狀態轉換/);
  });
});

test("終態不可回到 active state", function () {
  var terminals = [
    S.COMPLETED, S.CANCELLED_BY_CUSTOMER, S.CANCELLED_BY_STORE,
    S.EXPIRED, S.RESCHEDULED, S.NO_SHOW
  ];
  var activeTargets = [S.DRAFT, S.HELD, S.CONFIRMED, S.PENDING_REVIEW];
  terminals.forEach(function (from) {
    activeTargets.forEach(function (to) {
      assert.equal(canTransition(from, to, BOOKING_ACTORS.STAFF), false);
    });
  });
});

test("confirmed 是唯一正式成立狀態", function () {
  assert.deepEqual(FORMALLY_CONFIRMED_STATUSES, [S.CONFIRMED]);
  ALL_STATUSES.forEach(function (status) {
    assert.equal(isConfirmedBookingStatus(status), status === S.CONFIRMED);
  });
  assert.equal(isConfirmedBookingStatus(S.PENDING), false);
  assert.equal(isConfirmedBookingStatus(S.CHECKED_IN), false);
});

test("staff 可 confirmed→checked_in、checked_in→completed、pending→confirmed／checked_in", function () {
  assert.equal(canTransition(S.CONFIRMED, S.CHECKED_IN, BOOKING_ACTORS.STAFF), true);
  assert.equal(canTransition(S.CHECKED_IN, S.COMPLETED, BOOKING_ACTORS.STAFF), true);
  assert.equal(canTransition(S.PENDING, S.CONFIRMED, BOOKING_ACTORS.STAFF), true);
  assert.equal(canTransition(S.PENDING, S.CHECKED_IN, BOOKING_ACTORS.STAFF), true);
});

test("listOwnerStaffTransitionTargets 僅含 Phase 2 一般操作白名單", function () {
  assert.deepEqual(listOwnerStaffTransitionTargets(S.CONFIRMED), [S.CHECKED_IN, S.NO_SHOW]);
  assert.deepEqual(listOwnerStaffTransitionTargets(S.CHECKED_IN), [S.COMPLETED]);
  assert.deepEqual(listOwnerStaffTransitionTargets(S.PENDING), [S.CONFIRMED, S.CHECKED_IN]);
  assert.deepEqual(listOwnerStaffTransitionTargets(S.DRAFT), []);
  assert.ok(listOwnerStaffTransitionTargets(S.CONFIRMED).indexOf(S.COMPLETED) === -1);
  assert.ok(listOwnerStaffTransitionTargets(S.CONFIRMED).indexOf(S.RESCHEDULED) === -1);
  assert.ok(listOwnerStaffTransitionTargets(S.CHECKED_IN).indexOf(S.NO_SHOW) === -1);
});

test("assertOwnerNoShowStartAtReached：毫秒比較與 fail closed", function () {
  assert.doesNotThrow(function () {
    assertOwnerNoShowStartAtReached(
      "2026-07-20T10:00:00.000Z",
      "2026-07-20T10:00:00.000Z"
    );
  }, "相同時間應允許");

  assert.doesNotThrow(function () {
    assertOwnerNoShowStartAtReached(
      "2026-07-20T18:00:00+08:00",
      "2026-07-20T10:00:00.000Z"
    );
  }, "不同合法 timezone offset 應按真實時間比較");

  assert.throws(
    function () {
      assertOwnerNoShowStartAtReached(
        "2026-07-20T10:00:01.000Z",
        "2026-07-20T10:00:00.000Z"
      );
    },
    function (error) {
      assert.equal(error.status, 400);
      assert.match(error.message, /尚未開始|無法標記未到/);
      return true;
    }
  );

  assert.throws(
    function () {
      assertOwnerNoShowStartAtReached("not-a-date", "2026-07-20T10:00:00.000Z");
    },
    function (error) {
      assert.equal(error.status, 400);
      assert.match(error.message, /無法驗證預約時間/);
      return true;
    }
  );

  assert.throws(
    function () {
      assertOwnerNoShowStartAtReached("2026-07-20T10:00:00.000Z", "invalid");
    },
    function (error) {
      assert.equal(error.status, 400);
      assert.match(error.message, /無法驗證預約時間/);
      return true;
    }
  );

  assert.throws(
    function () {
      assertOwnerNoShowStartAtReached("", "2026-07-20T10:00:00.000Z");
    },
    function (error) {
      assert.equal(error.status, 400);
      assert.match(error.message, /無法驗證預約時間/);
      return true;
    }
  );
});

test("legacy slot blocking 含 pending／checked_in／confirmed", function () {
  assert.deepEqual(SLOT_BLOCKING_STATUSES, [S.PENDING, S.CONFIRMED, S.CHECKED_IN]);
  assert.deepEqual(LEGACY_SLOT_BLOCKING_STATUSES, [S.PENDING, S.CHECKED_IN]);
  assert.equal(isSlotBlockingStatus(S.PENDING), true);
  assert.equal(isSlotBlockingStatus(S.CHECKED_IN), true);
  assert.equal(isSlotBlockingStatus(S.CONFIRMED), true);
  assert.equal(isLegacySlotBlockingStatus(S.PENDING), true);
  assert.equal(isLegacySlotBlockingStatus(S.CONFIRMED), false);
});

test("pending_review／draft／held 不占用空檔", function () {
  [S.PENDING_REVIEW, S.DRAFT, S.EXPIRED, S.HELD, S.PENDING_CUSTOMER_CONFIRMATION]
    .forEach(function (status) {
      assert.equal(isSlotBlockingStatus(status), false);
    });
});

test("cancellation publicStatus 統一 cancelled；保留 actor", function () {
  assert.equal(getPublicStatus(S.CANCELLED_BY_CUSTOMER), "cancelled");
  assert.equal(getPublicStatus(S.CANCELLED_BY_STORE), "cancelled");
  var custDto = bookingStatusToDtoExtensions(S.CANCELLED_BY_CUSTOMER);
  var storeDto = bookingStatusToDtoExtensions(S.CANCELLED_BY_STORE);
  assert.equal(custDto.publicStatus, "cancelled");
  assert.equal(storeDto.publicStatus, "cancelled");
});

test("rescheduled／no_show 為終態 legacy 策略", function () {
  assert.equal(isTerminalBookingStatus(S.RESCHEDULED), true);
  assert.equal(isTerminalBookingStatus(S.NO_SHOW), true);
  assert.equal(canTransition(S.RESCHEDULED, S.CONFIRMED, BOOKING_ACTORS.STAFF), false);
});

test("同狀態 isSameStatusTransition 為 true 但 assertTransition 拒絕", function () {
  assert.equal(isSameStatusTransition(S.CONFIRMED, S.CONFIRMED), true);
  assert.throws(function () {
    assertTransition(S.CONFIRMED, S.CONFIRMED, BOOKING_ACTORS.CUSTOMER);
  }, /狀態未變更/);
});

test("customer 不得執行 owner-only transition", function () {
  assert.equal(
    canTransition(S.PENDING_REVIEW, S.PENDING_CUSTOMER_CONFIRMATION, BOOKING_ACTORS.CUSTOMER),
    false
  );
  assert.equal(
    canTransition(S.CONFIRMED, S.COMPLETED, BOOKING_ACTORS.CUSTOMER),
    false
  );
});

test("legacy completed 對外 status 仍為已確認；statusLabel 為已完成", function () {
  assert.equal(bookingStatusToLegacyApiLabel(S.COMPLETED), "已確認");
  assert.equal(getStatusLabelZh(S.COMPLETED), "已完成");
});

test("未確認狀態 legacy status 不得顯示已確認", function () {
  assert.notEqual(bookingStatusToLegacyApiLabel(S.DRAFT), "已確認");
  assert.notEqual(bookingStatusToLegacyApiLabel(S.PENDING_REVIEW), "已確認");
  assert.equal(bookingStatusToLegacyApiLabel(S.CONFIRMED), "已確認");
});

test("customer 可取消 held／confirmed／legacy pending", function () {
  assert.equal(isCustomerCancellableStatus(S.HELD), true);
  assert.equal(isCustomerCancellableStatus(S.CONFIRMED), true);
  assert.equal(isCustomerCancellableStatus(S.PENDING), true);
  assert.equal(isCustomerCancellableStatus(S.PENDING_REVIEW), false);
});

test("DTO：pending 阻擋空檔但非正式成立", function () {
  var pendingDto = bookingStatusToDtoExtensions(S.PENDING);
  assert.equal(pendingDto.isConfirmed, false);
  assert.equal(pendingDto.isFormallyEstablished, false);
  assert.equal(pendingDto.occupiesFormalSlot, true);
  var confirmedDto = bookingStatusToDtoExtensions(S.CONFIRMED);
  assert.equal(confirmedDto.isConfirmed, true);
  assert.equal(confirmedDto.occupiesFormalSlot, true);
  var reviewDto = bookingStatusToDtoExtensions(S.PENDING_REVIEW);
  assert.equal(reviewDto.occupiesFormalSlot, false);
});
