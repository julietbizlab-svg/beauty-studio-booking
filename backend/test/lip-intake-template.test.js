import { test } from "node:test";
import assert from "node:assert/strict";
import { LIP_INTAKE_QUESTIONS, nextLipQuestion, evaluateLipCase, validateLipAnswer, buildLipOwnerSummary } from "../src/lip-intake-template.js";

test("霧唇題庫有逐題選項且只鎖定健康安全題", () => {
  assert.equal(LIP_INTAKE_QUESTIONS.length, 29);
  assert.equal(LIP_INTAKE_QUESTIONS.find(item => item.key === "health_data_consent").systemLocked, true);
  assert.equal(LIP_INTAKE_QUESTIONS.find(item => item.key === "current_lip_or_oral_condition").systemLocked, true);
  assert.equal(LIP_INTAKE_QUESTIONS.find(item => item.key === "service_type").systemLocked, false);
  assert.equal(LIP_INTAKE_QUESTIONS.find(item => item.key === "treatment_goals").systemLocked, false);
  assert.ok(LIP_INTAKE_QUESTIONS.filter(item => ["single", "multiple"].includes(item.type)).every(item => item.options.length));
});

test("霧唇問卷依答案走正確分支", () => {
  assert.equal(nextLipQuestion("service_type", "本店補色"), "store_touchup_range");
  assert.equal(nextLipQuestion("previous_lip_tattoo", "從未做過"), "treatment_goals");
  assert.equal(nextLipQuestion("previous_lip_tattoo", "做過，目前顏色不均"), "last_lip_tattoo_date_range");
  assert.equal(nextLipQuestion("health_data_consent", "暫不同意"), "full_face_front");
});

test("分流只決定處理順序與下一步", () => {
  const caseResult = evaluateLipCase({
    previous_lip_tattoo: "做過，目前顏色不均",
    current_lip_or_oral_condition: ["有小水泡"]
  }, ["full_face_front", "lip_closeup_relaxed", "lip_closeup_slightly_open"]);
  assert.equal(caseResult.bookingRoute, "暫不開放排程");
  assert.ok(caseResult.caseTags.includes("舊唇色案件"));
  assert.ok(caseResult.caseTags.includes("目前唇部異常"));
});

test("缺少必要照片時為待補資料", () => {
  assert.deepEqual(evaluateLipCase({}, ["full_face_front"]), {
    bookingRoute: "待補資料",
    caseTags: [],
    missingFields: ["lip_closeup_relaxed", "lip_closeup_slightly_open"]
  });
});

test("互斥複選不可同時提交", () => {
  assert.equal(validateLipAnswer("current_lip_or_oral_condition", ["目前正常", "有裂傷"]).valid, false);
  assert.equal(validateLipAnswer("recent_lip_procedures", ["沒有", "玻尿酸豐唇"]).valid, false);
});

test("業主摘要不超過180字且只整理已提供資料", () => {
  const answers = {
    service_type: "深唇／暗沉唇調色",
    treatment_goals: ["唇色暗沉", "上下唇色差"],
    previous_lip_tattoo: "做過，目前顏色不均",
    last_lip_tattoo_date_range: "2年以上",
    herpes_or_cold_sore_history: "曾發生過",
    last_cold_sore_episode: "6個月以上",
    current_lip_or_oral_condition: ["目前正常"],
    pregnancy_breastfeeding_status: "無",
    important_event_type: ["拍攝"],
    important_event_date: "2026-09-20"
  };
  const summary = buildLipOwnerSummary(answers, ["full_face_front", "lip_closeup_relaxed", "lip_closeup_slightly_open"]);
  assert.ok(Array.from(summary).length <= 180);
  assert.match(summary, /深唇／暗沉唇調色/);
  assert.match(summary, /分流優先待審核/);
  assert.doesNotMatch(summary, /適合施作|診斷|建議藥物/);
});
