import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleBrowIntakeSop } from "../src/brow-intake-sop.js";

test("0021 建立可持續的霧眉 SOP session 與人工審核狀態", function () {
  var db = new DatabaseSync(":memory:");
  var root = join(import.meta.dirname, "..");
  db.exec(readFileSync(join(root, "migrations/0001_init_core.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/0021_brow_intake_sop.sql"), "utf8"));
  var columns = db.prepare("PRAGMA table_info(brow_intake_sessions)").all()
    .map(function (row) { return row.name; });
  ["id", "current_step", "answers_json", "manual_review_required", "booking_route",
    "health_consent_at", "submitted_at"].forEach(function (name) {
    assert.ok(columns.includes(name));
  });
});

function memoryEnv(options) {
  var session = null;
  var approvedAssessment = Boolean(options && options.approvedAssessment);
  var approvedBooking = Boolean(options && options.approvedBooking);
  return {
    TENANT_ID: "t1",
    BROW_INTAKE_NOW_ISO: "2026-08-07T15:00:00.000Z",
    get session() { return session; },
    DB: { prepare: function (sql) { return { bind: function () {
      var values = Array.from(arguments);
      return {
        first: async function () {
          if (/SELECT 1 AS approved WHERE EXISTS/.test(sql)) {
            return approvedAssessment || approvedBooking ? { approved: 1 } : null;
          }
          return /SELECT status,current_step/.test(sql) ? session : null;
        },
        run: async function () {
          if (/INSERT INTO brow_intake_sessions/.test(sql)) {
            session = { status: "active", current_step: values[3], answers_json: values[4],
              manual_review_required: 0, booking_route: "一般人工審核" };
          } else if (/SET current_step=/.test(sql)) {
            session.current_step = values[0]; session.answers_json = values[1];
            session.manual_review_required = values[2]; session.booking_route = values[3];
          } else if (/SET answers_json=/.test(sql)) {
            session.answers_json = values[0];
          } else if (/status='paused'/.test(sql)) session.status = "paused";
          else if (/status='active'/.test(sql)) session.status = "active";
          else if (/status='contact_manually'/.test(sql)) session.status = "contact_manually";
          else if (/status='pending_human_review'/.test(sql)) {
            session.status = "pending_human_review"; session.answers_json = values[0];
          }
          return { meta: { changes: 1 } };
        }
      };
    } }; } }
  };
}

test("我要改色會從舊眉狀況開始並逐題保存，不再回答最快時段", async function () {
  var env = memoryEnv();
  var start = await handleBrowIntakeSop(env, "U1", "我要改色");
  assert.match(start.message, /以前紋繡留下的顏色或框線/);
  assert.deepEqual(start.options.slice(0, 2), ["完全沒有", "有，但已經很淡"]);
  assert.equal(env.session.current_step, "old_brow_status");
  assert.equal(JSON.parse(env.session.answers_json).service_type, "舊眉改色或調整");

  var next = await handleBrowIntakeSop(env, "U1", "有，而且仍然明顯");
  assert.match(next.message, /最後一次施作/);
  assert.equal(env.session.current_step, "last_brow_procedure_date_range");
  assert.equal(JSON.parse(env.session.answers_json).old_brow_status, "有，而且仍然明顯");
});

test("SOP 一次只接受目前題目的選項，支援暫停與繼續", async function () {
  var env = memoryEnv();
  await handleBrowIntakeSop(env, "U2", "我想做霧眉");
  var invalid = await handleBrowIntakeSop(env, "U2", "隨便都可以");
  assert.match(invalid.message, /請選擇下列其中一項/);
  assert.equal(env.session.current_step, "service_type");
  await handleBrowIntakeSop(env, "U2", "暫停評估");
  assert.equal(env.session.status, "paused");
  var resumed = await handleBrowIntakeSop(env, "U2", "繼續評估");
  assert.match(resumed.message, /想諮詢哪一項服務/);
  assert.equal(env.session.status, "active");
});

test("霧眉一般問句不會擅自開始評估", async function () {
  var env = memoryEnv();
  var result = await handleBrowIntakeSop(
    env, "U-question", "第一次做霧眉，需要先準備什麼？"
  );
  assert.equal(result, null);
  assert.equal(env.session, null);
});

test("評估進行中的一般問句交回洽詢流程且不改變進度", async function () {
  var env = memoryEnv();
  await handleBrowIntakeSop(env, "U-active-question", "我想做霧眉");
  var originalStep = env.session.current_step;
  var result = await handleBrowIntakeSop(
    env, "U-active-question", "施作前需要先準備什麼？"
  );
  assert.equal(result, null);
  assert.equal(env.session.current_step, originalStep);
});

test("新版評估已核准者不會再建立舊霧眉新客評估", async function () {
  var env = memoryEnv({ approvedAssessment: true });
  var result = await handleBrowIntakeSop(env, "U-approved", "我想做霧眉");
  assert.equal(result, null);
  assert.equal(env.session, null);
});

test("LINE Provider 更換後仍依穩定客戶與核准預約避免重做評估", async function () {
  var env = memoryEnv({ approvedBooking: true });
  var result = await handleBrowIntakeSop(env, "U-new-provider", "我想做霧眉");
  assert.equal(result, null);
  assert.equal(env.session, null);
});

test("待補資料時按聯絡老師會轉為人工聯絡並建立待跟進洽詢", async function () {
  var env = memoryEnv();
  await handleBrowIntakeSop(env, "U-contact", "我想做霧眉");
  env.session.status = "need_more_information";

  var result = await handleBrowIntakeSop(env, "U-contact", "聯絡老師");

  assert.equal(env.session.status, "contact_manually");
  assert.deepEqual(result.options, []);
  assert.match(result.message, /已通知老師/);
  assert.equal(result.inquiry.question, "聯絡老師");
  assert.equal(result.inquiry.needsOwnerFollowUp, true);
  assert.match(result.inquiry.ownerSummary, /主動聯絡/);
});

test("客戶端會把後端 SOP options 渲染成逐題按鈕", function () {
  var app = readFileSync(join(import.meta.dirname, "../../customer-ui/js/app.js"), "utf8");
  var html = readFileSync(join(import.meta.dirname, "../../customer-ui/index.html"), "utf8");
  assert.match(app, /result\.options/);
  assert.match(app, /data-ai-answer-option/);
  assert.match(html, /js\/app\.js\?v=20260825003/);
});

test("0022 建立私有霧眉補照片資料與客戶上傳入口", function () {
  var db = new DatabaseSync(":memory:");
  var root = join(import.meta.dirname, "..");
  db.exec(readFileSync(join(root, "migrations/0001_init_core.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/0021_brow_intake_sop.sql"), "utf8"));
  db.exec(readFileSync(join(root, "migrations/0022_brow_intake_photos.sql"), "utf8"));
  var columns = db.prepare("PRAGMA table_info(brow_intake_sessions)").all().map(function (row) { return row.name; });
  assert.ok(columns.includes("photo_requested"));
  assert.ok(columns.includes("photo_request_note"));
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='brow_intake_photos'").get().count, 1);
  var html = readFileSync(join(import.meta.dirname, "../../customer-ui/index.html"), "utf8");
  var app = readFileSync(join(import.meta.dirname, "../../customer-ui/js/app.js"), "utf8");
  assert.match(html, /補充霧眉評估照片/);
  assert.match(html, /brow-photo-front/);
  assert.match(app, /uploadBrowIntakePhoto/);
});

test("重要行程不要求輸入日期，只讓客戶選擇是否在十天內", function () {
  var source = readFileSync(join(import.meta.dirname, "../src/brow-intake-sop.js"), "utf8");
  assert.match(source, /這項重要行程是否在 10 天內/);
  assert.match(source, /\["是，10天內", "否，超過10天", "不確定"\]/);
  assert.doesNotMatch(source, /重要行程日期是什麼時候/);
});

test("送出後固定顯示評估摘要並告知等待霧眉師回覆", async function () {
  var env = memoryEnv();
  await handleBrowIntakeSop(env, "U3", "我要改色");
  env.session.current_step = "confirm";
  env.session.answers_json = JSON.stringify({
    service_type: "舊眉改色或調整",
    old_brow_status: "有，而且仍然明顯",
    recent_treatments: "沒有",
    current_skin_condition: "沒有，皮膚狀況正常",
    health_or_medication_risk: "沒有",
    pregnancy_breastfeeding_status: "無",
    previous_adverse_reactions: "沒有",
    important_event_type: "沒有"
  });
  var submitted = await handleBrowIntakeSop(env, "U3", "確認送出");
  assert.match(submitted.message, /諮詢服務：舊眉改色或調整/);
  assert.match(submitted.message, /請等待霧眉師人工評估與回覆/);
  assert.equal(env.session.status, "pending_human_review");

  var viewedAgain = await handleBrowIntakeSop(env, "U3", "現在可以預約嗎");
  assert.match(viewedAgain.message, /資料已送交霧眉師人工評估/);
  assert.match(viewedAgain.message, /目前不需要再次填寫/);
});

test("業主端顯示霧眉逐題回答、系統整理與人工審核操作", function () {
  var html = readFileSync(join(import.meta.dirname, "../../owner-admin/index.html"), "utf8");
  var app = readFileSync(join(import.meta.dirname, "../../owner-admin/js/app.js"), "utf8");
  var api = readFileSync(join(import.meta.dirname, "../../owner-admin/js/api.js"), "utf8");
  assert.match(html, /新客評估案件/);
  assert.match(html, /平台為本工作室指定的新客評估/);
  assert.match(app, /查看客戶逐題回答/);
  assert.match(app, /核准並開放預約/);
  assert.match(app, /需要補資料/);
  assert.match(html, /brow-review-confirm-modal/);
  assert.match(html, /請告訴客戶需要補充什麼資料/);
  assert.doesNotMatch(app, /window\.confirm/);
  assert.match(app, /reviewAssessment\(id, status, message\)/);
  assert.match(app, /已更新：/);
  assert.match(api, /\/api\/owner\/assessments/);
  var repository = readFileSync(join(import.meta.dirname, "../src/d1-brow-intakes.js"), "utf8");
  assert.match(repository, /la\.display_name/);
  assert.doesNotMatch(repository, /la\.line_display_name/);
});

test("評估中詢問補色會先正確回答、保存問答，再返回原題", async function () {
  var env = memoryEnv();
  await handleBrowIntakeSop(env, "U4", "我要改色");
  env.session.current_step = "important_event_date";
  var result = await handleBrowIntakeSop(env, "U4", "什麼時候可以補色");
  assert.match(result.message, /霧眉後滿1個月可施作補色/);
  assert.match(result.message, /預約後由工作室為您確認/);
  assert.doesNotMatch(result.message, /第28天提醒|贈送補色/);
  assert.match(result.message, /接著繼續剛才的評估/);
  assert.match(result.message, /重要行程是否在 10 天內/);
  assert.equal(env.session.current_step, "important_event_date");
  assert.match(JSON.parse(env.session.answers_json).customer_questions[0], /什麼時候可以補色/);
  assert.deepEqual(result.inquiry, {
    question: "什麼時候可以補色",
    answer: "霧眉後滿1個月可施作補色，預約後由工作室為您確認。"
  });
});
