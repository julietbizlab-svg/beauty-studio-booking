function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

function csvCell(value) {
  var text = String(value == null ? "" : value).replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

async function exportCustomerDataForTenant(env, tenantId) {
  var result = await env.DB.prepare(
    "SELECT c.customer_no, c.display_name, c.mobile, c.birthday, c.notes, c.created_at, " +
    "COUNT(b.id) AS booking_count, MAX(b.start_at) AS latest_booking_at " +
    "FROM customers c LEFT JOIN bookings b ON b.tenant_id = c.tenant_id " +
    "AND b.customer_id = c.id WHERE c.tenant_id = ?1 AND c.deleted_at IS NULL " +
    "GROUP BY c.id ORDER BY c.created_at ASC, c.id ASC"
  ).bind(tenantId).all();
  var rows = [
    ["客戶編號", "姓名", "電話", "生日", "備註", "建立時間", "預約筆數", "最近預約時間"]
  ];
  (result.results || []).forEach(function (row) {
    rows.push([
      row.customer_no || "", row.display_name || "", row.mobile || "",
      row.birthday || "", row.notes || "", row.created_at || "",
      Number(row.booking_count) || 0, row.latest_booking_at || ""
    ]);
  });
  return "\uFEFF" + rows.map(function (row) {
    return row.map(csvCell).join(",");
  }).join("\r\n");
}

export async function exportPaidCustomerData(env) {
  if (!env || !env.DB || !env.TENANT_ID) throw makeError("資料匯出服務設定不完整", 500);
  if (String(env.PAID_CUSTOMER_EXPORT_ENABLED || "").toLowerCase() !== "true") {
    throw makeError("找不到此功能", 404);
  }
  return exportCustomerDataForTenant(env, env.TENANT_ID);
}

export async function exportPlatformCustomerData(env, tenantId) {
  var targetTenantId = String(tenantId || "").trim();
  if (!env || !env.DB || !env.TENANT_ID) throw makeError("資料匯出服務設定不完整", 500);
  if (!targetTenantId || targetTenantId === String(env.TENANT_ID)) {
    throw makeError("請指定一般工作室", 400);
  }
  var tenant = await env.DB.prepare(
    "SELECT t.id FROM tenants t WHERE t.id = ?1 AND NOT EXISTS (" +
    "SELECT 1 FROM tenant_settings ts WHERE ts.tenant_id = t.id " +
    "AND ts.setting_key = 'platform_acceptance_mode' AND ts.setting_value = 'true') LIMIT 1"
  ).bind(targetTenantId).first();
  if (!tenant) throw makeError("找不到指定工作室", 404);
  return exportCustomerDataForTenant(env, targetTenantId);
}
