import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EYELINER_INTAKE_QUESTIONS, nextEyelinerQuestion, evaluateEyelinerCase, validateEyelinerAnswer,
  UNDEREYE_INTAKE_QUESTIONS, nextUnderEyeQuestion, evaluateUnderEyeCase, validateUnderEyeAnswer
} from "../src/eye-assessment-templates.js";

test("眼線與美瞳線共用題庫，光影臥蠶使用獨立題庫", () => {
  assert.ok(EYELINER_INTAKE_QUESTIONS.find(item => item.key === "service_type").options.includes("隱形美瞳線"));
  assert.ok(EYELINER_INTAKE_QUESTIONS.find(item => item.key === "service_type").options.includes("自然眼線"));
  assert.ok(UNDEREYE_INTAKE_QUESTIONS.find(item => item.key === "goals").options.includes("韓系輕盈感"));
  assert.notDeepEqual(EYELINER_INTAKE_QUESTIONS, UNDEREYE_INTAKE_QUESTIONS);
});

test("眼線題庫依舊色、療程與健康同意走條件分支", () => {
  assert.equal(nextEyelinerQuestion("previous_eyeliner", "從未做過"), "goals");
  assert.equal(nextEyelinerQuestion("recent_eye_procedures", ["沒有"]), "eye_treatment");
  assert.equal(nextEyelinerQuestion("health_data_consent", "暫不同意"), "face_open");
});

test("臥蠶精簡題庫略過不必要的療程追問並保留健康同意", () => {
  assert.equal(nextUnderEyeQuestion("recent_procedures", ["沒有"]), "health_data_consent");
  assert.equal(nextUnderEyeQuestion("health_data_consent", "老師私下確認"), "face_neutral");
  assert.equal(UNDEREYE_INTAKE_QUESTIONS.length, 10);
  assert.equal(UNDEREYE_INTAKE_QUESTIONS.some(item => item.type === "date"), false);
});

test("眼周異常只分流與標籤，不產生適合施作判斷", () => {
  const eyeliner = evaluateEyelinerCase({ current_eye_condition: ["眼皮紅腫"] }, ["face_open", "eyes_closed", "eyes_open"]);
  const underEye = evaluateUnderEyeCase({ current_skin_condition: ["疼痛"] }, ["face_neutral", "eyes_open", "face_smile"]);
  assert.equal(eyeliner.bookingRoute, "暫不開放排程");
  assert.equal(underEye.bookingRoute, "暫不開放排程");
  assert.ok(eyeliner.caseTags.includes("目前眼周狀況待確認"));
  assert.ok(underEye.caseTags.includes("目前眼下狀況待確認"));
});

test("健康安全題鎖定且互斥複選不可同時提交", () => {
  assert.equal(EYELINER_INTAKE_QUESTIONS.find(item => item.key === "current_eye_condition").systemLocked, true);
  assert.equal(UNDEREYE_INTAKE_QUESTIONS.find(item => item.key === "safety_check").systemLocked, true);
  assert.equal(validateEyelinerAnswer("current_eye_condition", ["沒有，目前正常", "眼皮紅腫"]).valid, false);
  assert.equal(validateUnderEyeAnswer("safety_check", ["沒有", "健康狀況或相關用藥"]).valid, false);
});

test("不在線上提供健康資料會標示待人工聯絡", () => {
  assert.ok(evaluateEyelinerCase({ health_data_consent: "暫不同意" }, []).caseTags.includes("待人工聯絡"));
  assert.ok(evaluateUnderEyeCase({ health_data_consent: "老師私下確認" }, []).caseTags.includes("待人工聯絡"));
});
