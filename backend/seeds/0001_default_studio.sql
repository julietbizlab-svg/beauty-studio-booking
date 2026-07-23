-- Seed：預設工作室最小初始資料（v2 D1）
--
-- 用途：提供本機與未來正式環境的最小工作室骨架資料。
-- 這不是 migration；請勿放入 backend/migrations，也不會由 wrangler
-- migrations 流程執行。
--
-- 特性：
-- - 全部使用 INSERT OR IGNORE，可重複執行（idempotent）。
-- - 只建立 tenant／location／staff／booking policy 四筆骨架資料，
--   識別值皆為固定、非個資的代碼。
-- - 不含姓名、電話、Email、地址、LINE 帳號、銀行帳號、token 或任何 secret。

-- 1. 租戶
INSERT OR IGNORE INTO tenants
    (id, code, name, business_type, timezone, currency, status, created_at, updated_at)
VALUES (
    'tenant_beauty_studio_default',
    'beauty-studio-default',
    '美業工作室',
    'beauty_studio',
    'Asia/Taipei',
    'TWD',
    'active',
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
);

-- 2. 主要店點
INSERT OR IGNORE INTO locations
    (id, tenant_id, code, name, timezone, is_default, status, created_at, updated_at)
VALUES (
    'location_main',
    'tenant_beauty_studio_default',
    'main',
    '主要店點',
    'Asia/Taipei',
    1,
    'active',
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
);

-- 3. 業主人員
INSERT OR IGNORE INTO staff
    (id, tenant_id, location_id, code, display_name, role, status, booking_enabled, created_at, updated_at)
VALUES (
    'staff_owner',
    'tenant_beauty_studio_default',
    'location_main',
    'owner',
    '業主',
    'owner',
    'active',
    1,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
);

-- 4. 預設預約政策
INSERT OR IGNORE INTO booking_policies
    (id, tenant_id, location_id, policy_name, maximum_booking_days,
     minimum_booking_notice_minutes, cancellation_deadline_minutes,
     slot_interval_minutes, require_store_confirmation, is_active,
     created_at, updated_at)
VALUES (
    'policy_default',
    'tenant_beauty_studio_default',
    'location_main',
    'default',
    30,
    0,
    0,
    30,
    0,
    1,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
);
