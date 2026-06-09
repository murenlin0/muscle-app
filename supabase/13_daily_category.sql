-- 13_daily_category.sql — 簡化類型欄位
alter table public.daily_transactions
  add column if not exists category text;

create index if not exists daily_transactions_category_idx
  on public.daily_transactions (store_id, category, occurred_on desc);
