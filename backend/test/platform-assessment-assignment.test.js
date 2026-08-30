import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = join(import.meta.dirname, "../..");

test("0024 為每間工作室建立單一平台問卷設定", () => {
  const sql = readFileSync(join(root, "backend/migrations/0024_platform_assessment_assignment.sql"), "utf8");
  assert.match(sql, /assessment_template_code/);
  assert.match(sql, /brow_new_client/);
  assert.match(sql, /0024_platform_assessment_assignment/);
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(root, "backend/migrations/0001_init_core.sql"), "utf8"));
  db.exec(readFileSync(join(root, "backend/migrations/0003_settings_schedules.sql"), "utf8"));
  db.exec("INSERT INTO tenants(id,code,name,created_at,updated_at) VALUES ('t1','t1','測試','2026-08-08','2026-08-08')");
  db.exec(sql);
  assert.equal(db.prepare("SELECT setting_value FROM tenant_settings WHERE tenant_id='t1' AND setting_key='assessment_template_code'").get().setting_value, "brow_new_client");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM schema_versions WHERE version='0024_platform_assessment_assignment'").get().n, 1);
});

test("平台端可於開通與既有工作室一鍵指定唯一問卷", () => {
  const html = readFileSync(join(root, "platform-admin/index.html"), "utf8");
  const app = readFileSync(join(root, "platform-admin/platform.js"), "utf8");
  const api = readFileSync(join(root, "owner-admin/js/api.js"), "utf8");
  assert.match(html, /platform-assessment-template/);
  assert.match(html, /全方位紋繡評估/);
  assert.match(html, /霧唇新客評估/);
  assert.match(app, /一鍵套用問卷/);
  assert.match(app, /all_supported/);
  assert.match(app, /setPlatformStudioAssessmentTemplate/);
  assert.match(api, /\/assessment-template/);
});

test("後端拒絕客戶使用非服務項目指定問卷且業主只取得已指派題庫", () => {
  const source = readFileSync(join(root, "backend/src/d1-assessments.js"), "utf8");
  assert.match(source, /assertConfiguredTemplate/);
  assert.match(source, /此服務未啟用這份評估問卷/);
  assert.match(source, /configuredCodes\.includes\(item\.code\)/);
});
