import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BROW_LIGHTENING_QUESTIONS, nextBrowLighteningQuestion, evaluateBrowLighteningCase,
  LIP_LIGHTENING_QUESTIONS, nextLipLighteningQuestion, evaluateLipLighteningCase
} from "../src/lightening-assessment-templates.js";

test("舊眉與舊唇輕色管理使用兩份獨立題庫", () => {
  assert.equal(BROW_LIGHTENING_QUESTIONS[0].key, "old_color_status");
  assert.equal(LIP_LIGHTENING_QUESTIONS[0].key, "old_color_status");
  assert.ok(BROW_LIGHTENING_QUESTIONS.some(item => item.key === "scar_history"));
  assert.ok(LIP_LIGHTENING_QUESTIONS.some(item => item.key === "recurrent_blisters"));
});

test("未做過淡化時略過淡化日期及恢復追問", () => {
  assert.equal(nextBrowLighteningQuestion("previous_lightening", "從未處理"), "skin_condition");
  assert.equal(nextLipLighteningQuestion("previous_lightening", "從未處理"), "lip_condition");
});

test("舊眉輕色新流程只問必要內容並只要求兩張照片", () => {
  const answers = {
    old_color_status: "還有明顯顏色",
    last_procedure_time: "2～3年",
    goals: ["希望舊色降低存在感"],
    previous_lightening: "從未處理",
    skin_condition: ["正常，沒有不舒服"],
    scar_history: "沒有"
  };
  const flow = [];
  let key = "old_color_status";
  while (key) {
    flow.push(key);
    key = nextBrowLighteningQuestion(key, answers[key]);
  }
  assert.deepEqual(flow, [
    "old_color_status", "last_procedure_time", "goals", "previous_lightening",
    "skin_condition", "scar_history", "face_front", "brows_front"
  ]);
  assert.deepEqual(evaluateBrowLighteningCase(answers, ["face_front", "brows_front"]).missingFields, []);
});

test("傷口與目前水泡只分流給人工，不做施作判定", () => {
  assert.equal(evaluateBrowLighteningCase({ skin_condition: ["有傷口"] }, []).bookingRoute, "暫不開放排程");
  assert.equal(evaluateLipLighteningCase({ recurrent_blisters: "最近正在發生" }, []).bookingRoute, "暫不開放排程");
});

test("0030 為每個工作室建立兩份輕色管理題庫", () => {
  const db = new DatabaseSync(":memory:");
  const root = join(import.meta.dirname, "..");
  ["0001_init_core.sql", "0021_brow_intake_sop.sql", "0022_brow_intake_photos.sql", "0023_generic_assessment_engine.sql"]
    .forEach(file => db.exec(readFileSync(join(root, "migrations", file), "utf8")));
  db.exec("INSERT INTO tenants(id,code,name,created_at,updated_at) VALUES ('t1','t1','測試','2026-08-08','2026-08-08')");
  db.exec(readFileSync(join(root, "migrations/0030_lightening_assessment_templates.sql"), "utf8"));
  const rows = db.prepare("SELECT code FROM assessment_templates WHERE tenant_id='t1' AND code LIKE '%lightening%' ORDER BY code").all();
  assert.deepEqual(rows.map(row => row.code), ["brow_lightening_new_client", "lip_lightening_new_client"]);
});
