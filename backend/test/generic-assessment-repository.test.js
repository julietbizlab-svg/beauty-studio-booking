import { test } from "node:test";
import assert from "node:assert/strict";
import { BROW_INTAKE_QUESTIONS } from "../src/brow-intake-template.js";
import { LIP_INTAKE_QUESTIONS } from "../src/lip-intake-template.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  configuredOwnerAssessmentTemplateCodes,
  getCustomerConfiguredAssessmentTemplate,
  supportedOwnerAssessmentTemplateCodes
} from "../src/d1-assessments.js";

const source = readFileSync(join(import.meta.dirname, "../src/d1-assessments.js"), "utf8");

test("通用 repository 同時註冊霧眉與霧唇且不含施作判定", () => {
  assert.match(source, /brow_new_client/);
  assert.match(source, /lip_blush_new_client/);
  assert.match(source, /assessment_sessions/);
  assert.match(source, /assessment_answers/);
  assert.doesNotMatch(source, /適合施作|不適合施作|核准預約/);
});

test("非作答中案件重新開啟時不回傳殘留題目", () => {
  assert.match(source, /question: existing\.status === "active"/);
});

test("只有健康安全題鎖定，兩種服務皆有可編輯非安全題", () => {
  for (const questions of [BROW_INTAKE_QUESTIONS, LIP_INTAKE_QUESTIONS]) {
    assert.ok(questions.some(item => item.systemLocked));
    assert.ok(questions.some(item => !item.systemLocked));
    assert.equal(questions.find(item => item.key === "health_data_consent").systemLocked, true);
    assert.equal(questions.find(item => item.key === "service_type").systemLocked, false);
  }
});

test("題目修改 SQL 以 tenant、template、question 與 system_locked 限制", () => {
  const source = readFileSync(join(import.meta.dirname, "../src/d1-assessments.js"), "utf8");
  assert.match(source, /WHERE tenant_id=\?1 AND template_id=\?2 AND question_key=\?3/);
  assert.match(source, /system_locked=0/);
  assert.match(source, /健康與安全題不可修改/);
});

test("業主題庫清單略過未啟用與未知代碼，只保留已支援題庫", () => {
  assert.deepEqual(supportedOwnerAssessmentTemplateCodes([
    { code: "none" },
    { code: "brow_new_client" },
    { code: "" },
    { code: "unknown_template" },
    { code: "brow_new_client" },
    { code: "under_eye_new_client" }
  ]), ["brow_new_client", "under_eye_new_client"]);
});

test("全方位新工作室尚未建立服務時仍載入全部六套評估題庫", () => {
  assert.deepEqual(configuredOwnerAssessmentTemplateCodes([], "all_supported"), [
    "brow_new_client", "lip_blush_new_client", "eyeliner_new_client",
    "under_eye_new_client", "brow_lightening_new_client", "lip_lightening_new_client"
  ]);
  assert.deepEqual(configuredOwnerAssessmentTemplateCodes([], "lip_blush_new_client"), [
    "lip_blush_new_client"
  ]);
});

function lipAssessmentEnv(hasCompletedSameService, assessmentStatus) {
  return {
    TENANT_ID: "tenant-lip",
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes("FROM services s")) {
                  return {
                    name: "首次霧唇",
                    assessment_template_code: "lip_blush_new_client",
                    plan_code: "flagship"
                  };
                }
                if (sql.includes("JOIN booking_items")) {
                  return hasCompletedSameService ? { found: 1 } : null;
                }
                if (sql.includes("FROM assessment_sessions")) {
                  return assessmentStatus ? { status: assessmentStatus } : null;
                }
                return null;
              },
              async all() {
                if (sql.includes("FROM assessment_answers")) {
                  return { results: assessmentStatus ? [{
                    question_key: "goals",
                    prompt: "這次最希望改善什麼？",
                    answer_json: JSON.stringify(["顏色不均"])
                  }] : [] };
                }
                return { results: [] };
              }
            };
          }
        };
      }
    }
  };
}

test("首次霧唇即使做過其他服務仍必須完成霧唇新客評估", async () => {
  const configured = await getCustomerConfiguredAssessmentTemplate(
    lipAssessmentEnv(false), "line-customer", "service-first-lip"
  );
  assert.equal(configured.code, "lip_blush_new_client");
  assert.equal(configured.required, true);
  assert.equal(configured.ready, true);
  assert.equal(configured.status, "not_started");
});

test("只有已完成相同霧唇服務的回訪客可免重做評估", async () => {
  const configured = await getCustomerConfiguredAssessmentTemplate(
    lipAssessmentEnv(true), "line-customer", "service-first-lip"
  );
  assert.equal(configured.code, "");
  assert.equal(configured.required, false);
  assert.equal(configured.reason, "completed_same_service");
});

test("客戶重新選擇服務時會取回既有已核准狀態", async () => {
  const configured = await getCustomerConfiguredAssessmentTemplate(
    lipAssessmentEnv(false, "approved"), "line-customer", "service-first-lip"
  );
  assert.equal(configured.code, "lip_blush_new_client");
  assert.equal(configured.required, true);
  assert.equal(configured.status, "approved");
  assert.equal(configured.assessment.answers[0].prompt, "這次最希望改善什麼？");
  assert.deepEqual(configured.assessment.answers[0].value, ["顏色不均"]);
});
