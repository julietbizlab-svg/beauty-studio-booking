/**
 * 客戶前後對比照片 — D1 metadata ＋ 私有 R2 binary
 *
 * 架構：
 * - 圖片 binary 只存私有 R2 bucket（建議 beauty-studio-photos-v2，
 *   binding PHOTO_BUCKET），不建立 public access，不回公開 URL。
 * - D1 只存安全 metadata（customer_photo_sets／customer_photos），
 *   不存 binary、base64、公開 URL、原始檔名或任何客戶個資。
 * - 所有讀取皆由 Worker 在 requireOwnerFromRequest 之後串流。
 *
 * 安全規則：
 * - object key 使用不可猜測 UUID：customer-photos/<tenant>/<uuid>，
 *   不含姓名、電話、生日、LINE userId、customer_no 或原始檔名，
 *   且永不回傳給前端、不寫入 audit、不出現在錯誤訊息。
 * - 格式只允許 JPEG／PNG／WebP：不信任副檔名與 Content-Type，
 *   一律檢查 magic bytes；宣告 MIME 與 magic bytes 不一致即拒絕。
 * - 單張硬上限 5 MB。
 * - audit 不含 object key、binary、base64、姓名、電話或 LINE userId。
 *
 * D1／R2 一致性（無跨系統交易，採補償策略）：
 * - 上傳：先驗證 → R2 put 新物件 → D1 batch（軟刪舊照＋INSERT 新照
 *   ＋audit）→ D1 失敗則補償刪除剛寫入的 R2 物件 → D1 成功後才刪
 *   舊 R2 物件；舊物件刪除失敗不回退新照片，回報 cleanupPending，
 *   舊 object key 仍留在軟刪列中可重試清理。
 * - 刪除：先 D1 軟刪（保留 object_key 供追蹤）→ 再刪 R2；R2 失敗
 *   回報 cleanupPending，可安全重試，不會出現 D1 已刪但物件永久
 *   無法追蹤的狀態。
 */

/** 單張照片硬上限（bytes）＝ 5 MB */
export var MAX_PHOTO_BYTES = 5 * 1024 * 1024;

var ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

var PHOTO_SET_TITLE_MAX_LENGTH = 100;

function makeError(message, status) {
  var error = new Error(message);
  error.status = status || 400;
  return error;
}

function ensurePhotoEnv(env) {
  if (!env || !env.DB) {
    throw makeError("缺少 D1 資料庫綁定（DB），請確認 wrangler 設定", 500);
  }
  if (!env.TENANT_ID) {
    throw makeError("缺少 TENANT_ID 設定", 500);
  }
  if (!env.PHOTO_BUCKET) {
    throw makeError("缺少照片儲存空間綁定（PHOTO_BUCKET），請確認 wrangler 設定", 500);
  }
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * 以 magic bytes 判斷圖片格式（不信任副檔名／Content-Type）。
 * 只認 JPEG／PNG／WebP；其餘（SVG、GIF、HTML、PDF、HEIC…）回 null。
 */
export function sniffImageType(bytes) {
  var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  if (b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return "image/png";
  }
  if (b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

/** 產生不可猜測、不含個資的 R2 object key */
function buildObjectKey(env) {
  return "customer-photos/" + env.TENANT_ID + "/" + crypto.randomUUID();
}

async function ensureStaffBelongsToTenant(env) {
  if (!env.STAFF_ID) {
    throw makeError("操作人員設定錯誤，請確認工作室設定", 500);
  }
  var staffRow = await env.DB.prepare(
    "SELECT id FROM staff WHERE tenant_id = ?1 AND id = ?2"
  ).bind(env.TENANT_ID, env.STAFF_ID).first();
  if (!staffRow) {
    throw makeError("操作人員設定錯誤，請確認工作室設定", 500);
  }
}

async function fetchActiveCustomer(env, customerId) {
  var id = String(customerId || "").trim();
  if (!id) {
    throw makeError("缺少 customerId", 400);
  }
  var row = await env.DB.prepare(
    "SELECT id FROM customers " +
    "WHERE tenant_id = ?1 AND id = ?2 " +
    "AND deleted_at IS NULL AND status <> 'deleted'"
  ).bind(env.TENANT_ID, id).first();
  if (!row) {
    throw makeError("找不到此客戶", 404);
  }
  return id;
}

async function fetchActivePhotoSet(env, customerId, setId) {
  var id = String(setId || "").trim();
  if (!id) {
    throw makeError("缺少照片組編號", 400);
  }
  var row = await env.DB.prepare(
    "SELECT id, booking_id, title, captured_at, created_at " +
    "FROM customer_photo_sets " +
    "WHERE tenant_id = ?1 AND customer_id = ?2 AND id = ?3 " +
    "AND deleted_at IS NULL"
  ).bind(env.TENANT_ID, customerId, id).first();
  if (!row) {
    throw makeError("找不到此照片組", 404);
  }
  return row;
}

var AUDIT_INSERT_SQL =
  "INSERT INTO audit_logs " +
  "(id, tenant_id, actor_type, actor_id, action, entity_type, entity_id, " +
  "source, metadata_json, created_at) " +
  "VALUES (?, ?, 'staff', ?, ?, ?, ?, 'admin', ?, ?)";

/** audit 陳述式（不含 object key／binary／個資） */
function auditStatement(env, action, entityType, entityId, metadata, now) {
  return env.DB.prepare(AUDIT_INSERT_SQL).bind(
    crypto.randomUUID(),
    env.TENANT_ID,
    env.STAFF_ID,
    action,
    entityType,
    entityId,
    JSON.stringify(metadata || {}),
    now
  );
}

/** 照片 DTO：不含 object_key；content 一律走 Worker authenticated endpoint */
function photoRowToDto(row, customerId) {
  if (!row) return null;
  return {
    photoId: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size) || 0,
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    createdAt: row.created_at,
    contentPath: "/api/owner/customers/by-id/" + encodeURIComponent(customerId) +
      "/photos/" + encodeURIComponent(row.id) + "/content"
  };
}

function photoSetRowToDto(row, photosByKind, customerId) {
  return {
    setId: row.id,
    title: row.title || "",
    capturedAt: row.captured_at || null,
    bookingId: row.booking_id || null,
    createdAt: row.created_at,
    before: photoRowToDto(photosByKind.before || null, customerId),
    after: photoRowToDto(photosByKind.after || null, customerId)
  };
}

/** GET /photo-sets：最新在前，含各組 active before／after */
export async function listCustomerPhotoSets(env, customerId) {
  ensurePhotoEnv(env);
  var id = await fetchActiveCustomer(env, customerId);

  var setsResult = await env.DB.prepare(
    "SELECT id, booking_id, title, captured_at, created_at " +
    "FROM customer_photo_sets " +
    "WHERE tenant_id = ?1 AND customer_id = ?2 AND deleted_at IS NULL " +
    "ORDER BY created_at DESC, id DESC"
  ).bind(env.TENANT_ID, id).all();
  var sets = (setsResult && setsResult.results) || [];

  var photosResult = await env.DB.prepare(
    "SELECT id, photo_set_id, kind, mime_type, byte_size, width, height, created_at " +
    "FROM customer_photos " +
    "WHERE tenant_id = ?1 AND customer_id = ?2 AND deleted_at IS NULL"
  ).bind(env.TENANT_ID, id).all();
  var photos = (photosResult && photosResult.results) || [];

  var photosBySet = {};
  photos.forEach(function (photo) {
    if (!photosBySet[photo.photo_set_id]) {
      photosBySet[photo.photo_set_id] = {};
    }
    photosBySet[photo.photo_set_id][photo.kind] = photo;
  });

  return {
    ok: true,
    photoSets: sets.map(function (set) {
      return photoSetRowToDto(set, photosBySet[set.id] || {}, id);
    })
  };
}

function normalizeTitle(input) {
  var title = String(input == null ? "" : input).trim();
  if (title.length > PHOTO_SET_TITLE_MAX_LENGTH) {
    throw makeError("標題長度不可超過 " + PHOTO_SET_TITLE_MAX_LENGTH + " 字", 400);
  }
  return title;
}

function normalizeCapturedAt(input) {
  var value = String(input == null ? "" : input).trim();
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw makeError("拍攝日期格式須為 YYYY-MM-DD", 400);
  }
  var date = new Date(value + "T00:00:00.000Z");
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw makeError("拍攝日期不是有效日期", 400);
  }
  return value;
}

/** bookingId 若提供，必須屬於同 tenant＋同 customer */
async function normalizeBookingId(env, customerId, input) {
  var bookingId = String(input == null ? "" : input).trim();
  if (!bookingId) return "";
  var row = await env.DB.prepare(
    "SELECT id FROM bookings " +
    "WHERE tenant_id = ?1 AND customer_id = ?2 AND id = ?3"
  ).bind(env.TENANT_ID, customerId, bookingId).first();
  if (!row) {
    throw makeError("找不到此客戶的這筆預約", 400);
  }
  return bookingId;
}

/** POST /photo-sets */
export async function createCustomerPhotoSet(env, customerId, data) {
  ensurePhotoEnv(env);
  await ensureStaffBelongsToTenant(env);
  var id = await fetchActiveCustomer(env, customerId);

  var input = data || {};
  var title = normalizeTitle(input.title);
  var capturedAt = normalizeCapturedAt(input.capturedAt);
  var bookingId = await normalizeBookingId(env, id, input.bookingId);

  var setId = crypto.randomUUID();
  var now = nowIso();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO customer_photo_sets " +
      "(id, tenant_id, customer_id, booking_id, title, captured_at, " +
      "created_by_staff_id, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      setId, env.TENANT_ID, id,
      bookingId || null, title || null, capturedAt || null,
      env.STAFF_ID, now, now
    ),
    auditStatement(env, "customer.photo_set.create", "customer_photo_set", setId,
      { photoSetId: setId, customerId: id }, now)
  ]);

  return {
    ok: true,
    photoSet: photoSetRowToDto({
      id: setId,
      booking_id: bookingId || null,
      title: title || null,
      captured_at: capturedAt || null,
      created_at: now
    }, {}, id)
  };
}

/** PATCH /photo-sets/:setId（白名單：title／capturedAt／bookingId） */
export async function updateCustomerPhotoSet(env, customerId, setId, data) {
  ensurePhotoEnv(env);
  await ensureStaffBelongsToTenant(env);
  var id = await fetchActiveCustomer(env, customerId);
  var set = await fetchActivePhotoSet(env, id, setId);

  var input = data || {};
  var title = input.title !== undefined ? normalizeTitle(input.title) : null;
  var capturedAt = input.capturedAt !== undefined
    ? normalizeCapturedAt(input.capturedAt)
    : null;
  var bookingId = input.bookingId !== undefined
    ? await normalizeBookingId(env, id, input.bookingId)
    : null;

  var now = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE customer_photo_sets SET " +
      "title = CASE WHEN ?1 THEN ?2 ELSE title END, " +
      "captured_at = CASE WHEN ?3 THEN ?4 ELSE captured_at END, " +
      "booking_id = CASE WHEN ?5 THEN ?6 ELSE booking_id END, " +
      "updated_at = ?7 " +
      "WHERE tenant_id = ?8 AND customer_id = ?9 AND id = ?10 " +
      "AND deleted_at IS NULL"
    ).bind(
      input.title !== undefined ? 1 : 0, title || null,
      input.capturedAt !== undefined ? 1 : 0, capturedAt || null,
      input.bookingId !== undefined ? 1 : 0, bookingId || null,
      now, env.TENANT_ID, id, set.id
    ),
    auditStatement(env, "customer.photo_set.update", "customer_photo_set", set.id,
      { photoSetId: set.id, customerId: id }, now)
  ]);

  return { ok: true };
}

/**
 * DELETE /photo-sets/:setId：
 * 先 D1 軟刪（組＋組內照片，object_key 保留可追蹤）＋audit 同一 batch，
 * 成功後才刪 R2 物件；R2 失敗回 cleanupPending（可重試，不影響 D1 狀態）。
 */
export async function deleteCustomerPhotoSet(env, customerId, setId) {
  ensurePhotoEnv(env);
  await ensureStaffBelongsToTenant(env);
  var id = await fetchActiveCustomer(env, customerId);

  var trimmedSetId = String(setId || "").trim();
  if (!trimmedSetId) {
    throw makeError("缺少照片組編號", 400);
  }
  var set = await env.DB.prepare(
    "SELECT id, deleted_at FROM customer_photo_sets " +
    "WHERE tenant_id = ?1 AND customer_id = ?2 AND id = ?3"
  ).bind(env.TENANT_ID, id, trimmedSetId).first();
  if (!set) {
    throw makeError("找不到此照片組", 404);
  }
  if (set.deleted_at) {
    // 冪等重試：D1 已軟刪，但先前 R2 清理可能失敗。
    // 重查該組所有已軟刪照片的 object_key（tenant＋customer＋set
    // scoped）並重試刪除；不重寫 audit、不回傳 key。
    var softDeletedResult = await env.DB.prepare(
      "SELECT object_key FROM customer_photos " +
      "WHERE tenant_id = ?1 AND customer_id = ?2 AND photo_set_id = ?3 " +
      "AND deleted_at IS NOT NULL"
    ).bind(env.TENANT_ID, id, set.id).all();
    var softDeletedPhotos = (softDeletedResult && softDeletedResult.results) || [];

    var retryPending = false;
    for (var r = 0; r < softDeletedPhotos.length; r++) {
      try {
        await env.PHOTO_BUCKET.delete(softDeletedPhotos[r].object_key);
      } catch (ignore) {
        retryPending = true;
      }
    }
    return { ok: true, deleted: false, cleanupPending: retryPending };
  }

  var photosResult = await env.DB.prepare(
    "SELECT id, object_key FROM customer_photos " +
    "WHERE tenant_id = ?1 AND photo_set_id = ?2 AND deleted_at IS NULL"
  ).bind(env.TENANT_ID, set.id).all();
  var photos = (photosResult && photosResult.results) || [];

  var now = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE customer_photos SET deleted_at = ?1 " +
      "WHERE tenant_id = ?2 AND photo_set_id = ?3 AND deleted_at IS NULL"
    ).bind(now, env.TENANT_ID, set.id),
    env.DB.prepare(
      "UPDATE customer_photo_sets SET deleted_at = ?1, updated_at = ?1 " +
      "WHERE tenant_id = ?2 AND customer_id = ?3 AND id = ?4 " +
      "AND deleted_at IS NULL"
    ).bind(now, env.TENANT_ID, id, set.id),
    auditStatement(env, "customer.photo_set.delete", "customer_photo_set", set.id,
      { photoSetId: set.id, customerId: id, photoCount: photos.length }, now)
  ]);

  var cleanupPending = false;
  for (var i = 0; i < photos.length; i++) {
    try {
      await env.PHOTO_BUCKET.delete(photos[i].object_key);
    } catch (ignore) {
      // 物件 key 仍留在軟刪列中，可安全重試清理；不洩漏 key
      cleanupPending = true;
    }
  }

  return { ok: true, deleted: true, cleanupPending: cleanupPending };
}

/**
 * PUT /photo-sets/:setId/photos/:kind — 上傳／取代 before 或 after。
 *
 * params：{ kind, bytes, contentType, width, height }
 * bytes 必須是 ArrayBuffer／Uint8Array；不信任 contentType，
 * 一律以 magic bytes 驗證且兩者必須一致。
 */
export async function uploadCustomerComparisonPhoto(env, customerId, setId, params) {
  ensurePhotoEnv(env);
  await ensureStaffBelongsToTenant(env);
  var id = await fetchActiveCustomer(env, customerId);
  var set = await fetchActivePhotoSet(env, id, setId);

  var input = params || {};
  var kind = String(input.kind || "").trim();
  if (kind !== "before" && kind !== "after") {
    throw makeError("照片類型僅支援 before 或 after", 400);
  }

  var bytes = input.bytes instanceof Uint8Array
    ? input.bytes
    : new Uint8Array(input.bytes || []);
  if (!bytes.length) {
    throw makeError("缺少圖片內容", 400);
  }
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw makeError("圖片超過 5 MB 上限，請重新壓縮後上傳", 413);
  }

  var sniffedType = sniffImageType(bytes);
  if (!sniffedType) {
    throw makeError("僅支援 JPEG、PNG 或 WebP 圖片", 415);
  }
  var declaredType = String(input.contentType || "").split(";")[0].trim().toLowerCase();
  if (ALLOWED_MIME_TYPES.indexOf(declaredType) === -1) {
    throw makeError("僅支援 JPEG、PNG 或 WebP 圖片", 415);
  }
  if (declaredType !== sniffedType) {
    throw makeError("圖片格式與內容不一致，已拒絕上傳", 415);
  }

  function normalizeDimension(value) {
    if (value == null || value === "") return null;
    var n = Number(value);
    if (!Number.isInteger(n) || n <= 0 || n > 10000) {
      throw makeError("圖片尺寸資訊不正確", 400);
    }
    return n;
  }
  var width = normalizeDimension(input.width);
  var height = normalizeDimension(input.height);

  // 既有 active 照片（取代目標）
  var oldPhoto = await env.DB.prepare(
    "SELECT id, object_key FROM customer_photos " +
    "WHERE tenant_id = ?1 AND photo_set_id = ?2 AND kind = ?3 " +
    "AND deleted_at IS NULL"
  ).bind(env.TENANT_ID, set.id, kind).first();

  var photoId = crypto.randomUUID();
  var objectKey = buildObjectKey(env);
  var now = nowIso();

  // 1. 先寫 R2（失敗則 D1 零寫入；錯誤訊息不洩漏 key 或內部細節）
  try {
    await env.PHOTO_BUCKET.put(objectKey, bytes, {
      httpMetadata: { contentType: sniffedType }
    });
  } catch (ignore) {
    throw makeError("照片上傳失敗，請稍後再試", 500);
  }

  // 2. D1 batch：軟刪舊照＋INSERT 新照＋audit；失敗則補償刪除新 R2 物件
  try {
    var statements = [];
    if (oldPhoto) {
      statements.push(env.DB.prepare(
        "UPDATE customer_photos SET deleted_at = ?1 " +
        "WHERE tenant_id = ?2 AND id = ?3 AND deleted_at IS NULL"
      ).bind(now, env.TENANT_ID, oldPhoto.id));
    }
    statements.push(env.DB.prepare(
      "INSERT INTO customer_photos " +
      "(id, tenant_id, photo_set_id, customer_id, kind, object_key, " +
      "mime_type, byte_size, width, height, created_by_staff_id, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      photoId, env.TENANT_ID, set.id, id, kind, objectKey,
      sniffedType, bytes.length, width, height, env.STAFF_ID, now
    ));
    statements.push(
      auditStatement(env, "customer.photo.upload", "customer_photo", photoId, {
        photoId: photoId,
        photoSetId: set.id,
        customerId: id,
        kind: kind,
        byteSize: bytes.length,
        replacedPhotoId: oldPhoto ? oldPhoto.id : null
      }, now)
    );
    await env.DB.batch(statements);
  } catch (error) {
    try {
      await env.PHOTO_BUCKET.delete(objectKey);
    } catch (ignore) {
      // 補償刪除失敗：物件成為孤兒，但不含個資且 key 不可猜測
    }
    throw makeError("照片資料寫入失敗，請稍後再試", 500);
  }

  // 3. metadata 成功後才刪舊 R2 物件；失敗不回退新照片
  var cleanupPending = false;
  if (oldPhoto) {
    try {
      await env.PHOTO_BUCKET.delete(oldPhoto.object_key);
    } catch (ignore) {
      // 舊 key 仍在軟刪列中可追蹤重試；不洩漏 key
      cleanupPending = true;
    }
  }

  return {
    ok: true,
    replaced: Boolean(oldPhoto),
    cleanupPending: cleanupPending,
    photo: photoRowToDto({
      id: photoId,
      kind: kind,
      mime_type: sniffedType,
      byte_size: bytes.length,
      width: width,
      height: height,
      created_at: now
    }, id)
  };
}

/**
 * GET /photos/:photoId/content — 驗證 metadata 後從私有 R2 取物件。
 * 回傳 { body, mimeType, byteSize }，由路由層加上
 * X-Content-Type-Options: nosniff 與 Cache-Control: private, no-store。
 */
export async function getCustomerPhotoContent(env, customerId, photoId) {
  ensurePhotoEnv(env);
  var id = await fetchActiveCustomer(env, customerId);

  var trimmedPhotoId = String(photoId || "").trim();
  if (!trimmedPhotoId) {
    throw makeError("缺少照片編號", 400);
  }
  var row = await env.DB.prepare(
    "SELECT id, object_key, mime_type, byte_size FROM customer_photos " +
    "WHERE tenant_id = ?1 AND customer_id = ?2 AND id = ?3 " +
    "AND deleted_at IS NULL"
  ).bind(env.TENANT_ID, id, trimmedPhotoId).first();
  if (!row) {
    throw makeError("找不到此照片", 404);
  }

  var object = await env.PHOTO_BUCKET.get(row.object_key);
  if (!object) {
    // fail closed：不洩漏 object key
    throw makeError("找不到此照片", 404);
  }

  return {
    body: object.body,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size) || 0
  };
}

/**
 * DELETE /photos/:photoId — 冪等軟刪；D1 先行、R2 後行，
 * R2 失敗回 cleanupPending（object_key 留在軟刪列可重試）。
 */
export async function deleteCustomerComparisonPhoto(env, customerId, photoId) {
  ensurePhotoEnv(env);
  await ensureStaffBelongsToTenant(env);
  var id = await fetchActiveCustomer(env, customerId);

  var trimmedPhotoId = String(photoId || "").trim();
  if (!trimmedPhotoId) {
    throw makeError("缺少照片編號", 400);
  }
  var row = await env.DB.prepare(
    "SELECT id, object_key, deleted_at FROM customer_photos " +
    "WHERE tenant_id = ?1 AND customer_id = ?2 AND id = ?3"
  ).bind(env.TENANT_ID, id, trimmedPhotoId).first();
  if (!row) {
    throw makeError("找不到此照片", 404);
  }
  if (row.deleted_at) {
    // 冪等重試：D1 已軟刪但 R2 物件可能因先前失敗仍存在，
    // object_key 留在軟刪列中，重呼叫即重試清理（R2 delete 冪等）
    var retryPending = false;
    try {
      await env.PHOTO_BUCKET.delete(row.object_key);
    } catch (ignore) {
      retryPending = true;
    }
    return { ok: true, deleted: false, cleanupPending: retryPending };
  }

  var now = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE customer_photos SET deleted_at = ?1 " +
      "WHERE tenant_id = ?2 AND customer_id = ?3 AND id = ?4 " +
      "AND deleted_at IS NULL"
    ).bind(now, env.TENANT_ID, id, row.id),
    auditStatement(env, "customer.photo.delete", "customer_photo", row.id,
      { photoId: row.id, customerId: id }, now)
  ]);

  var cleanupPending = false;
  try {
    await env.PHOTO_BUCKET.delete(row.object_key);
  } catch (ignore) {
    cleanupPending = true;
  }

  return { ok: true, deleted: true, cleanupPending: cleanupPending };
}
