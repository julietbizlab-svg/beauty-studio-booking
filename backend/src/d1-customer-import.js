/**
 * 客戶 CSV 匯入 — D1 repository（Phase 3b-2）
 *
 * previewCustomerImport：解析＋DB 查重，完全零寫入。
 * commitCustomerImport：重新解析與查重（不信任 preview 結果），
 * 以單一 D1 batch 寫入 customers＋customer_import_batches＋audit_logs。
 *
 * 安全規則：
 * - 查重只用 tenant_id＋標準化電話＋customer_no 精確比對，姓名永不作查詢鍵
 * - 絕不建立、更新或猜測 line_accounts（認領另有流程）
 * - 回應與 audit 不含 CSV 原文、canonicalString、完整電話或 LINE userId
 * - 所有值走 parameter bind，不拼接進 SQL
 * - UNIQUE(tenant_id, content_hash) 為重複 commit 的最後防線
 */
import {
  buildImportPreview,
  normalizeImportedPhone,
  IMPORT_SCHEMA_VERSION
} from "./customer-import.js";

/** 正式 commit 單批上限（preview 仍可到 500；超過需拆批） */
export var IMPORT_COMMIT_MAX_ROWS = 100;

/** IN 查詢分組大小（D1 每個查詢最多 100 個 bind，含 tenant 留餘裕） */
var IN_QUERY_CHUNK_SIZE = 80;

/** 多列 INSERT 每個 statement 的列數（每列 ≤10 bind，維持 ≤100 bind） */
var INSERT_ROWS_PER_STATEMENT = 10;

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

function ensureD1Env(env) {
  if (!env || !env.DB) {
    throw makeError("缺少 D1 資料庫綁定（DB），請確認 wrangler 設定", 500);
  }
  if (!env.TENANT_ID) {
    throw makeError("缺少 TENANT_ID 設定", 500);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function chunk(items, size) {
  var chunks = [];
  for (var i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function uniqueValues(values) {
  var seen = {};
  var out = [];
  values.forEach(function (value) {
    if (!value || seen[value]) {
      return;
    }
    seen[value] = true;
    out.push(value);
  });
  return out;
}

/**
 * 為標準化電話建立 DB 查詢候選（同一支台灣手機的常見國碼寫法）。
 * 09xxxxxxxx → 09…／+8869…／8869…／+88609…／88609…；
 * 其他 8～15 碼電話維持精確正規化比對（只有自身一個候選），不做模糊配對。
 */
function buildPhoneQueryCandidates(normalizedPhone) {
  var candidates = [normalizedPhone];
  if (/^09\d{8}$/.test(normalizedPhone)) {
    var withoutZero = normalizedPhone.slice(1); // 9xxxxxxxx
    candidates.push(
      "+886" + withoutZero,
      "886" + withoutZero,
      "+886" + normalizedPhone,
      "886" + normalizedPhone
    );
  }
  return candidates;
}

/**
 * 依標準化電話查既有客戶（分組 IN placeholders、tenant scoped）。
 *
 * DB 端只做必要的 dash／space 移除後，用候選清單精確比對
 * （既有 mobile 可能存 0912-345-678、+886 912-345-678 等格式）；
 * 取回 stored mobile 後，再以 Phase 3a 的 normalizeImportedPhone
 * 做最終正規化，map key 一律使用其回傳的 value——與匯入列的
 * normalized.phone 同一套規則，不另寫第二套。
 * display_name 只取回做「同名 → skipped」比較，不回傳給 API client。
 */
async function fetchPhoneMatches(env, phones) {
  var map = {};
  var candidates = uniqueValues(phones.reduce(function (all, phone) {
    return all.concat(buildPhoneQueryCandidates(phone));
  }, []));

  var groups = chunk(candidates, IN_QUERY_CHUNK_SIZE);
  for (var i = 0; i < groups.length; i++) {
    var group = groups[i];
    var placeholders = group.map(function () { return "?"; }).join(", ");
    var result = await env.DB.prepare(
      "SELECT c.mobile, c.display_name, " +
      "CASE WHEN la.id IS NULL THEN 0 ELSE 1 END AS has_line " +
      "FROM customers c " +
      "LEFT JOIN line_accounts la " +
      "ON la.tenant_id = c.tenant_id AND la.customer_id = c.id " +
      "WHERE c.tenant_id = ? " +
      "AND REPLACE(REPLACE(COALESCE(c.mobile, ''), '-', ''), ' ', '') " +
      "IN (" + placeholders + ")"
    ).bind(env.TENANT_ID, ...group).all();

    (result.results || []).forEach(function (row) {
      var normalized = normalizeImportedPhone(row.mobile);
      var key = normalized.error ? "" : normalized.value;
      if (!key) {
        return;
      }
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push({
        name: String(row.display_name || "").trim(),
        hasLine: Boolean(row.has_line)
      });
    });
  }
  return map;
}

/** 依 customer_no 查既有客戶（分組 IN placeholders、tenant scoped） */
async function fetchExistingCustomerNos(env, customerNos) {
  var existing = {};
  var groups = chunk(customerNos, IN_QUERY_CHUNK_SIZE);
  for (var i = 0; i < groups.length; i++) {
    var group = groups[i];
    var placeholders = group.map(function () { return "?"; }).join(", ");
    var result = await env.DB.prepare(
      "SELECT customer_no FROM customers " +
      "WHERE tenant_id = ? AND customer_no IN (" + placeholders + ")"
    ).bind(env.TENANT_ID, ...group).all();

    (result.results || []).forEach(function (row) {
      existing[row.customer_no] = true;
    });
  }
  return existing;
}

/**
 * 將 Phase 3a 的列結果對 DB 查重後標記 outcome：
 * - error：檔內格式錯誤（維持）
 * - conflict：檔內重複電話、customer_no 已存在、同電話姓名不符、
 *   同電話已綁 LINE（訊息不透露另一位客戶的任何資料）
 * - skipped：同電話同姓名且未綁 LINE
 * - willCreate：其餘（含空電話且未提供 customer_no）
 */
async function classifyRows(env, previewRows) {
  var phones = uniqueValues(previewRows.map(function (row) {
    return row.errors.length ? "" : row.normalized.phone;
  }));
  var customerNos = uniqueValues(previewRows.map(function (row) {
    return row.errors.length ? null : row.normalized.customerNo;
  }));

  var phoneMatches = phones.length ? await fetchPhoneMatches(env, phones) : {};
  var existingNos = customerNos.length
    ? await fetchExistingCustomerNos(env, customerNos)
    : {};

  return previewRows.map(function (row) {
    var conflicts = row.conflicts.slice();
    var outcome;

    if (row.errors.length) {
      outcome = "error";
    } else {
      if (row.normalized.customerNo && existingNos[row.normalized.customerNo]) {
        conflicts.push("客戶編號「" + row.normalized.customerNo + "」已存在");
      }

      var matches = row.normalized.phone
        ? phoneMatches[row.normalized.phone]
        : null;
      var skippedByDb = false;
      if (matches && matches.length) {
        var anyLinked = matches.some(function (m) { return m.hasLine; });
        var anyNameMismatch = matches.some(function (m) {
          return m.name !== row.normalized.name;
        });
        if (anyLinked) {
          conflicts.push("此電話已有綁定 LINE 的客戶，請由店家處理");
        } else if (anyNameMismatch) {
          conflicts.push("此電話已有既有客戶但姓名不符，請由店家確認");
        } else {
          skippedByDb = true;
        }
      }

      if (conflicts.length) {
        outcome = "conflict";
      } else if (skippedByDb) {
        outcome = "skipped";
      } else {
        outcome = "willCreate";
      }
    }

    return {
      rowNumber: row.rowNumber,
      outcome: outcome,
      errors: row.errors,
      warnings: row.warnings,
      conflicts: conflicts,
      maskedPreview: row.maskedPreview,
      normalized: row.normalized // 只供內部 commit 使用，不進 DTO
    };
  });
}

/** 對外列 DTO：不含 normalized（完整電話只存在於 maskedPreview 遮罩值） */
function toPublicRow(row) {
  return {
    rowNumber: row.rowNumber,
    outcome: row.outcome,
    errors: row.errors,
    warnings: row.warnings,
    conflicts: row.conflicts,
    maskedPreview: row.maskedPreview
  };
}

function countOutcome(rows, outcome) {
  return rows.filter(function (row) { return row.outcome === outcome; }).length;
}

function buildSummary(rows) {
  return {
    total: rows.length,
    willCreate: countOutcome(rows, "willCreate"),
    skipped: countOutcome(rows, "skipped"),
    conflicts: countOutcome(rows, "conflict"),
    errors: countOutcome(rows, "error"),
    warnings: rows.filter(function (row) { return row.warnings.length > 0; }).length
  };
}

/**
 * POST /api/owner/customers/import/preview 的 repository 實作。
 * 完全零寫入：不寫 customers、customer_import_batches、audit_logs。
 */
export async function previewCustomerImport(env, payload) {
  ensureD1Env(env);
  var input = payload || {};
  var preview = await buildImportPreview(input.csvText, input.mapping);
  var rows = await classifyRows(env, preview.rows);

  return {
    ok: true,
    canonicalHash: preview.canonicalHash,
    summary: buildSummary(rows),
    rows: rows.map(toPublicRow)
  };
}

/** 確認 env.STAFF_ID 屬於本 tenant（fail closed，不洩漏設定值） */
async function ensureStaffBelongsToTenant(env) {
  if (!env.STAFF_ID) {
    throw makeError("匯入人員設定錯誤，請確認工作室設定", 500);
  }
  var staffRow = await env.DB.prepare(
    "SELECT id FROM staff WHERE tenant_id = ?1 AND id = ?2"
  ).bind(env.TENANT_ID, env.STAFF_ID).first();
  if (!staffRow) {
    throw makeError("匯入人員設定錯誤，請確認工作室設定", 500);
  }
}

/** 依 tenant＋content_hash 查既有批次（冪等判斷） */
async function findBatchByHash(env, contentHash) {
  return env.DB.prepare(
    "SELECT id, content_hash, total_rows, created_count, skipped_count, " +
    "conflict_count, warning_count " +
    "FROM customer_import_batches " +
    "WHERE tenant_id = ?1 AND content_hash = ?2"
  ).bind(env.TENANT_ID, contentHash).first();
}

function alreadyImportedResponse(batchRow) {
  return {
    ok: true,
    alreadyImported: true,
    batchId: batchRow.id,
    canonicalHash: batchRow.content_hash,
    summary: {
      total: batchRow.total_rows,
      created: batchRow.created_count,
      skipped: batchRow.skipped_count,
      conflicts: batchRow.conflict_count,
      warnings: batchRow.warning_count
    }
  };
}

var CUSTOMER_INSERT_COLUMNS =
  "(id, tenant_id, customer_no, display_name, mobile, birthday, notes, " +
  "source, status, created_at, updated_at)";

var AUDIT_INSERT_COLUMNS =
  "(id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, " +
  "source, metadata_json, created_at)";

/**
 * POST /api/owner/customers/import/commit 的 repository 實作。
 *
 * 冪等：同 tenant＋content_hash 已存在 → 200 alreadyImported，零寫入；
 * 兩個相同 hash 的 commit 同時到達時，UNIQUE(tenant_id, content_hash)
 * 使後到的整批 batch 回滾，再轉為 alreadyImported 回應。
 * 所有寫入（customers＋batch metadata＋audit）在同一次 env.DB.batch。
 */
export async function commitCustomerImport(env, payload) {
  ensureD1Env(env);
  var input = payload || {};

  var requestHash = String(input.canonicalHash || "").trim();
  if (!requestHash) {
    throw makeError("缺少 canonicalHash，請先執行預覽", 400);
  }

  // 重新解析，不信任 preview 結果（以下三個檢查皆零 DB 存取）
  var preview = await buildImportPreview(input.csvText, input.mapping);

  if (preview.total > IMPORT_COMMIT_MAX_ROWS) {
    throw makeError(
      "單批正式匯入最多 " + IMPORT_COMMIT_MAX_ROWS + " 筆，請拆成多批",
      400
    );
  }
  if (preview.canonicalHash !== requestHash) {
    throw makeError("內容與預覽不符（canonicalHash 不一致），請重新預覽", 409);
  }
  if (preview.errors > 0) {
    throw makeError(
      "CSV 內有 " + preview.errors + " 列格式錯誤，整批未匯入，請修正後重試",
      400
    );
  }

  await ensureStaffBelongsToTenant(env);

  var existingBatch = await findBatchByHash(env, requestHash);
  if (existingBatch) {
    return alreadyImportedResponse(existingBatch);
  }

  // preview 之後 DB 可能已改變：commit 一律重新查重
  var rows = await classifyRows(env, preview.rows);
  var summary = buildSummary(rows);
  var now = nowIso();
  var batchId = crypto.randomUUID();

  var statements = [];

  statements.push(env.DB.prepare(
    "INSERT INTO customer_import_batches " +
    "(id, tenant_id, content_hash, schema_version, status, total_rows, " +
    "created_count, skipped_count, conflict_count, warning_count, " +
    "created_by_staff_id, created_at, committed_at) " +
    "VALUES (?, ?, ?, ?, 'committed', ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    batchId,
    env.TENANT_ID,
    requestHash,
    IMPORT_SCHEMA_VERSION,
    summary.total,
    summary.willCreate,
    summary.skipped,
    summary.conflicts,
    summary.warnings,
    env.STAFF_ID,
    now,
    now
  ));

  var createdRows = rows.filter(function (row) {
    return row.outcome === "willCreate";
  });
  var createdCustomers = createdRows.map(function (row) {
    return {
      id: crypto.randomUUID(),
      customerNo: row.normalized.customerNo || ("CUS-" + crypto.randomUUID()),
      name: row.normalized.name,
      phone: row.normalized.phone || null,
      birthday: row.normalized.birthday || null,
      note: row.normalized.note || null
    };
  });

  chunk(createdCustomers, INSERT_ROWS_PER_STATEMENT).forEach(function (group) {
    var valuesSql = group.map(function () {
      return "(?, ?, ?, ?, ?, ?, ?, 'import', 'active', ?, ?)";
    }).join(", ");
    var binds = [];
    group.forEach(function (customer) {
      binds.push(
        customer.id, env.TENANT_ID, customer.customerNo, customer.name,
        customer.phone, customer.birthday, customer.note, now, now
      );
    });
    statements.push(env.DB.prepare(
      "INSERT INTO customers " + CUSTOMER_INSERT_COLUMNS + " VALUES " + valuesSql
    ).bind(...binds));
  });

  // audit：一筆批次摘要（metadata 只含 counts／schemaVersion／contentHash）
  statements.push(env.DB.prepare(
    "INSERT INTO audit_logs " + AUDIT_INSERT_COLUMNS +
    " VALUES (?, ?, 'staff', ?, 'customer.import.commit', " +
    "'customer_import_batch', ?, 'admin', ?, ?)"
  ).bind(
    crypto.randomUUID(),
    env.TENANT_ID,
    env.STAFF_ID,
    batchId,
    JSON.stringify({
      counts: {
        total: summary.total,
        created: summary.willCreate,
        skipped: summary.skipped,
        conflicts: summary.conflicts,
        warnings: summary.warnings
      },
      schemaVersion: IMPORT_SCHEMA_VERSION,
      contentHash: requestHash
    }),
    now
  ));

  // audit：每位新建客戶一筆（metadata 只含 batchId，不存個資）
  chunk(createdCustomers, INSERT_ROWS_PER_STATEMENT).forEach(function (group) {
    var valuesSql = group.map(function () {
      return "(?, ?, 'staff', ?, 'customer.import.create', 'customer', ?, 'admin', ?, ?)";
    }).join(", ");
    var binds = [];
    group.forEach(function (customer) {
      binds.push(
        crypto.randomUUID(), env.TENANT_ID, env.STAFF_ID, customer.id,
        JSON.stringify({ batchId: batchId }), now
      );
    });
    statements.push(env.DB.prepare(
      "INSERT INTO audit_logs " + AUDIT_INSERT_COLUMNS + " VALUES " + valuesSql
    ).bind(...binds));
  });

  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error && error.message))) {
      // 競態：同 hash 的另一個 commit 先寫入 → 整批已回滾，轉冪等回應
      var racedBatch = await findBatchByHash(env, requestHash);
      if (racedBatch) {
        return alreadyImportedResponse(racedBatch);
      }
    }
    throw makeError("匯入寫入失敗，整批未建立任何客戶，請重試", 500);
  }

  return {
    ok: true,
    alreadyImported: false,
    batchId: batchId,
    canonicalHash: requestHash,
    summary: {
      total: summary.total,
      created: summary.willCreate,
      skipped: summary.skipped,
      conflicts: summary.conflicts,
      warnings: summary.warnings
    },
    rows: rows.map(toPublicRow)
  };
}
