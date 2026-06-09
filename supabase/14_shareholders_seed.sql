-- 14_shareholders_seed.sql — 民有店股東（store1）
-- 在 Supabase SQL Editor 執行；可重複執行，會停用舊資料後寫入最新比例

update public.shareholders
set
  is_active = false,
  archived_at = coalesce(archived_at, now()),
  updated_at = now()
where store_id = 'store1'
  and is_active = true;

insert into public.shareholders (store_id, name, ownership_percent, is_active)
values
  ('store1', '我', 0.5000, true),
  ('store1', '錦', 0.1500, true),
  ('store1', '杰恩', 0.0500, true),
  ('store1', '慶哥', 0.3000, true);
