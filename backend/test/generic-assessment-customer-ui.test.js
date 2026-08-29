import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const html = readFileSync(join(root, "customer-ui/index.html"), "utf8");
const app = readFileSync(join(root, "customer-ui/js/app.js"), "utf8");
const api = readFileSync(join(root, "customer-ui/js/api.js"), "utf8");
const css = readFileSync(join(root, "customer-ui/css/style.css"), "utf8");

test("客戶只看到平台指定的一份評估，不可自行選霧眉或霧唇", () => {
  assert.match(html, /id="assessment-start"/);
  assert.doesNotMatch(html, /data-assessment-start="brow_new_client"/);
  assert.doesNotMatch(html, /data-assessment-start="lip_blush_new_client"/);
  assert.match(api, /getAssessmentTemplate/);
  assert.match(app, /configured\.code/);
});

test("客戶端支援單選、複選完成選擇、日期與私有照片上傳", () => {
  assert.match(app, /question\.type === "multiple"/);
  assert.match(app, /完成選擇/);
  assert.match(app, /question\.type === "date"/);
  assert.match(app, /question\.type === "photo"/);
  assert.match(api, /uploadAssessmentPhoto/);
  assert.match(api, /Authorization/);
});

test("照片題隱藏日期欄位，日期題仍可獨立顯示", () => {
  assert.match(css, /#assessment-date\[hidden\],[\s\S]*?#assessment-photo\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(app, /assessmentDate\.hidden = question\.type !== "date"/);
  assert.match(app, /assessmentPhoto\.hidden = question\.type !== "photo"/);
});

test("客戶端不顯示適合施作或 AI 核准字樣", () => {
  const assessmentBlock = html.slice(html.indexOf("assessment-panel"), html.indexOf("brow-photo-upload"));
  assert.doesNotMatch(assessmentBlock, /適合施作|不適合施作|AI 核准/);
  assert.match(assessmentBlock, /老師人工審核/);
});

test("客戶流程固定為基本資料、選服務、問卷人工審核、再選日期時段", () => {
  const profile = html.indexOf("步驟 1：填寫基本資料");
  const service = html.indexOf("步驟 2：選擇服務項目");
  const assessment = html.indexOf("步驟 3：填寫新客評估");
  const date = html.indexOf("步驟 4：選擇日期");
  const time = html.indexOf("步驟 5：選擇時段");
  assert.ok(profile < service && service < assessment && assessment < date && date < time);
  assert.match(html, /id="booking-flow" hidden/);
  assert.match(app, /assessmentState\.status !== "approved"/);
  assert.match(api, /saveCustomerMe/);
  assert.match(api, /method: "PATCH"/);
  assert.match(html, /id="profile-save">儲存資料</);
  assert.doesNotMatch(html, /儲存資料並進行評估/);
  const saveFunction = app.match(/async function saveCustomerProfile\(\) \{[\s\S]*?\n  \}/);
  assert.ok(saveFunction);
  assert.doesNotMatch(saveFunction[0], /startAssessment/);
  assert.match(html, /生日（必填）/);
  assert.match(html, /id="customer-birthday"[^>]*required/);
  assert.match(saveFunction[0], /請填寫生日/);
});

test("步驟三依服務項目顯示問卷名稱，問卷按鈕使用獨立動作文案", () => {
  assert.match(html, /id="assessment-step-title">步驟 3：填寫新客評估/);
  assert.match(html, /id="assessment-start" hidden>開始問卷評估/);
  assert.match(app, /configured\.name \|\| "新客評估"/);
  assert.match(app, /assessmentStart\.textContent = "開始問卷評估"/);
});

test("案件送出後清除最後一題，不再顯示可重複送出的選項", () => {
  assert.match(app, /if \(!question\) \{[\s\S]*?assessmentForm\.hidden = true/);
  assert.match(app, /if \(!question\) \{[\s\S]*?assessmentStart\.hidden = true/);
  assert.match(app, /assessmentOptions\.innerHTML = ""/);
  assert.doesNotMatch(app, /目前沒有可作答的評估/);
});

test("霧眉照片使用客人本人方向標示，不由畫面方向猜測左右眉", () => {
  assert.match(html, /客人本人左眉照（以客人方向為準）/);
  assert.match(html, /客人本人右眉照（以客人方向為準）/);
});

test("首次選擇每項評估服務都需評估，只有已完成相同服務才由後端放行", () => {
  assert.match(app, /!hasProfile \|\|[\s\S]*state\.requiresAssessment/);
  assert.match(app, /state\.requiresAssessment && assessmentState\.status !== "approved"/);
  assert.doesNotMatch(app, /var skipsAssessment = state\.isReturningCustomer/);
  assert.doesNotMatch(app, /if \(state\.isReturningCustomer\) \{[\s\S]{0,160}assessmentState\.code/);
  assert.match(app, /首次選擇其他需評估服務時，仍須先完成評估/);
});

test("重新開啟入口會恢復已核准狀態並直接開放預約，不必重按問卷", () => {
  assert.match(app, /configured\.status === "approved"/);
  assert.match(app, /先前送出的資料與照片都已保留/);
  assert.match(app, /請直接選擇日期與時間完成預約/);
  assert.match(app, /assessmentState\.status === "approved"/);
  assert.match(html, /id="assessment-summary"/);
  assert.match(app, /您先前送出的評估資料/);
  assert.match(app, /resumeApprovedAssessmentService/);
  assert.match(app, /last-service/);
  assert.match(app, /已帶回您先前核准的評估與服務/);
});

test("已核准新客評估直接建立預約，不再開啟第二份預約評估表", () => {
  assert.match(
    app,
    /function requiresReviewBeforeBooking\(\) \{[\s\S]*?if \(assessmentState\.status === "approved"\) return false;/
  );
  assert.match(
    app,
    /if \(requiresReviewBeforeBooking\(\)\) \{\s*openNewBookingReview\(\);\s*\} else \{\s*handleBook\(\);/
  );
});
