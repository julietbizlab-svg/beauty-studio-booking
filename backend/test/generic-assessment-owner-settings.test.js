import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const html = readFileSync(join(root, "owner-admin/index.html"), "utf8");
const app = readFileSync(join(root, "owner-admin/js/app.js"), "utf8");
const api = readFileSync(join(root, "owner-admin/js/api.js"), "utf8");

test("服務評估題庫只對旗艦版顯示，標準版維持隱藏", () => {
  assert.match(html, /客戶實際填寫的服務評估題庫/);
  assert.match(html, /id="assessment-template-settings" hidden/);
  assert.match(app, /assessmentTemplateSettings\.hidden = !isFlagship/);
  assert.match(app, /if \(!isFlagship\) collapseAssessmentTemplates\(\)/);
  assert.match(api, /getAssessmentTemplates/);
  assert.match(api, /updateAssessmentQuestion/);
});

test("評估題庫預設收合，按查看才載入，再按一次可收合", () => {
  assert.match(html, /id="assessment-template-refresh"[^>]*aria-expanded="false"/);
  assert.match(html, />查看／管理題庫<\/button>/);
  assert.match(html, /id="assessment-template-list" hidden/);
  assert.match(app, /function toggleAssessmentTemplates\(\)/);
  assert.match(app, /assessmentTemplateList\.hidden[\s\S]*loadAssessmentTemplates\(\)/);
  assert.match(app, /addEventListener\("click", toggleAssessmentTemplates\)/);
  assert.match(app, /assessmentTemplateList\.hidden = false/);
  assert.match(app, /assessmentTemplateRefresh\.setAttribute\("aria-expanded", "true"\)/);
  assert.match(app, /assessmentTemplateRefresh\.textContent = "收合題庫"/);
  assert.match(app, /await loadSettings\(\);\s*collapseAssessmentTemplates\(\);/);
});

test("鎖定題只顯示內容，不產生編輯欄位或儲存鍵", () => {
  assert.match(app, /locked \? '<span class="ai-feature-state">系統鎖定<\/span>'/);
  assert.match(app, /locked \? '<p class="panel-hint">/);
  assert.match(app, /data-assessment-save/);
});

test("可編輯題預設收合，修改後才可儲存且成功後自動收合", () => {
  assert.match(app, /data-assessment-edit aria-expanded="false">編輯題目/);
  assert.match(app, /data-assessment-editor hidden/);
  assert.match(app, /data-assessment-save disabled>儲存修改/);
  assert.match(app, /function updateAssessmentQuestionDirtyState\(card\)/);
  assert.match(app, /save\.disabled = assessmentTemplateBusy \|\| assessmentQuestionSnapshot\(card\) === card\._assessmentBaseline/);
  assert.match(app, /setAssessmentQuestionEditorOpen\(card, false\)/);
  assert.match(app, /題目已儲存並收合/);
});

test("題庫編輯器手機按鈕等寬且欄位不溢出", () => {
  const css = readFileSync(join(root, "owner-admin/css/style.css"), "utf8");
  assert.match(css, /\.assessment-question-actions[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(css, /\.assessment-question-actions \.btn[\s\S]*width:\s*100%[\s\S]*min-height:\s*48px/);
  assert.match(css, /@media \(max-width:\s*420px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
});

test("非安全題送出 prompt 與逐行 options，後端仍會再次驗證", () => {
  assert.match(app, /split\(\/\\r\?\\n\/\)/);
  assert.match(app, /prompt: prompt, options: options/);
  assert.match(html, /健康、安全、療程與照片規格由系統鎖定/);
  assert.match(html, /與上方「AI 回答範本」不同/);
});
