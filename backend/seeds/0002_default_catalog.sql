-- Seed：預設服務與每週排班（v2 D1）
--
-- 用途：提供店家可直接修改的最小服務目錄與每週營業排班骨架。
-- 這不是 migration；請勿放入 backend/migrations。
-- 依賴：backend/seeds/0001_default_studio.sql
--（tenant_beauty_studio_default／location_main／staff_owner 必須先存在，
--  否則 foreign key 會拒絕寫入）。
--
-- 特性：
-- - 全部使用 INSERT OR IGNORE 搭配固定 ID，可重複執行（idempotent）；
--   同時受 uq_staff_schedules_weekly 唯一索引保護，不會產生重複排班。
-- - weekday 編碼與 repository（d1-repository.js）一致：0=日、1=一 … 6=六。
-- - 不含姓名、電話、Email、LINE 帳號、銀行資料、token 或任何真實個資。

-- 1. 預設服務（店家之後可自行改名、調整時長與價格）
INSERT OR IGNORE INTO services
    (id, tenant_id, code, name, description,
     duration_minutes, buffer_before_minutes, buffer_after_minutes,
     price_amount, deposit_amount, status, sort_order,
     created_at, updated_at)
VALUES (
    'service_default',
    'tenant_beauty_studio_default',
    'service_default',
    '預設美容服務（請修改）',
    '',
    60,
    0,
    0,
    0,
    0,
    'active',
    10,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
);

-- 2. 每週排班：週日（0）～週六（6）每天一筆 10:00~20:00 開放時段
INSERT OR IGNORE INTO staff_schedules
    (id, tenant_id, location_id, staff_id, schedule_type, weekday,
     start_time, end_time, is_available, is_active, created_at, updated_at)
VALUES
    ('schedule_default_weekday_0', 'tenant_beauty_studio_default', 'location_main', 'staff_owner', 'weekly', 0,
     '10:00', '20:00', 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('schedule_default_weekday_1', 'tenant_beauty_studio_default', 'location_main', 'staff_owner', 'weekly', 1,
     '10:00', '20:00', 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('schedule_default_weekday_2', 'tenant_beauty_studio_default', 'location_main', 'staff_owner', 'weekly', 2,
     '10:00', '20:00', 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('schedule_default_weekday_3', 'tenant_beauty_studio_default', 'location_main', 'staff_owner', 'weekly', 3,
     '10:00', '20:00', 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('schedule_default_weekday_4', 'tenant_beauty_studio_default', 'location_main', 'staff_owner', 'weekly', 4,
     '10:00', '20:00', 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('schedule_default_weekday_5', 'tenant_beauty_studio_default', 'location_main', 'staff_owner', 'weekly', 5,
     '10:00', '20:00', 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('schedule_default_weekday_6', 'tenant_beauty_studio_default', 'location_main', 'staff_owner', 'weekly', 6,
     '10:00', '20:00', 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
