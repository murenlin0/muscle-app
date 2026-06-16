-- 修復 6/18 測試預約：刪除錯誤流水帳、重設 appointment
-- 執行後到報表頁按「同步日曆結帳」

-- 1. 刪除日曆同步產生的錯誤流水帳
delete from public.daily_transactions
where store_id = 'store1'
  and occurred_on = '2026-06-18'
  and (
    client_phone = '0978542704'
    or title ilike '%0978542704%'
    or title ilike '%林慕仁%'
  );

-- 2. 重設預約為待結帳（才能再次同步）
update public.appointments
set status = 'pending_checkout'
where store_id = 'store1'
  and starts_at >= '2026-06-18T00:00:00+08:00'
  and starts_at < '2026-06-19T00:00:00+08:00'
  and calendar_title ilike '%0978542704%';

-- 3. 確認（可選）
-- select id, title, amount, category, source from daily_transactions
-- where occurred_on = '2026-06-18' and title ilike '%0978542704%';
-- select id, status, calendar_title from appointments
-- where calendar_title ilike '%0978542704%';
