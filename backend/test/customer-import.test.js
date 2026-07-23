/**
 * customer-import.js 純函式測試（node:test ＋ assert，零依賴）
 *
 * 涵蓋：CSV parser（BOM／CRLF／quoted／中文／限制）、欄位對應、
 * 電話標準化、逐列驗證、CSV 內重複判定、canonical hash 穩定性
 * 與電話遮罩不洩漏。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCsv,
  resolveColumnMapping,
  normalizeImportedPhone,
  maskPhoneForDisplay,
  normalizeImportRows,
  summarizeImportRows,
  buildCanonicalString,
  computeCanonicalHash,
  buildImportPreview,
  IMPORT_SCHEMA_VERSION
} from "../src/customer-import.js";

// ── CSV parser ───────────────────────────────────────────────

test("parseCsv：UTF-8 BOM 被剝除，標頭正確", function () {
  var parsed = parseCsv("\uFEFF姓名,電話\n王小美,0912345678\n");
  assert.deepEqual(parsed.header, ["姓名", "電話"]);
  assert.deepEqual(parsed.rows, [["王小美", "0912345678"]]);
});

test("parseCsv：CRLF 與 LF 解析結果相同", function () {
  var lf = parseCsv("姓名,電話\n王小美,0912345678\n李大明,0987654321\n");
  var crlf = parseCsv("姓名,電話\r\n王小美,0912345678\r\n李大明,0987654321\r\n");
  assert.deepEqual(crlf, lf);
});

test("parseCsv：quoted field 內的逗號", function () {
  var parsed = parseCsv('姓名,備註\n"王, 小美","喜歡精油, 怕痛"\n');
  assert.deepEqual(parsed.rows, [["王, 小美", "喜歡精油, 怕痛"]]);
});

test("parseCsv：quoted field 內的換行", function () {
  var parsed = parseCsv('姓名,備註\n王小美,"第一行\n第二行"\n李大明,一般\n');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][1], "第一行\n第二行");
});

test("parseCsv：\"\" escaped quote", function () {
  var parsed = parseCsv('姓名\n"王""小美"\n');
  assert.equal(parsed.rows[0][0], '王"小美');
});

test("parseCsv：中文標頭與內容、空欄位、空白尾列", function () {
  var parsed = parseCsv("姓名,電話,生日\n王小美,,\n李大明,0912345678,1990-01-01\n\n   \n");
  assert.deepEqual(parsed.header, ["姓名", "電話", "生日"]);
  assert.equal(parsed.rows.length, 2, "空白尾列必須略過");
  assert.deepEqual(parsed.rows[0], ["王小美", "", ""]);
});

test("parseCsv：短列自動補空欄，長列報錯", function () {
  var parsed = parseCsv("姓名,電話,生日\n王小美\n");
  assert.deepEqual(parsed.rows[0], ["王小美", "", ""]);
  assert.throws(function () {
    parseCsv("姓名,電話\n王小美,0912345678,多出來的\n");
  }, /欄位數超過標頭/);
});

test("parseCsv：duplicate header 報錯", function () {
  assert.throws(function () {
    parseCsv("姓名,電話,姓名\n王小美,0912345678,再一次\n");
  }, /標頭重複/);
});

test("parseCsv：超過 512KB 報 400 類型錯誤", function () {
  var big = "姓名\n" + "王".repeat(200 * 1024); // 中文 UTF-8 每字 3 bytes > 512KB
  var error = null;
  try {
    parseCsv(big);
  } catch (e) {
    error = e;
  }
  assert.ok(error, "必須拋錯");
  assert.equal(error.status, 400);
  assert.match(error.message, /512KB/);
});

test("parseCsv：超過 500 列報錯", function () {
  var lines = ["姓名"];
  for (var i = 0; i < 501; i++) {
    lines.push("客人" + i);
  }
  assert.throws(function () {
    parseCsv(lines.join("\n"));
  }, /資料列過多/);
});

test("parseCsv：超過 20 欄報錯", function () {
  var header = [];
  for (var i = 0; i < 21; i++) {
    header.push("欄" + i);
  }
  assert.throws(function () {
    parseCsv(header.join(",") + "\n" + header.map(function () { return "x"; }).join(","));
  }, /欄位數過多/);
});

test("parseCsv：只有標頭沒有資料、完全空白都報錯", function () {
  assert.throws(function () { parseCsv("姓名,電話\n"); }, /只有標頭/);
  assert.throws(function () { parseCsv(""); }, /缺少標頭/);
  assert.throws(function () { parseCsv("\n\n  \n"); }, /缺少標頭/);
});

test("parseCsv：引號未閉合報錯", function () {
  assert.throws(function () {
    parseCsv('姓名\n"王小美\n');
  }, /引號未閉合/);
});

// ── 欄位對應 ─────────────────────────────────────────────────

test("resolveColumnMapping：中文別名自動判斷", function () {
  var mapping = resolveColumnMapping(["客戶編號", "姓名", "聯絡電話", "出生日期", "特別事項"]);
  assert.deepEqual(mapping, {
    name: 1,
    phone: 2,
    birthday: 3,
    note: 4,
    customer_no: 0
  });
});

test("resolveColumnMapping：英文標頭大小寫不敏感、不認識的欄位忽略", function () {
  var mapping = resolveColumnMapping(["Name", "PHONE", "無關欄位"]);
  assert.equal(mapping.name, 0);
  assert.equal(mapping.phone, 1);
  assert.equal(mapping.birthday, null);
});

test("resolveColumnMapping：手動 mapping 覆蓋自動判斷", function () {
  var header = ["姓名", "電話", "舊電話"];
  var auto = resolveColumnMapping(header);
  assert.equal(auto.phone, 1);
  var manual = resolveColumnMapping(header, { phone: "舊電話" });
  assert.equal(manual.phone, 2);
  assert.equal(manual.name, 0, "未手動指定的欄位仍走自動判斷");
});

test("resolveColumnMapping：同一來源欄對應兩個目標欄報錯", function () {
  assert.throws(function () {
    resolveColumnMapping(["姓名", "電話"], { name: "姓名", customer_no: "姓名" });
  }, /不可同時對應/);
});

test("resolveColumnMapping：name 無法對應、手動欄不存在、非法目標欄都報錯", function () {
  assert.throws(function () {
    resolveColumnMapping(["電話", "生日"]);
  }, /找不到姓名欄位/);
  assert.throws(function () {
    resolveColumnMapping(["姓名"], { phone: "不存在的欄" });
  }, /找不到來源欄/);
  assert.throws(function () {
    resolveColumnMapping(["姓名"], { hacker_field: "姓名" });
  }, /不支援的匯入欄位/);
});

// ── 電話標準化 ───────────────────────────────────────────────

test("normalizeImportedPhone：台灣手機各種格式", function () {
  assert.deepEqual(normalizeImportedPhone("0912345678"),
    { value: "0912345678", warnings: [], error: null });
  assert.deepEqual(normalizeImportedPhone(" 0912-345-678 "),
    { value: "0912345678", warnings: [], error: null });
  assert.deepEqual(normalizeImportedPhone("+886912345678"),
    { value: "0912345678", warnings: [], error: null });
  assert.deepEqual(normalizeImportedPhone("886912345678"),
    { value: "0912345678", warnings: [], error: null });
  assert.deepEqual(normalizeImportedPhone("＋８８６９１２３４５６７８"),
    { value: "0912345678", warnings: [], error: null }, "全形必須轉半形");
});

test("normalizeImportedPhone：+8860 混寫（國碼後已有 0）不再補 0", function () {
  assert.deepEqual(normalizeImportedPhone("+8860912345678"),
    { value: "0912345678", warnings: [], error: null });
  assert.deepEqual(normalizeImportedPhone("8860912345678"),
    { value: "0912345678", warnings: [], error: null });
  assert.deepEqual(normalizeImportedPhone("+886 0912-345-678"),
    { value: "0912345678", warnings: [], error: null });
  assert.deepEqual(normalizeImportedPhone("(886) 0912 345 678"),
    { value: "0912345678", warnings: [], error: null });
  // 混寫修正後與其他格式產生相同標準化結果
  assert.equal(
    normalizeImportedPhone("+8860912345678").value,
    normalizeImportedPhone("0912345678").value
  );
});

test("normalizeImportedPhone：市話與國際號碼保留但 warning", function () {
  var landline = normalizeImportedPhone("(02) 2700-1234");
  assert.equal(landline.value, "0227001234");
  assert.equal(landline.error, null);
  assert.equal(landline.warnings.length, 1);

  var intl = normalizeImportedPhone("+81312345678");
  assert.equal(intl.value, "+81312345678");
  assert.equal(intl.warnings.length, 1);
});

test("normalizeImportedPhone：空白允許但 warning；非法字元與長度錯誤", function () {
  var empty = normalizeImportedPhone("   ");
  assert.equal(empty.value, "");
  assert.equal(empty.warnings.length, 1);
  assert.equal(empty.error, null);

  assert.equal(normalizeImportedPhone("09abc12345").error, "電話含非法字元");
  assert.equal(normalizeImportedPhone("12345").error, "電話長度不正確");
  assert.equal(normalizeImportedPhone("1".repeat(16)).error, "電話長度不正確");
});

// ── 資料列正規化與驗證 ───────────────────────────────────────

function previewOf(csvText, manualMapping) {
  return buildImportPreview(csvText, manualMapping);
}

test("正規化列輸出 rowNumber／normalized／maskedPreview／canonicalKey", async function () {
  var preview = await previewOf("姓名,電話,生日,備註,客戶編號\n王小美,0912-345-678,1990-01-01,VIP,A001\n");
  var row = preview.rows[0];
  assert.equal(row.rowNumber, 2);
  assert.deepEqual(row.normalized, {
    name: "王小美",
    phone: "0912345678",
    birthday: "1990-01-01",
    note: "VIP",
    customerNo: "A001"
  });
  assert.equal(row.canonicalKey, "phone:0912345678");
  assert.equal(row.maskedPreview.phone, "09******78");
  assert.deepEqual(row.errors, []);
  assert.deepEqual(row.conflicts, []);
});

test("姓名空白、非法生日、note 超長都是 error；note 恰 2000 字通過", async function () {
  var okNote = "字".repeat(2000);
  var badNote = "字".repeat(2001);
  var preview = await previewOf(
    "姓名,電話,生日,備註\n" +
    ",0912345678,1990-01-01,x\n" +
    "李大明,0987654321,1990-02-30,x\n" +
    '林小華,0911111111,1990-01-01,"' + okNote + '"\n' +
    '陳小玉,0922222222,1990-01-01,"' + badNote + '"\n'
  );
  assert.ok(preview.rows[0].errors.some(function (e) { return /姓名不可空白/.test(e); }));
  assert.ok(preview.rows[1].errors.some(function (e) { return /YYYY-MM-DD/.test(e); }));
  assert.deepEqual(preview.rows[2].errors, [], "2000 字備註必須通過");
  assert.ok(preview.rows[3].errors.some(function (e) { return /2000/.test(e); }));
  assert.equal(preview.errors, 3);
});

test("真實生日通過；customer_no 未提供保留 null；空電話 warning 可匯入", async function () {
  var preview = await previewOf("姓名,電話,生日\n王小美,,2000-02-29\n");
  var row = preview.rows[0];
  assert.deepEqual(row.errors, []);
  assert.equal(row.normalized.birthday, "2000-02-29", "閏年日期為真實日期");
  assert.equal(row.normalized.customerNo, null);
  assert.equal(row.normalized.phone, "");
  assert.equal(row.canonicalKey, null, "無電話不產生 canonicalKey");
  assert.ok(row.warnings.length >= 1);
  assert.equal(preview.valid, 1, "空電話仍列為可匯入");
});

test("同一 CSV 內相同電話：全部標記 conflict，不擇一", async function () {
  var preview = await previewOf(
    "姓名,電話\n王小美,0912345678\n李大明,+886912345678\n林小華,0987654321\n"
  );
  assert.equal(preview.conflictsInFile, 2, "格式不同但標準化後相同也算重複");
  assert.ok(preview.rows[0].conflicts.length && preview.rows[1].conflicts.length);
  assert.deepEqual(preview.rows[2].conflicts, []);
  assert.equal(preview.valid, 1);
});

test("同一 CSV 內 customer_no 重複：全部 error", async function () {
  var preview = await previewOf(
    "姓名,電話,客戶編號\n王小美,0912345678,A001\n李大明,0987654321,A001\n"
  );
  assert.ok(preview.rows[0].errors.some(function (e) { return /A001/.test(e); }));
  assert.ok(preview.rows[1].errors.some(function (e) { return /A001/.test(e); }));
  assert.equal(preview.errors, 2);
});

test("姓名相同但電話不同：不視為重複", async function () {
  var preview = await previewOf(
    "姓名,電話\n王小美,0912345678\n王小美,0987654321\n"
  );
  assert.equal(preview.conflictsInFile, 0);
  assert.equal(preview.errors, 0);
  assert.equal(preview.valid, 2);
});

test("錯誤訊息與 maskedPreview 不洩漏完整電話", async function () {
  var preview = await previewOf("姓名,電話\n王小美,0912345678\n李大明,09abc12345\n");
  var text = JSON.stringify(preview.rows.map(function (r) {
    return { maskedPreview: r.maskedPreview, errors: r.errors, warnings: r.warnings };
  }));
  assert.ok(!text.includes("0912345678"), "maskedPreview 不得含完整電話");
  assert.ok(!text.includes("09abc12345"), "錯誤訊息不得含完整原始電話");
  assert.ok(preview.rows[1].errors[0].includes("*"), "錯誤訊息顯示遮罩後電話");
});

test("maskPhoneForDisplay：頭尾各 2 碼，過短全遮", function () {
  assert.equal(maskPhoneForDisplay("0912345678"), "09******78");
  assert.equal(maskPhoneForDisplay("123"), "***");
  assert.equal(maskPhoneForDisplay(""), "");
});

// ── canonical serialization 與 hash ──────────────────────────

test("canonical serialization：BOM／CRLF／外圍空白／電話格式差異不影響 hash", async function () {
  var a = await previewOf("\uFEFF姓名,電話\r\n王小美 ,0912-345-678\r\n");
  var b = await previewOf("姓名,電話\n 王小美,+886912345678\n");
  assert.equal(a.canonicalHash, b.canonicalHash);
  assert.match(a.canonicalHash, /^[0-9a-f]{64}$/);

  var parsed = parseCsv("姓名,電話\n王小美,0912345678\n");
  var mapping = resolveColumnMapping(parsed.header);
  var rows = normalizeImportRows(parsed.header, parsed.rows, mapping);
  var canonical = buildCanonicalString(parsed.header, mapping, rows);
  assert.ok(canonical.includes(IMPORT_SCHEMA_VERSION), "canonical 內含 schema version");
});

test("preview DTO 不含 canonicalString，只回 canonicalHash", async function () {
  var preview = await previewOf("姓名,電話\n王小美,0912345678\n");
  assert.equal(preview.canonicalString, undefined, "canonicalString 不得出現在 DTO");
  assert.match(preview.canonicalHash, /^[0-9a-f]{64}$/, "仍須回 64 字元 SHA-256");
  assert.deepEqual(
    Object.keys(preview).sort(),
    ["canonicalHash", "conflictsInFile", "errors", "mapping", "rows", "total", "valid", "warnings"],
    "DTO 只含指定欄位"
  );
});

test("內容改變或 mapping 改變時 hash 必須改變", async function () {
  var base = await previewOf("姓名,電話,舊電話\n王小美,0912345678,0987654321\n");
  var contentChanged = await previewOf("姓名,電話,舊電話\n王小美,0912345679,0987654321\n");
  var mappingChanged = await previewOf(
    "姓名,電話,舊電話\n王小美,0912345678,0987654321\n",
    { phone: "舊電話" }
  );
  assert.notEqual(base.canonicalHash, contentChanged.canonicalHash);
  assert.notEqual(base.canonicalHash, mappingChanged.canonicalHash);
});

test("buildCanonicalString／computeCanonicalHash 可獨立呼叫且 deterministic", async function () {
  var parsed = parseCsv("姓名,電話\n王小美,0912345678\n");
  var mapping = resolveColumnMapping(parsed.header);
  var rows = normalizeImportRows(parsed.header, parsed.rows, mapping);
  var canonical1 = buildCanonicalString(parsed.header, mapping, rows);
  var canonical2 = buildCanonicalString(parsed.header, mapping, rows);
  assert.equal(canonical1, canonical2);
  assert.equal(await computeCanonicalHash(canonical1), await computeCanonicalHash(canonical2));
});

// ── 預覽摘要 ─────────────────────────────────────────────────

test("預覽摘要只回報檔案層資訊，不宣稱 DB 相關結果", async function () {
  var preview = await previewOf(
    "姓名,電話\n王小美,0912345678\n李大明,\n,0987654321\n"
  );
  assert.equal(preview.total, 3);
  assert.equal(preview.valid, 2, "空電話 warning 仍可匯入；姓名空白為 error");
  assert.equal(preview.warnings, 1);
  assert.equal(preview.errors, 1);
  assert.equal(preview.conflictsInFile, 0);
  assert.ok(!("willCreate" in preview), "不得宣稱 willCreate");
  assert.ok(!("skipped" in preview), "不得宣稱 skipped");
  assert.ok(!("conflictsWithDb" in preview), "不得宣稱 conflictsWithDb");
});

test("summarizeImportRows 與 buildImportPreview 計數一致", async function () {
  var parsed = parseCsv("姓名,電話\n王小美,0912345678\n王小美,0912345678\n");
  var mapping = resolveColumnMapping(parsed.header);
  var rows = normalizeImportRows(parsed.header, parsed.rows, mapping);
  var summary = summarizeImportRows(rows);
  assert.equal(summary.total, 2);
  assert.equal(summary.valid, 0, "重複電話全部 conflict，不擇一");
  assert.equal(summary.conflictsInFile, 2);
});
