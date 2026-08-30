import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dirname, "../src/index.js"), "utf8");

test("客戶通用評估 API 只接受白名單服務並使用驗證後 LINE 身分", () => {
  assert.ok(source.includes("under_eye_new_client|brow_lightening_new_client|lip_lightening_new_client)\\/start"));
  assert.ok(source.includes("under_eye_new_client|brow_lightening_new_client|lip_lightening_new_client)\\/answers"));
  assert.match(source, /assessmentStartCustomer = await requireCustomerFromRequest/);
  assert.match(source, /assessmentStartCustomer\.userId/);
  assert.match(source, /assessmentAnswerCustomer = await requireCustomerFromRequest/);
  assert.match(source, /assessmentAnswerCustomer\.userId/);
  assert.match(source, /saveProfileCustomer = await requireCustomerFromRequest/);
  assert.match(source, /await upsertCustomer/);
  assert.match(source, /await assertCustomerAssessmentApproved\(env, bookCustomer\.userId, bookBody\.serviceId\)/);
  assert.doesNotMatch(source, /bookBody\.serviceId[\s\S]{0,120}isReturningCustomer/);
});

test("業主題庫 API 經業主驗證且題目 key 走 decode，不接受任意服務 code", () => {
  assert.match(source, /\/api\/owner\/assessment-templates/);
  assert.match(source, /brow_new_client\|lip_blush_new_client/);
  assert.match(source, /await requireOwnerFromRequest\(request, env\)/);
  assert.match(source, /decodeURIComponent\(ownerAssessmentQuestionMatch\[2\]\)/);
});

test("通用評估路由沒有接觸 production、Notion 或秘密設定", () => {
  const blockStart = source.indexOf("var customerAssessmentStartMatch");
  const blockEnd = source.indexOf("if (url.pathname === \"/api/customer/brow-intake\"", blockStart);
  const block = source.slice(blockStart, blockEnd);
  assert.doesNotMatch(block, /production|NOTION|TOKEN|secret/i);
});
