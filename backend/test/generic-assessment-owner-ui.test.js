import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const html = readFileSync(join(root, "owner-admin/index.html"), "utf8");
const app = readFileSync(join(root, "owner-admin/js/app.js"), "utf8");
const api = readFileSync(join(root, "owner-admin/js/api.js"), "utf8");
const worker = readFileSync(join(root, "backend/src/index.js"), "utf8");

test("業主端使用單一霧眉霧唇案件佇列", () => {
  assert.match(html, /新客評估案件/);
  assert.match(html, /平台為本工作室指定的新客評估/);
  assert.match(api, /\/api\/owner\/assessments/);
  assert.match(app, /getAssessments/);
});

test("案件顯示摘要、標籤、缺漏、逐題回答與私有照片", () => {
  assert.match(app, /ownerSummary/);
  assert.match(app, /caseTags/);
  assert.match(app, /missingFields/);
  assert.match(app, /查看客戶逐題回答/);
  assert.match(app, /fetchAssessmentPhoto/);
  assert.match(app, /openAssessmentPhotoLightbox/);
  assert.doesNotMatch(app, /button\.replaceWith\(image\)/);
  assert.match(html, /photo-lightbox-zoom-in/);
  assert.match(html, /photo-lightbox-zoom-out/);
});

test("業主跨網域查看評估照片時回傳 CORS 標頭", () => {
  const photoRoute = worker.slice(
    worker.indexOf("var ownerAssessmentPhotoMatch"),
    worker.indexOf("var ownerAssessmentQuestionMatch")
  );
  assert.match(photoRoute, /Object\.assign\(\{\}, corsHeaders/);
  assert.match(photoRoute, /private, no-store/);
  assert.match(photoRoute, /nosniff/);
});

test("每位客戶有統一相簿並依新到舊載入各流程照片", () => {
  assert.match(html, /客戶相簿/);
  assert.match(html, /customer-album-list/);
  assert.match(api, /listCustomerAlbum/);
  assert.match(app, /renderCustomerAlbum/);
  assert.match(app, /fetchCustomerAlbumPhoto/);
});

test("人工審核仍提供四種操作且不由 AI 自動核准", () => {
  assert.match(app, /核准並開放預約/);
  assert.match(app, /需要補資料/);
  assert.match(app, /暫停預約/);
  assert.match(app, /改由人工聯絡/);
  assert.match(app, /下一步引導/);
  assert.match(app, /系統已通知客戶可以預約/);
  assert.match(app, /等待客戶補充/);
  assert.match(app, /主動聯絡客戶/);
  assert.match(app, /currentDisabled\("approved"\)/);
  assert.match(app, /'<\/p>' \+ actions \+ '<details open>/);
  assert.doesNotMatch(app, /autoApproveAssessment|AI自動核准/);
});

test("四種人工評估結果都建立 tenant-scoped LINE 通知並立即嘗試發送", () => {
  const repository = readFileSync(join(root, "backend/src/d1-assessments.js"), "utf8");
  const notifications = readFileSync(join(root, "backend/src/d1-notifications.js"), "utf8");
  assert.match(repository, /enqueueAssessmentReviewNotification/);
  assert.match(repository, /dispatchLineNotificationById/);
  assert.match(notifications, /assessment_approved/);
  assert.match(notifications, /assessment_more_information_requested/);
  assert.match(notifications, /assessment_booking_paused/);
  assert.match(notifications, /assessment_manual_contact/);
  assert.match(notifications, /您的「.*」已通過人工審核/);
  assert.match(notifications, /tenant_id=\?2/);
});

test("人工評估按鈕使用同寬同高的兩欄網格", () => {
  const css = readFileSync(join(root, "docs/owner/css/style.css"), "utf8");
  assert.match(css, /\.assessment-next-step \.ai-inquiry-actions\s*\{[^}]*display:\s*grid;/s);
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.assessment-next-step \.ai-inquiry-actions \.btn\s*\{[^}]*min-height:\s*52px;/s);
});
