-- 12_daily_transactions.sql — Notion 每日紀錄匯入（民有店等）
-- 可重複執行

create table if not exists public.daily_transactions (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete restrict,
  notion_page_id text unique,
  occurred_on date not null,
  title text not null,
  amount integer not null default 0,
  service_type text,
  category text,
  payment_methods text[] not null default '{}',
  staff_name text,
  is_designated boolean not null default false,
  member_note text,
  client_name text,
  client_phone text,
  is_vip boolean not null default false,
  source text not null default 'notion_import',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_transactions_store_date_idx
  on public.daily_transactions (store_id, occurred_on desc);

create index if not exists daily_transactions_staff_idx
  on public.daily_transactions (store_id, staff_name)
  where staff_name is not null;

alter table public.daily_transactions enable row level security;

grant select, insert, update, delete on public.daily_transactions to service_role;
