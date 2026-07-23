/**
 * 預約／審核狀態機（Phase 1 單一來源）
 *
 * - internal status：DB bookings.status 實際值
 * - publicStatus：對外安全分類（cancelled 統一兩種取消）
 * - 非法轉換 fail closed；未知狀態 fail closed
 */

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  error.code = "INVALID_BOOKING_TRANSITION";
  return error;
}

/** DB 允許的全部 internal status（0009 擴充後） */
export var BOOKING_STATUSES = Object.freeze({
  DRAFT: "draft",
  HELD: "held",
  PENDING_REVIEW: "pending_review",
  PENDING_CUSTOMER_CONFIRMATION: "pending_customer_confirmation",
  CONFIRMED: "confirmed",
  COMPLETED: "completed",
  CANCELLED_BY_CUSTOMER: "cancelled_by_customer",
  CANCELLED_BY_STORE: "cancelled_by_store",
  EXPIRED: "expired",
  /** legacy：schema 預設，現有流程極少使用 */
  PENDING: "pending",
  CHECKED_IN: "checked_in",
  RESCHEDULED: "rescheduled",
  NO_SHOW: "no_show"
});

var S = BOOKING_STATUSES;

export var BOOKING_ACTORS = Object.freeze({
  CUSTOMER: "customer",
  STAFF: "staff",
  SYSTEM: "system"
});

var ALL_INTERNAL_STATUSES = Object.freeze([
  S.DRAFT,
  S.HELD,
  S.PENDING_REVIEW,
  S.PENDING_CUSTOMER_CONFIRMATION,
  S.CONFIRMED,
  S.COMPLETED,
  S.CANCELLED_BY_CUSTOMER,
  S.CANCELLED_BY_STORE,
  S.EXPIRED,
  S.PENDING,
  S.CHECKED_IN,
  S.RESCHEDULED,
  S.NO_SHOW
]);

var TERMINAL_STATUSES = Object.freeze([
  S.COMPLETED,
  S.CANCELLED_BY_CUSTOMER,
  S.CANCELLED_BY_STORE,
  S.EXPIRED,
  S.RESCHEDULED,
  S.NO_SHOW
]);

/** 唯一代表預約正式成立、對外語意為「已成立」的狀態 */
export var FORMALLY_CONFIRMED_STATUSES = Object.freeze([S.CONFIRMED]);

/**
 * legacy 空檔安全阻擋：在遠端資料盤點／轉換完成前，
 * 仍與 confirmed 一併占用時段，避免 double-book。
 */
export var LEGACY_SLOT_BLOCKING_STATUSES = Object.freeze([
  S.PENDING,
  S.CHECKED_IN
]);

/** 空檔查詢／重疊檢查 SQL 使用的全部阻擋狀態 */
export var SLOT_BLOCKING_STATUSES = Object.freeze([
  S.PENDING,
  S.CONFIRMED,
  S.CHECKED_IN
]);

/**
 * held 語意已定義；Phase 4 前無 hold 資料，不得占用正式時段。
 */
export var SLOT_HOLD_STATUSES = Object.freeze([S.HELD]);

/** legacy：舊版 cancel／notice 仍視為可取消的 active 狀態 */
export var LEGACY_CUSTOMER_CANCELLABLE_STATUSES = Object.freeze([
  S.PENDING,
  S.CHECKED_IN
]);

var CANCELLATION_STATUSES = Object.freeze([
  S.CANCELLED_BY_CUSTOMER,
  S.CANCELLED_BY_STORE
]);

/** actor → 允許寫入的取消 internal status */
export var CANCELLATION_TARGET_BY_ACTOR = Object.freeze({
  customer: S.CANCELLED_BY_CUSTOMER,
  staff: S.CANCELLED_BY_STORE
});

/** reason_code（寫入 status log／bookings） */
export var CANCELLATION_REASON_BY_STATUS = Object.freeze({
  cancelled_by_customer: "customer_cancelled",
  cancelled_by_store: "store_cancelled"
});

var STATUS_LABELS_ZH = Object.freeze({
  draft: "填寫中",
  held: "時段暫留",
  pending_review: "待人工審核",
  pending_customer_confirmation: "待客人確認",
  confirmed: "已確認",
  completed: "已完成",
  cancelled_by_customer: "已取消",
  cancelled_by_store: "已取消",
  expired: "已逾時",
  pending: "已確認",
  checked_in: "已確認",
  rescheduled: "已改期",
  no_show: "未到"
});

var PUBLIC_STATUS_BY_INTERNAL = Object.freeze({
  draft: "draft",
  held: "held",
  pending_review: "pending_review",
  pending_customer_confirmation: "pending_customer_confirmation",
  confirmed: "confirmed",
  completed: "completed",
  cancelled_by_customer: "cancelled",
  cancelled_by_store: "cancelled",
  expired: "expired",
  pending: "confirmed",
  checked_in: "confirmed",
  rescheduled: "rescheduled",
  no_show: "no_show"
});

var CANCELED_BY_ZH = Object.freeze({
  cancelled_by_customer: "客人",
  cancelled_by_store: "業主"
});

/**
 * 合法轉換白名單：from → { to: [actors] }
 * cancelled 以 actor 對應的 internal cancel status 表示。
 */
var TRANSITIONS = Object.freeze({
  draft: {
    held: ["customer", "system"],
    pending_review: ["customer"],
    expired: ["system"],
    cancelled_by_customer: ["customer"],
    cancelled_by_store: ["staff"]
  },
  held: {
    confirmed: ["customer", "staff", "system"],
    expired: ["system"],
    cancelled_by_customer: ["customer"],
    cancelled_by_store: ["staff"]
  },
  pending_review: {
    pending_customer_confirmation: ["staff"],
    cancelled_by_store: ["staff"]
  },
  pending_customer_confirmation: {
    confirmed: ["customer", "system"],
    expired: ["system"],
    cancelled_by_customer: ["customer"],
    cancelled_by_store: ["staff"]
  },
  confirmed: {
    checked_in: ["staff"],
    completed: ["staff"],
    cancelled_by_customer: ["customer"],
    cancelled_by_store: ["staff"],
    rescheduled: ["staff"],
    no_show: ["staff"]
  },
  completed: {},
  cancelled_by_customer: {},
  cancelled_by_store: {},
  expired: {},
  rescheduled: {},
  no_show: {},
  /** legacy：視同 confirmed 的可取消／完成路徑 */
  pending: {
    confirmed: ["customer", "staff", "system"],
    checked_in: ["staff"],
    completed: ["staff"],
    cancelled_by_customer: ["customer"],
    cancelled_by_store: ["staff"],
    rescheduled: ["staff"],
    no_show: ["staff"],
    expired: ["system"]
  },
  checked_in: {
    completed: ["staff"],
    cancelled_by_customer: ["customer"],
    cancelled_by_store: ["staff"],
    rescheduled: ["staff"],
    no_show: ["staff"]
  }
});

/** 客戶列表可見（含 no_show 唯讀顯示；仍排除 legacy rescheduled） */
export var CUSTOMER_VISIBLE_STATUSES = Object.freeze([
  S.DRAFT,
  S.HELD,
  S.PENDING_REVIEW,
  S.PENDING_CUSTOMER_CONFIRMATION,
  S.CONFIRMED,
  S.COMPLETED,
  S.CANCELLED_BY_CUSTOMER,
  S.CANCELLED_BY_STORE,
  S.EXPIRED,
  S.PENDING,
  S.CHECKED_IN,
  S.NO_SHOW
]);

/** 業主列表可見（同客戶；含 no_show，仍排除 rescheduled） */
export var OWNER_VISIBLE_STATUSES = CUSTOMER_VISIBLE_STATUSES;

/** 排序：已確認群組（含 legacy active + completed） */
export var CUSTOMER_CONFIRMED_GROUP_STATUSES = Object.freeze([
  S.PENDING,
  S.CONFIRMED,
  S.CHECKED_IN,
  S.COMPLETED
]);

export function isKnownBookingStatus(status) {
  return ALL_INTERNAL_STATUSES.indexOf(status) !== -1;
}

export function assertKnownBookingStatus(status) {
  if (!isKnownBookingStatus(status)) {
    throw makeError("未知的預約狀態", 500);
  }
}

export function isTerminalBookingStatus(status) {
  assertKnownBookingStatus(status);
  return TERMINAL_STATUSES.indexOf(status) !== -1;
}

export function isConfirmedBookingStatus(status) {
  return FORMALLY_CONFIRMED_STATUSES.indexOf(status) !== -1;
}

export function isSlotBlockingStatus(status) {
  if (!isKnownBookingStatus(status)) {
    return false;
  }
  return SLOT_BLOCKING_STATUSES.indexOf(status) !== -1;
}

export function isLegacySlotBlockingStatus(status) {
  return LEGACY_SLOT_BLOCKING_STATUSES.indexOf(status) !== -1;
}

export function isSlotHoldStatus(status) {
  return SLOT_HOLD_STATUSES.indexOf(status) !== -1;
}

export function occupiesFormalSlot(status) {
  return isSlotBlockingStatus(status);
}

export function isFormallyEstablishedBooking(status) {
  return isConfirmedBookingStatus(status);
}

export function getPublicStatus(status) {
  assertKnownBookingStatus(status);
  return PUBLIC_STATUS_BY_INTERNAL[status];
}

export function getStatusLabelZh(status) {
  assertKnownBookingStatus(status);
  return STATUS_LABELS_ZH[status];
}

export function getCancellationActorLabel(status) {
  return CANCELED_BY_ZH[status] || "";
}

export function isCancellationStatus(status) {
  return CANCELLATION_STATUSES.indexOf(status) !== -1;
}

export function buildStatusInClause(statuses) {
  var list = statuses || [];
  if (!list.length) {
    return "('')";
  }
  return "(" + list.map(function (s) {
    return "'" + String(s).replace(/'/g, "''") + "'";
  }).join(", ") + ")";
}

export var SLOT_BLOCKING_STATUS_SQL = buildStatusInClause(SLOT_BLOCKING_STATUSES);
export var CUSTOMER_VISIBLE_STATUS_SQL = buildStatusInClause(CUSTOMER_VISIBLE_STATUSES);
export var CUSTOMER_CONFIRMED_GROUP_SQL = buildStatusInClause(CUSTOMER_CONFIRMED_GROUP_STATUSES);

export function canTransition(fromStatus, toStatus, actor) {
  if (!isKnownBookingStatus(fromStatus) || !isKnownBookingStatus(toStatus)) {
    return false;
  }
  if (fromStatus === toStatus) {
    return false;
  }
  var fromMap = TRANSITIONS[fromStatus];
  if (!fromMap) {
    return false;
  }
  var allowedActors = fromMap[toStatus];
  if (!allowedActors || !allowedActors.length) {
    return false;
  }
  if (!actor) {
    return true;
  }
  return allowedActors.indexOf(actor) !== -1;
}

export function assertKnownActor(actor) {
  if (
    actor !== BOOKING_ACTORS.CUSTOMER &&
    actor !== BOOKING_ACTORS.STAFF &&
    actor !== BOOKING_ACTORS.SYSTEM
  ) {
    throw makeError("未知的操作者", 400);
  }
}

export function assertTransition(fromStatus, toStatus, actor) {
  assertKnownBookingStatus(fromStatus);
  assertKnownBookingStatus(toStatus);
  if (actor) {
    assertKnownActor(actor);
  }
  if (fromStatus === toStatus) {
    throw makeError("狀態未變更", 400);
  }
  if (!canTransition(fromStatus, toStatus, actor)) {
    throw makeError("不允許的預約狀態轉換", 400);
  }
}

export function canActorCancelToStatus(fromStatus, actor) {
  var target = CANCELLATION_TARGET_BY_ACTOR[actor];
  if (!target) {
    return false;
  }
  return canTransition(fromStatus, target, actor);
}

export function isCustomerCancellableStatus(status) {
  if (!isKnownBookingStatus(status)) {
    return false;
  }
  return canActorCancelToStatus(status, BOOKING_ACTORS.CUSTOMER);
}

export function isStaffCancellableStatus(status) {
  if (!isKnownBookingStatus(status)) {
    return false;
  }
  return canActorCancelToStatus(status, BOOKING_ACTORS.STAFF);
}

/**
 * 同狀態重複提交：回 true 表示無實質轉換。
 * 這不是成功冪等——assertTransition 會拒絕並且不寫 DB。
 */
export function isSameStatusTransition(fromStatus, toStatus) {
  return fromStatus === toStatus;
}

export function bookingStatusToLegacyApiLabel(status) {
  assertKnownBookingStatus(status);
  if (status === S.COMPLETED) {
    return "已確認";
  }
  if (isCancellationStatus(status)) {
    return "已取消";
  }
  if (
    status === S.CONFIRMED ||
    status === S.PENDING ||
    status === S.CHECKED_IN
  ) {
    return "已確認";
  }
  return STATUS_LABELS_ZH[status];
}

export function bookingStatusToDtoExtensions(status) {
  assertKnownBookingStatus(status);
  return {
    internalStatus: status,
    publicStatus: getPublicStatus(status),
    statusLabel: getStatusLabelZh(status),
    isConfirmed: isConfirmedBookingStatus(status),
    isTerminal: isTerminalBookingStatus(status),
    canCustomerCancel: isCustomerCancellableStatus(status),
    occupiesFormalSlot: isSlotBlockingStatus(status),
    isFormallyEstablished: isConfirmedBookingStatus(status)
  };
}

/** 供測試：列出 from 的所有合法 to（可選 actor 過濾） */
export function listAllowedTransitions(fromStatus, actor) {
  assertKnownBookingStatus(fromStatus);
  var fromMap = TRANSITIONS[fromStatus] || {};
  return Object.keys(fromMap).filter(function (toStatus) {
    if (!actor) {
      return true;
    }
    return fromMap[toStatus].indexOf(actor) !== -1;
  });
}

/** 業主 Phase 2 一般狀態操作 route／UI 明確白名單（不含取消） */
export var OWNER_NO_SHOW_REASON_CODE = "owner_no_show";

/** 業主改期：舊 booking confirmed → rescheduled 的固定 reason_code */
export var OWNER_RESCHEDULED_REASON_CODE = "owner_rescheduled";

var OWNER_GENERAL_STATUS_ROUTE_TARGETS = Object.freeze({
  confirmed: Object.freeze([S.CHECKED_IN, S.NO_SHOW]),
  checked_in: Object.freeze([S.COMPLETED]),
  pending: Object.freeze([S.CONFIRMED, S.CHECKED_IN])
});

/** 業主一般狀態操作 route／UI：Phase 2 明確白名單 */
export function listOwnerStaffTransitionTargets(fromStatus) {
  assertKnownBookingStatus(fromStatus);
  var targets = OWNER_GENERAL_STATUS_ROUTE_TARGETS[fromStatus];
  return targets ? targets.slice() : [];
}

export function canOwnerGeneralStatusRouteTransition(fromStatus, toStatus) {
  if (!isKnownBookingStatus(fromStatus) || !isKnownBookingStatus(toStatus)) {
    return false;
  }
  var allowed = OWNER_GENERAL_STATUS_ROUTE_TARGETS[fromStatus];
  if (!allowed) {
    return false;
  }
  return allowed.indexOf(toStatus) !== -1;
}

/**
 * no_show 僅允許預約開始時間已到（start_at <= now）。
 * 時間一律由伺服器傳入，不信任前端；以毫秒比較，不直接比 ISO 字串。
 */
export function assertOwnerNoShowStartAtReached(startAt, nowIso) {
  var startMillis = Date.parse(String(startAt || ""));
  var nowMillis = Date.parse(String(nowIso || ""));
  if (!Number.isFinite(startMillis) || !Number.isFinite(nowMillis)) {
    throw makeError("無法驗證預約時間", 400);
  }
  if (startMillis > nowMillis) {
    throw makeError("預約尚未開始，無法標記未到", 400);
  }
}

export function assertOwnerGeneralStatusRouteTransition(fromStatus, toStatus, options) {
  assertKnownBookingStatus(fromStatus);
  assertKnownBookingStatus(toStatus);
  if (isCancellationStatus(toStatus)) {
    throw makeError("請使用取消預約功能", 400);
  }
  if (!canOwnerGeneralStatusRouteTransition(fromStatus, toStatus)) {
    throw makeError("不允許的預約狀態轉換", 400);
  }
  if (toStatus === S.NO_SHOW) {
    assertOwnerNoShowStartAtReached(
      options && options.startAt,
      options && options.nowIso
    );
  }
}

/** 供測試：全部合法 (from, to, actor) 三元組 */
export function enumerateLegalTransitions() {
  var result = [];
  Object.keys(TRANSITIONS).forEach(function (fromStatus) {
    var toMap = TRANSITIONS[fromStatus];
    Object.keys(toMap).forEach(function (toStatus) {
      toMap[toStatus].forEach(function (actor) {
        result.push({ from: fromStatus, to: toStatus, actor: actor });
      });
    });
  });
  return result;
}

function collectCancellableStatuses(actor) {
  return ALL_INTERNAL_STATUSES.filter(function (status) {
    return canActorCancelToStatus(status, actor);
  });
}

export var CUSTOMER_CANCELLABLE_STATUSES = Object.freeze(
  collectCancellableStatuses(BOOKING_ACTORS.CUSTOMER)
);

export var STAFF_CANCELLABLE_STATUSES = Object.freeze(
  collectCancellableStatuses(BOOKING_ACTORS.STAFF)
);

export var CUSTOMER_CANCELLABLE_STATUS_SQL = buildStatusInClause(
  CUSTOMER_CANCELLABLE_STATUSES
);

export var STAFF_CANCELLABLE_STATUS_SQL = buildStatusInClause(
  STAFF_CANCELLABLE_STATUSES
);
