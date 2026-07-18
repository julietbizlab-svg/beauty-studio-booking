/**
 * 客戶試算表匯入 — CSV 解析、欄位對應、正規化與預覽（Phase 3a）
 *
 * 本模組只有純函式：不讀 env、不連 D1、不寫檔案、無任何副作用
 * （computeCanonicalHash 使用 Web Crypto 計算 SHA-256，仍無 D1 副作用）。
 *
 * 安全規則：
 * - 重複判定只用「正規化後的電話」精確比對，永不使用姓名
 * - 本模組不建立、不推測任何 LINE 對應（line_accounts 交由認領流程）
 * - 錯誤訊息與 maskedPreview 中的電話一律遮罩，不洩漏完整號碼
 */

/** canonical serialization 的 schema 版本；欄位或規則改變時必須遞增 */
export var IMPORT_SCHEMA_VERSION = "customer-import-v1";

/** CSV 原文 UTF-8 bytes 上限（512KB） */
export var CSV_MAX_BYTES = 512 * 1024;

/** 資料列上限（不含標頭） */
export var CSV_MAX_ROWS = 500;

/** 欄位數上限 */
export var CSV_MAX_COLUMNS = 20;

/** 備註長度上限（與 owner PATCH 的 note 規則一致） */
export var IMPORT_NOTE_MAX_LENGTH = 2000;

/** 匯入目標欄位與常見中文別名（英文別名以小寫比對） */
var TARGET_ALIASES = {
  name: ["name", "姓名", "名字", "客戶姓名"],
  phone: ["phone", "電話", "手機", "手機號碼", "聯絡電話"],
  birthday: ["birthday", "生日", "出生日期"],
  note: ["note", "備註", "特別事項", "客戶備註"],
  customer_no: ["customer_no", "客戶編號", "會員編號"]
};

var TARGET_FIELDS = ["name", "phone", "birthday", "note", "customer_no"];

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

/** 全形數字與電話常見全形符號轉半形 */
function toHalfWidth(value) {
  return String(value)
    .replace(/[\uFF10-\uFF19]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    })
    .replace(/\uFF0B/g, "+")
    .replace(/[\uFF0D\u2013\u2014\u2212]/g, "-")
    .replace(/\uFF08/g, "(")
    .replace(/\uFF09/g, ")")
    .replace(/\u3000/g, " ");
}

/** 真實日期驗證（round-trip，拒絕 2026-02-30 這類自動進位輸入） */
function isRealDateString(value) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) {
    return false;
  }
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

/** 電話遮罩：保留頭尾各 2 碼，其餘以 * 取代（過短則全遮） */
export function maskPhoneForDisplay(phone) {
  var s = String(phone == null ? "" : phone);
  if (!s) {
    return "";
  }
  if (s.length <= 4) {
    return "*".repeat(s.length);
  }
  return s.slice(0, 2) + "*".repeat(s.length - 4) + s.slice(-2);
}

/**
 * 最小 RFC 4180 相容 CSV 解析。
 * 支援 BOM、CRLF／LF、quoted field（含逗號、換行、"" escape）、
 * 空欄位、空白列（一律略過）、中文標頭與內容。
 *
 * 回傳 { header, rows }；header 已 trim。
 * rowNumber 慣例：標頭為第 1 筆 record，第一筆資料列為第 2 筆
 * （quoted 換行使 record 編號可能與實體行號不同）。
 */
export function parseCsv(csvText) {
  if (typeof csvText !== "string") {
    throw makeError("CSV 內容必須是文字", 400);
  }
  if (new TextEncoder().encode(csvText).length > CSV_MAX_BYTES) {
    throw makeError("CSV 檔案過大，上限 512KB", 400);
  }

  var text = csvText.charCodeAt(0) === 0xFEFF ? csvText.slice(1) : csvText;

  var records = [];
  var record = [];
  var field = "";
  var inQuotes = false;
  var i = 0;

  function endField() {
    record.push(field);
    field = "";
  }
  function endRecord() {
    endField();
    records.push(record);
    record = [];
  }

  while (i < text.length) {
    var ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      endField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") {
        i += 1;
      }
      endRecord();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      endRecord();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (inQuotes) {
    throw makeError("CSV 格式錯誤：引號未閉合", 400);
  }
  if (field !== "" || record.length) {
    endRecord();
  }

  // 略過完全空白的 record（含空白尾列）
  records = records.filter(function (cells) {
    return cells.some(function (cell) { return String(cell).trim() !== ""; });
  });

  if (!records.length) {
    throw makeError("CSV 缺少標頭列", 400);
  }

  var header = records[0].map(function (cell) { return String(cell).trim(); });
  if (header.length > CSV_MAX_COLUMNS) {
    throw makeError("CSV 欄位數過多，上限 " + CSV_MAX_COLUMNS + " 欄", 400);
  }

  var seenHeaders = {};
  header.forEach(function (h) {
    if (!h) {
      return;
    }
    if (seenHeaders[h]) {
      throw makeError("CSV 標頭重複：「" + h + "」", 400);
    }
    seenHeaders[h] = true;
  });

  var rows = records.slice(1);
  if (!rows.length) {
    throw makeError("CSV 只有標頭，沒有資料列", 400);
  }
  if (rows.length > CSV_MAX_ROWS) {
    throw makeError("CSV 資料列過多，上限 " + CSV_MAX_ROWS + " 列", 400);
  }

  rows = rows.map(function (cells, index) {
    if (cells.length > header.length) {
      throw makeError("第 " + (index + 2) + " 列欄位數超過標頭欄位數", 400);
    }
    while (cells.length < header.length) {
      cells.push("");
    }
    return cells;
  });

  return { header: header, rows: rows };
}

/**
 * 欄位對應：手動 mapping（target → 來源標頭名稱）優先，
 * 其餘目標欄以別名自動判斷（同名候選取第一個未被使用的來源欄）。
 *
 * 規則：name 必須有對應；同一來源欄不可對應兩個目標欄；
 * 不認識的來源欄一律忽略。
 * 回傳 { name, phone, birthday, note, customer_no }（值為欄位 index 或 null）。
 */
export function resolveColumnMapping(header, manualMapping) {
  var manual = manualMapping || {};
  var mapping = {
    name: null,
    phone: null,
    birthday: null,
    note: null,
    customer_no: null
  };

  Object.keys(manual).forEach(function (key) {
    if (TARGET_FIELDS.indexOf(key) === -1) {
      throw makeError("不支援的匯入欄位「" + key + "」", 400);
    }
  });

  TARGET_FIELDS.forEach(function (target) {
    var wanted = manual[target];
    if (wanted === undefined || wanted === null || String(wanted).trim() === "") {
      return;
    }
    var wantedName = String(wanted).trim();
    var index = header.indexOf(wantedName);
    if (index === -1) {
      throw makeError("手動欄位對應找不到來源欄「" + wantedName + "」", 400);
    }
    mapping[target] = index;
  });

  TARGET_FIELDS.forEach(function (target) {
    if (mapping[target] !== null) {
      return;
    }
    var aliases = TARGET_ALIASES[target];
    for (var i = 0; i < header.length; i++) {
      var normalizedHeader = header[i].trim().toLowerCase();
      if (aliases.indexOf(normalizedHeader) === -1 &&
          aliases.indexOf(header[i].trim()) === -1) {
        continue;
      }
      var alreadyUsed = TARGET_FIELDS.some(function (other) {
        return mapping[other] === i;
      });
      if (alreadyUsed) {
        continue;
      }
      mapping[target] = i;
      break;
    }
  });

  var usedBy = {};
  TARGET_FIELDS.forEach(function (target) {
    var index = mapping[target];
    if (index === null) {
      return;
    }
    if (usedBy[index] !== undefined) {
      throw makeError(
        "來源欄「" + header[index] + "」不可同時對應「" +
        usedBy[index] + "」與「" + target + "」",
        400
      );
    }
    usedBy[index] = target;
  });

  if (mapping.name === null) {
    throw makeError("找不到姓名欄位，請提供欄位對應", 400);
  }

  return mapping;
}

/**
 * 匯入電話標準化（純函式）。
 * 回傳 { value, warnings, error }：
 * - 台灣手機 09 加 8 碼 → value 為標準化號碼，無 warning
 * - +8869…／8869…（含市話 +886…）→ 轉 0 開頭再判斷
 * - 其他 8～15 碼數字 → 保留但回 warning
 * - 空白 → value 空字串＋warning
 * - 含英文字母等非法字元 → error
 */
export function normalizeImportedPhone(rawPhone) {
  var half = toHalfWidth(rawPhone == null ? "" : rawPhone).trim();
  if (half === "") {
    return { value: "", warnings: ["未提供電話"], error: null };
  }

  var cleaned = half.replace(/[\s\-()]/g, "");
  if (!/^\+?\d+$/.test(cleaned)) {
    return { value: "", warnings: [], error: "電話含非法字元" };
  }

  if (/^\+?886\d+$/.test(cleaned)) {
    // 移除台灣國碼；常見 +8860 混寫（國碼後已有 0）不再額外補 0
    var rest = cleaned.replace(/^\+?886/, "");
    cleaned = rest.charAt(0) === "0" ? rest : "0" + rest;
  }

  if (/^09\d{8}$/.test(cleaned)) {
    return { value: cleaned, warnings: [], error: null };
  }

  var digitCount = cleaned.replace(/^\+/, "").length;
  if (digitCount >= 8 && digitCount <= 15) {
    return {
      value: cleaned,
      warnings: ["非台灣手機格式，請確認號碼"],
      error: null
    };
  }

  return { value: "", warnings: [], error: "電話長度不正確" };
}

/**
 * 逐列正規化與驗證＋整份 CSV 的跨列檢查。
 *
 * 每列輸出：
 * { rowNumber, normalized, maskedPreview, errors, warnings, conflicts, canonicalKey }
 *
 * - canonicalKey 只由非空的標準化電話產生（"phone:09…"），永不使用姓名
 * - 同一 CSV 內相同非空電話：全部標記 conflict，不自行擇一
 * - customer_no 同一 CSV 內重複：全部標記 error
 * - customer_no 未提供時保留 null（未來 commit 由 repository 產生 CUS- 開頭編號）
 */
export function normalizeImportRows(header, rows, mapping) {
  var results = rows.map(function (cells, index) {
    var rowNumber = index + 2;
    var errors = [];
    var warnings = [];
    var conflicts = [];

    function cellOf(target) {
      var columnIndex = mapping[target];
      if (columnIndex === null || columnIndex === undefined) {
        return "";
      }
      return String(cells[columnIndex] == null ? "" : cells[columnIndex]);
    }

    var name = cellOf("name").trim();
    if (!name) {
      errors.push("姓名不可空白");
    }

    var rawPhone = cellOf("phone");
    var phoneResult = normalizeImportedPhone(rawPhone);
    if (phoneResult.error) {
      errors.push(
        phoneResult.error + "：" +
        maskPhoneForDisplay(toHalfWidth(rawPhone).trim())
      );
    }
    phoneResult.warnings.forEach(function (w) { warnings.push(w); });

    var birthday = cellOf("birthday").trim();
    if (birthday && !isRealDateString(birthday)) {
      errors.push("生日格式請使用 YYYY-MM-DD");
    }

    var note = cellOf("note").trim();
    if (note.length > IMPORT_NOTE_MAX_LENGTH) {
      errors.push("備註最長 " + IMPORT_NOTE_MAX_LENGTH + " 字");
    }

    var customerNo = cellOf("customer_no").trim() || null;

    var normalized = {
      name: name,
      phone: phoneResult.value,
      birthday: birthday,
      note: note,
      customerNo: customerNo
    };

    var maskedPhone = phoneResult.value
      ? maskPhoneForDisplay(phoneResult.value)
      : maskPhoneForDisplay(toHalfWidth(rawPhone).trim());

    return {
      rowNumber: rowNumber,
      normalized: normalized,
      maskedPreview: {
        name: name,
        phone: maskedPhone,
        birthday: birthday,
        note: note,
        customerNo: customerNo
      },
      errors: errors,
      warnings: warnings,
      conflicts: conflicts,
      canonicalKey: phoneResult.value && !phoneResult.error
        ? "phone:" + phoneResult.value
        : null
    };
  });

  // 跨列：同一 CSV 內相同非空電話 → 全部 conflict
  var rowsByPhoneKey = {};
  results.forEach(function (row) {
    if (!row.canonicalKey) {
      return;
    }
    if (!rowsByPhoneKey[row.canonicalKey]) {
      rowsByPhoneKey[row.canonicalKey] = [];
    }
    rowsByPhoneKey[row.canonicalKey].push(row);
  });
  Object.keys(rowsByPhoneKey).forEach(function (key) {
    var group = rowsByPhoneKey[key];
    if (group.length < 2) {
      return;
    }
    var rowNumbers = group.map(function (r) { return r.rowNumber; }).join("、");
    group.forEach(function (row) {
      row.conflicts.push("同一 CSV 內電話重複（第 " + rowNumbers + " 列）");
    });
  });

  // 跨列：customer_no 重複 → 全部 error
  var rowsByCustomerNo = {};
  results.forEach(function (row) {
    var no = row.normalized.customerNo;
    if (!no) {
      return;
    }
    if (!rowsByCustomerNo[no]) {
      rowsByCustomerNo[no] = [];
    }
    rowsByCustomerNo[no].push(row);
  });
  Object.keys(rowsByCustomerNo).forEach(function (no) {
    var group = rowsByCustomerNo[no];
    if (group.length < 2) {
      return;
    }
    var rowNumbers = group.map(function (r) { return r.rowNumber; }).join("、");
    group.forEach(function (row) {
      row.errors.push("客戶編號「" + no + "」重複（第 " + rowNumbers + " 列）");
    });
  });

  return results;
}

/**
 * 預覽摘要（本階段無 DB，不宣稱 willCreate／skipped／conflictsWithDb）。
 */
export function summarizeImportRows(rows) {
  return {
    total: rows.length,
    valid: rows.filter(function (r) {
      return !r.errors.length && !r.conflicts.length;
    }).length,
    warnings: rows.filter(function (r) { return r.warnings.length > 0; }).length,
    errors: rows.filter(function (r) { return r.errors.length > 0; }).length,
    conflictsInFile: rows.filter(function (r) {
      return r.conflicts.length > 0;
    }).length,
    rows: rows
  };
}

/**
 * canonical serialization：schema version ＋ 最終 mapping（target → 來源
 * 標頭名稱）＋ 正規化後資料。以正規化結果為輸入，天然不受 BOM、
 * CRLF／LF 與外圍空白影響；資料或 mapping 改變時輸出必然改變。
 */
export function buildCanonicalString(header, mapping, normalizedRows) {
  var mappingDescription = {};
  TARGET_FIELDS.forEach(function (target) {
    mappingDescription[target] = mapping[target] === null
      ? null
      : header[mapping[target]];
  });

  var dataRows = normalizedRows.map(function (row) {
    return [
      row.normalized.name,
      row.normalized.phone,
      row.normalized.birthday,
      row.normalized.note,
      row.normalized.customerNo
    ];
  });

  return JSON.stringify({
    schemaVersion: IMPORT_SCHEMA_VERSION,
    mapping: mappingDescription,
    rows: dataRows
  });
}

/** canonical string 的 SHA-256（hex）。Web Crypto，無 D1 副作用。 */
export async function computeCanonicalHash(canonicalString) {
  var bytes = new TextEncoder().encode(canonicalString);
  var digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(function (b) { return b.toString(16).padStart(2, "0"); })
    .join("");
}

/**
 * 一站式預覽：解析 → 欄位對應 → 正規化 → 摘要＋canonical hash。
 * 純函式組合，無任何 I/O。
 *
 * DTO 只含 total／valid／warnings／errors／conflictsInFile／rows／
 * mapping／canonicalHash：canonicalString 僅供內部計算 hash，
 * 不得出現在 DTO，後續 route、log、audit 也不得保存或輸出。
 */
export async function buildImportPreview(csvText, manualMapping) {
  var parsed = parseCsv(csvText);
  var mapping = resolveColumnMapping(parsed.header, manualMapping);
  var rows = normalizeImportRows(parsed.header, parsed.rows, mapping);
  var summary = summarizeImportRows(rows);
  var canonicalString = buildCanonicalString(parsed.header, mapping, rows);

  return {
    total: summary.total,
    valid: summary.valid,
    warnings: summary.warnings,
    errors: summary.errors,
    conflictsInFile: summary.conflictsInFile,
    rows: summary.rows,
    mapping: mapping,
    canonicalHash: await computeCanonicalHash(canonicalString)
  };
}
