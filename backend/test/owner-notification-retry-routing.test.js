import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

var source = readFileSync(join(import.meta.dirname, "../src/d1-notifications.js"), "utf8");

test("failed owner notifications retry from stored recipient without customer join", function () {
  var start = source.indexOf("export async function dispatchQueuedLineNotifications");
  var retry = source.slice(start);
  assert.match(retry, /LEFT JOIN line_accounts/);
  assert.match(retry, /COALESCE\(NULLIF\(n\.recipient,''\),la\.line_user_id\) AS line_user_id/);
  assert.match(retry, /n\.status = 'failed'/);
});

test("single notification resend supports owner recipient", function () {
  var start = source.indexOf("export async function dispatchLineNotificationById");
  var end = source.indexOf("export async function notifyOwnerPaidBookingReschedule", start);
  var resend = source.slice(start, end);
  assert.match(resend, /LEFT JOIN line_accounts/);
  assert.match(resend, /COALESCE\(NULLIF\(n\.recipient,''\),la\.line_user_id\)/);
});
