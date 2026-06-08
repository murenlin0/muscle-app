-- 既有 Phase 1 資料庫追加 is_vip 欄位（已跑過 01 者執行本檔即可）
alter table public.clients
  add column if not exists is_vip boolean not null default false;

comment on column public.clients.is_vip is '已儲值會員（Notion/CAL 慣例名前綴 VIP）';
