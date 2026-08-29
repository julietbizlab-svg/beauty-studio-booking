import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getOwnerAiWorkQueue } from "../src/d1-booking-review.js";
import { exportPaidCustomerData, exportPlatformCustomerData } from "../src/d1-customer-export.js";

var DIR = path.dirname(fileURLToPath(import.meta.url));
var ROOT = path.resolve(DIR, "../..");

function fakeDb(rows) {
  return {
    prepare: function (sql) {
      return {
        bind: function () {
          return {
            all: async function () {
              return { results: rows, sql: sql };
            }
          };
        }
      };
    }
  };
}

test("旗艦待辦集中分類審核、補答、補照片、待訂金與六小時逾時風險", async function () {
  var now = new Date("2026-07-26T00:00:00.000Z");
  var result = await getOwnerAiWorkQueue({
    TENANT_ID: "tenant-1",
    DB: fakeDb([
      {
        id: "b1", start_at: "2026-07-28T02:00:00.000Z", status: "pending_review",
        display_name: "小朱", service_name_snapshot: "基本美容",
        photo_requested: 1, surgery_history_requested: 0,
        disease_history_requested: 1, last_treatment_requested: 0, photo_count: 0
      },
      {
        id: "b2", start_at: "2026-07-29T02:00:00.000Z",
        status: "pending_customer_confirmation", display_name: "小美",
        service_name_snapshot: "全身保養", deposit_due_at: "2026-07-26T05:00:00.000Z",
        deposit_reported_at: "2026-07-26T01:00:00.000Z", photo_requested: 0,
        surgery_history_requested: 0, disease_history_requested: 0,
        last_treatment_requested: 0, photo_count: 2
      }
    ])
  }, now);
  assert.deepEqual(result.counts, {
    pendingReview: 1,
    questionRequested: 1,
    photoRequested: 1,
    pendingDeposit: 1,
    deadlineRisk: 1
  });
  assert.equal(result.items[0].bookingId, "b1");
  assert.equal("phone" in result.items[0], false);
  assert.equal("lineUserId" in result.items[0], false);
  assert.equal("diseaseHistory" in result.items[0], false);
});

test("付費客戶匯出預設 404 關閉，開啟後防試算表公式且不含 LINE／照片欄位", async function () {
  await assert.rejects(
    exportPaidCustomerData({ TENANT_ID: "t", DB: fakeDb([]) }),
    function (error) { return error.status === 404; }
  );
  var csv = await exportPaidCustomerData({
    TENANT_ID: "t",
    PAID_CUSTOMER_EXPORT_ENABLED: "true",
    DB: fakeDb([{
      customer_no: "C1", display_name: "=危險公式", mobile: "0912345678",
      birthday: "1990-01-01", notes: "一般備註", created_at: "2026-01-01",
      booking_count: 2, latest_booking_at: "2026-07-01"
    }])
  });
  assert.match(csv, /'=危險公式/);
  assert.doesNotMatch(csv, /LINE|object_key|token/i);
});

test("平台匯出只讀取指定一般工作室且不受業主付費開關影響", async function () {
  var calls = [];
  var db = {
    prepare: function (sql) {
      return {
        bind: function () {
          var binds = Array.from(arguments);
          calls.push({ sql: sql, binds: binds });
          return {
            first: async function () { return { id: binds[0] }; },
            all: async function () { return { results: [{
              customer_no: "C9", display_name: "王小美", mobile: "0912345678",
              birthday: "", notes: "", created_at: "2026-08-22",
              booking_count: 1, latest_booking_at: "2026-08-22"
            }] }; }
          };
        }
      };
    }
  };
  var csv = await exportPlatformCustomerData({
    TENANT_ID: "platform-tenant", DB: db
  }, "studio-tenant");
  assert.match(csv, /王小美/);
  assert.ok(calls.some(function (call) {
    return /WHERE c\.tenant_id = \?1/.test(call.sql) && call.binds[0] === "studio-tenant";
  }));
  await assert.rejects(exportPlatformCustomerData({
    TENANT_ID: "platform-tenant", DB: db
  }, "platform-tenant"), function (error) { return error.status === 400; });
});

test("業主端顯示集中待辦，但完全沒有付費匯出的可見入口", function () {
  var html = fs.readFileSync(path.join(ROOT, "owner-admin/index.html"), "utf8");
  var app = fs.readFileSync(path.join(ROOT, "owner-admin/js/app.js"), "utf8");
  var api = fs.readFileSync(path.join(ROOT, "owner-admin/js/api.js"), "utf8");
  assert.match(html, /優先待辦工作台/);
  assert.match(html, /待評估、待審核、待補答、待補照片、待訂金與即將逾時/);
  assert.match(api, /\/api\/owner\/ai\/work-queue/);
  assert.match(app, /data-work-queue-filter/);
  assert.match(app, /aria-pressed/);
  assert.match(app, /aiWorkQueueFilter === selected \? "all" : selected/);
  assert.match(app, /visibleItems = aiWorkQueueFilter === "pendingAssessment"/);
  assert.match(app, /pendingAssessment/);
  assert.match(app, /item\.status !== "approved"/);
  assert.match(app, /items\.filter\(isPendingAssessment\)/);
  assert.match(app, /data-work-queue-assessment/);
  assert.match(app, /data-assessment-card/);
  assert.match(app, /只有業主已通知客人補答的案件會列在這裡/);
  assert.doesNotMatch(html + app + api, /data-export|PAID_CUSTOMER_EXPORT_ENABLED|客戶資料匯出/);
});
