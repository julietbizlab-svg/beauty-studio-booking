import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = join(import.meta.dirname, "../..");

test("0027 將評估類型綁定到每個服務並保留旗艦既有設定", () => {
  const db = new DatabaseSync(":memory:");
  ["0001_init_core.sql", "0003_settings_schedules.sql",
    "0017_owner_hub.sql", "0024_platform_assessment_assignment.sql"].forEach((name) => {
    db.exec(readFileSync(join(root, "backend/migrations", name), "utf8"));
  });
  db.exec("INSERT INTO tenants(id,code,name,created_at,updated_at) VALUES ('t1','t1','測試','2026-08-08','2026-08-08')");
  db.exec("INSERT INTO tenant_features(tenant_id,plan_code,updated_at) VALUES ('t1','flagship','2026-08-08')");
  db.exec("INSERT INTO tenant_settings(id,tenant_id,setting_key,setting_value,value_type,created_at,updated_at) VALUES ('x','t1','assessment_template_code','lip_blush_new_client','string','2026-08-08','2026-08-08')");
  db.exec("INSERT INTO services(id,tenant_id,code,name,duration_minutes,created_at,updated_at) VALUES ('s1','t1','s1','霧唇',60,'2026-08-08','2026-08-08')");
  db.exec(readFileSync(join(root, "backend/migrations/0027_service_assessment_type.sql"), "utf8"));
  assert.equal(db.prepare("SELECT assessment_template_code FROM services WHERE id='s1'").get().assessment_template_code, "lip_blush_new_client");
  assert.throws(() => db.exec("UPDATE services SET assessment_template_code='fake' WHERE id='s1'"));
});

test("業主服務表單可逐項選擇題庫，未完成範本明確鎖定", () => {
  const html = readFileSync(join(root, "owner-admin/index.html"), "utf8");
  const app = readFileSync(join(root, "owner-admin/js/app.js"), "utf8");
  const repo = readFileSync(join(root, "backend/src/d1-repository.js"), "utf8");
  assert.match(html, /id="svc-assessment-type"/);
  assert.match(html, /眼線／美瞳線新客評估/);
  assert.match(html, /光影臥蠶新客評估/);
  assert.match(html, /舊眉輕色管理｜新客評估/);
  assert.match(html, /舊唇輕色管理｜新客評估/);
  assert.match(app, /assessmentTemplateCode:[\s\S]*?els\.svcAssessmentType\.value/);
  assert.match(app, /serviceCategorySkipsAssessment/);
  assert.match(app, /美甲\|美睫\|睫毛/);
  assert.match(app, /svcName\.addEventListener\("input", syncServiceAssessmentAvailability\)/);
  assert.match(repo, /SERVICE_ASSESSMENT_CODES/);
  assert.match(repo, /serviceCategorySkipsAssessment\(row\.name\)/);
});

test("客戶先選服務，再由後端依 serviceId 取得及驗證題庫", () => {
  const html = readFileSync(join(root, "customer-ui/index.html"), "utf8");
  const app = readFileSync(join(root, "customer-ui/js/app.js"), "utf8");
  const api = readFileSync(join(root, "customer-ui/js/api.js"), "utf8");
  const backend = readFileSync(join(root, "backend/src/d1-assessments.js"), "utf8");
  assert.ok(html.indexOf("步驟 2：選擇服務項目") < html.indexOf("步驟 3：填寫新客評估"));
  assert.match(api, /assessment-template\?serviceId=/);
  assert.match(app, /loadAssessmentTemplate\(selected\)/);
  assert.match(backend, /此服務未啟用這份評估問卷/);
  assert.match(backend, /評估範本準備中，暫未開放新客預約/);
  assert.match(backend, /美甲\|美睫\|睫毛/);
});
