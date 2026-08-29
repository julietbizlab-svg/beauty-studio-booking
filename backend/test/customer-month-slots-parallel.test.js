import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("客戶月曆 API 並行讀取服務、設定、營業時段、預約與休假日", function () {
  var source = readFileSync(join(import.meta.dirname, "../src/index.js"), "utf8");
  assert.match(source, /var monthInputs = await Promise\.all\(\[\s*getServiceById\(env, monthServiceId\),\s*getSettings\(env\),\s*listWeeklySlots\(env\),\s*getActiveBookingsForMonth\(env, monthParam\),\s*listClosedDates\(env, monthParam\)\s*\]\)/);
  assert.match(source, /var monthBookingsResult = monthInputs\[3\]/);
  assert.match(source, /var closedDates = monthInputs\[4\]/);
});
