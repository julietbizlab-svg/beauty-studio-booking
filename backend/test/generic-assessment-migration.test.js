import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("0023 建立通用評估引擎並保留既有霧眉案件與照片", function () {
  var db = new DatabaseSync(":memory:");
  var root = join(import.meta.dirname, "..");
  ["0001_init_core.sql","0021_brow_intake_sop.sql","0022_brow_intake_photos.sql"]
    .forEach(function (file) { db.exec(readFileSync(join(root,"migrations",file),"utf8")); });
  db.exec("INSERT INTO tenants(id,code,name,created_at,updated_at) VALUES ('t1','t1','測試','2026-08-08','2026-08-08')");
  db.exec("INSERT INTO brow_intake_sessions(id,tenant_id,line_user_id,status,current_step,answers_json,created_at,updated_at) VALUES ('s1','t1','private-user','pending_human_review','confirm','{\"service_type\":\"第一次霧眉\"}','2026-08-08','2026-08-08')");
  db.exec(readFileSync(join(root,"migrations/0023_generic_assessment_engine.sql"),"utf8"));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM assessment_templates WHERE tenant_id='t1'").get().n,2);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM assessment_sessions WHERE id='s1'").get().n,1);
  assert.equal(db.prepare("SELECT json_extract(answer_json,'$') answer FROM assessment_answers WHERE session_id='s1' AND question_key='service_type'").get().answer,"第一次霧眉");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM schema_versions WHERE version='0023_generic_assessment_engine'").get().n,1);
});

test("0028 為每個工作室建立眼線／美瞳線與光影臥蠶題庫", function () {
  var db = new DatabaseSync(":memory:");
  var root = join(import.meta.dirname, "..");
  ["0001_init_core.sql","0021_brow_intake_sop.sql","0022_brow_intake_photos.sql"]
    .forEach(function (file) { db.exec(readFileSync(join(root,"migrations",file),"utf8")); });
  db.exec("INSERT INTO tenants(id,code,name,created_at,updated_at) VALUES ('t1','t1','測試','2026-08-08','2026-08-08')");
  db.exec(readFileSync(join(root,"migrations/0023_generic_assessment_engine.sql"),"utf8"));
  db.exec(readFileSync(join(root,"migrations/0028_eye_assessment_templates.sql"),"utf8"));
  db.exec(readFileSync(join(root,"migrations/0029_under_eye_display_name.sql"),"utf8"));
  var rows = db.prepare("SELECT code,name,status FROM assessment_templates WHERE tenant_id='t1' AND code IN ('eyeliner_new_client','under_eye_new_client') ORDER BY code").all();
  assert.deepEqual(rows.map(function (row) { return row.code; }), ["eyeliner_new_client","under_eye_new_client"]);
  assert.ok(rows.every(function (row) { return row.status === "active"; }));
  assert.equal(rows.find(function (row) { return row.code === "under_eye_new_client"; }).name,"光影臥蠶新客評估");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM schema_versions WHERE version='0028_eye_assessment_templates'").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM schema_versions WHERE version='0029_under_eye_display_name'").get().n,1);
});
