import { test } from "node:test";
import assert from "node:assert/strict";
import { BROW_INTAKE_QUESTIONS, BROW_RUNTIME_STEPS, nextBrowQuestion, evaluateBrowCase, buildBrowOwnerSummary } from "../src/brow-intake-template.js";
import { LIP_INTAKE_QUESTIONS, evaluateLipCase } from "../src/lip-intake-template.js";

test("霧眉與霧唇使用完全相同的題目資料格式", () => {
  const shape = item => Object.keys(item).sort();
  const expected = ["key", "type", "prompt", "options", "required", "systemLocked"].sort();
  assert.ok(BROW_INTAKE_QUESTIONS.every(item => assert.deepEqual(shape(item), expected) === undefined));
  assert.ok(LIP_INTAKE_QUESTIONS.every(item => assert.deepEqual(shape(item), expected) === undefined));
  assert.equal(BROW_INTAKE_QUESTIONS.find(item => item.key === "health_data_consent").systemLocked, true);
  assert.equal(BROW_INTAKE_QUESTIONS.find(item => item.key === "current_skin_condition").systemLocked, true);
  assert.equal(BROW_INTAKE_QUESTIONS.find(item => item.key === "service_type").systemLocked, false);
  assert.equal(BROW_RUNTIME_STEPS.service_type.question, BROW_INTAKE_QUESTIONS[0].prompt);
});

test("個人工作室本店補色不重問施作日期或老師", () => {
  assert.equal(BROW_INTAKE_QUESTIONS.some(item => item.key === "store_touchup_artist"), false);
  assert.equal(BROW_INTAKE_QUESTIONS.some(item => item.key === "store_touchup_date"), false);
  assert.equal(nextBrowQuestion("service_type", "本店補色"), "old_brow_status");
});

test("左右眉照片以客人本人方向固定歸類，不要求 AI 依畫面猜測", () => {
  assert.match(BROW_INTAKE_QUESTIONS.find(item => item.key === "brow_left").prompt, /客人本人左眉.*不依畫面左右判斷/);
  assert.match(BROW_INTAKE_QUESTIONS.find(item => item.key === "brow_right").prompt, /客人本人右眉.*不依畫面左右判斷/);
});

test("霧眉與霧唇只輸出統一四種分流狀態", () => {
  const allowed = ["一般待審核", "優先待審核", "待補資料", "暫不開放排程"];
  const brow = evaluateBrowCase({ current_skin_condition: "傷口或結痂" }, ["full_face_front", "brow_left", "brow_right"]);
  const lip = evaluateLipCase({ current_lip_or_oral_condition: ["有裂傷"] }, ["full_face_front", "lip_closeup_relaxed", "lip_closeup_slightly_open"]);
  assert.ok(allowed.includes(brow.bookingRoute));
  assert.ok(allowed.includes(lip.bookingRoute));
  assert.equal(brow.bookingRoute, "暫不開放排程");
  assert.equal(lip.bookingRoute, "暫不開放排程");
});

test("霧眉摘要與霧唇摘要同為180字內案件整理", () => {
  const summary = buildBrowOwnerSummary({
    service_type: "舊眉改色或調整",
    old_brow_status: "有，而且仍然明顯",
    current_skin_condition: "沒有，皮膚狀況正常"
  }, ["full_face_front", "brow_left", "brow_right"]);
  assert.ok(Array.from(summary).length <= 180);
  assert.match(summary, /分流優先待審核/);
  assert.doesNotMatch(summary, /適合施作|可以施作|診斷/);
});
