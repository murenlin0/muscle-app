-- =============================================================================
-- 01_schema.sql — 筋棧 LINE 預約與儲值金系統
-- 前置：00_reset.sql（全新專案可略過 00，直接本檔 + 02）
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.ledger_type as enum (
  'initial',
  'top_up',
  'deduction',
  'adjustment'
);

create type public.ledger_source as enum (
  'csv_import',
  'calendar_sync',
  'manual'
);

create type public.payment_method as enum (
  'cash',
  'transfer',
  'line',
  'stored_value'
);

create type public.closing_section as enum (
  'reconciliation',
  'pnl',
  'staff_payroll',
  'shareholder_dividend'
);

create type public.entity_type as enum (
  'staff',
  'shareholder',
  'summary'
);

create type public.parse_status as enum (
  'ok',
  'failed',
  'skipped'
);

create type public.admin_role as enum (
  'super',
  'store'
);

-- -----------------------------------------------------------------------------
-- stores — 分店（id 與網址 slug 相同：store1, store2, …）
-- -----------------------------------------------------------------------------
create table public.stores (
  id text primary key,
  name text not null,
  area text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.stores is '分店主檔；業務資料以 store_id 區分';

-- -----------------------------------------------------------------------------
-- admin_users — 後台帳號（Supabase Auth）
-- super：可讀寫所有店；store：僅限所屬 store_id
-- -----------------------------------------------------------------------------
create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  role public.admin_role not null,
  store_id text references public.stores (id) on delete restrict,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint admin_users_role_store_chk check (
    (role = 'super' and store_id is null)
    or (role = 'store' and store_id is not null)
  )
);

create index admin_users_store_id_idx on public.admin_users (store_id) where store_id is not null;

comment on table public.admin_users is '後台管理員；super 跨店、store 單店';

-- -----------------------------------------------------------------------------
-- clients — 會員（同一電話可在不同店各有獨立帳戶）
-- -----------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete restrict,
  phone text not null,
  line_user_id text,
  name text not null,
  is_vip boolean not null default false,
  initial_balance integer not null default 0,
  balance integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_store_phone_unique unique (store_id, phone),
  constraint clients_balance_non_negative check (balance >= 0),
  constraint clients_initial_balance_non_negative check (initial_balance >= 0)
);

create unique index clients_store_line_user_id_idx
  on public.clients (store_id, line_user_id)
  where line_user_id is not null;

create index clients_store_id_idx on public.clients (store_id);

comment on table public.clients is '會員；phone 為 Calendar 標題辨識主鍵（每店獨立）';

-- -----------------------------------------------------------------------------
-- services — 服務項目（動態，不可寫死在程式）
-- -----------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete restrict,
  name text not null,
  duration_minutes integer not null,
  price_cash integer not null,
  price_member integer,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint services_store_duration_unique unique (store_id, duration_minutes),
  constraint services_price_cash_positive check (price_cash > 0),
  constraint services_price_member_positive check (price_member is null or price_member > 0)
);

comment on table public.services is '服務價目；price_member 為 null 表示無會員價（如 30 分鐘）';

-- -----------------------------------------------------------------------------
-- staff — 師傅（soft delete：is_active = false）
-- -----------------------------------------------------------------------------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete restrict,
  display_name text not null,
  commission_rate numeric(5, 4),
  bonus_formula jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index staff_store_display_name_active_idx
  on public.staff (store_id, display_name)
  where is_active = true;

comment on table public.staff is '師傅；離職僅停用，不可 DELETE';

-- -----------------------------------------------------------------------------
-- shareholders — 股東（soft delete）
-- -----------------------------------------------------------------------------
create table public.shareholders (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete restrict,
  name text not null,
  ownership_percent numeric(5, 4) not null,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shareholders_percent_range check (
    ownership_percent > 0 and ownership_percent <= 1
  )
);

comment on table public.shareholders is '股東；退出僅停用';

-- -----------------------------------------------------------------------------
-- ledger_records — 儲值金流水（Calendar Sync / 匯入 / 手動）
-- -----------------------------------------------------------------------------
create table public.ledger_records (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  type public.ledger_type not null,
  amount integer not null,
  payment_method public.payment_method,
  source public.ledger_source not null,
  calendar_event_id text,
  calendar_event_etag text,
  idempotency_key text,
  staff_id uuid references public.staff (id) on delete set null,
  service_snapshot jsonb,
  occurred_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  constraint ledger_amount_positive check (amount > 0)
);

create unique index ledger_idempotency_key_idx
  on public.ledger_records (idempotency_key)
  where idempotency_key is not null;

create index ledger_client_occurred_idx
  on public.ledger_records (client_id, occurred_at desc);

create index ledger_calendar_event_idx
  on public.ledger_records (calendar_event_id)
  where calendar_event_id is not null;

-- -----------------------------------------------------------------------------
-- calendar_sync_log — Phase 3 解析紀錄
-- -----------------------------------------------------------------------------
create table public.calendar_sync_log (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete restrict,
  event_id text not null,
  etag text,
  raw_title text not null,
  raw_color text,
  parse_status public.parse_status not null,
  parse_result jsonb,
  synced_at timestamptz not null default now()
);

create index calendar_sync_log_event_idx on public.calendar_sync_log (event_id, synced_at desc);

-- -----------------------------------------------------------------------------
-- expenses — 店務支出（Admin 手動）
-- -----------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete restrict,
  category text not null,
  amount integer not null,
  expense_date date not null,
  note text,
  created_at timestamptz not null default now(),
  constraint expenses_amount_positive check (amount > 0)
);

-- -----------------------------------------------------------------------------
-- import_batches — Notion CSV 匯入紀錄
-- -----------------------------------------------------------------------------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete restrict,
  filename text not null,
  rows_total integer not null default 0,
  clients_upserted integer not null default 0,
  skipped_rows integer not null default 0,
  imported_at timestamptz not null default now(),
  note text
);

-- -----------------------------------------------------------------------------
-- monthly_closings — 月結鎖帳（Phase 5）
-- -----------------------------------------------------------------------------
create table public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete restrict,
  year_month text not null,
  locked_at timestamptz,
  locked_by text,
  status text not null default 'draft',
  constraint monthly_closings_store_year_month_unique unique (store_id, year_month),
  constraint monthly_closings_status_allowed check (status in ('draft', 'locked'))
);

create table public.monthly_closing_snapshots (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.monthly_closings (id) on delete cascade,
  section public.closing_section not null,
  entity_type public.entity_type not null,
  entity_id uuid,
  entity_name text not null,
  amount integer not null,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create trigger staff_updated_at
  before update on public.staff
  for each row execute function public.set_updated_at();

create trigger shareholders_updated_at
  before update on public.shareholders
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 餘額重算（ledger 變動後呼叫；Phase 3 Sync 使用）
-- -----------------------------------------------------------------------------
create or replace function public.recalculate_client_balance(p_client_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initial integer;
  v_top_up integer;
  v_deduction integer;
  v_adjustment integer;
  v_balance integer;
begin
  select initial_balance into v_initial from public.clients where id = p_client_id;
  if not found then
    raise exception 'client not found: %', p_client_id;
  end if;

  select coalesce(sum(amount), 0) into v_top_up
  from public.ledger_records
  where client_id = p_client_id and type = 'top_up';

  select coalesce(sum(amount), 0) into v_deduction
  from public.ledger_records
  where client_id = p_client_id and type = 'deduction';

  select coalesce(sum(amount), 0) into v_adjustment
  from public.ledger_records
  where client_id = p_client_id and type = 'adjustment';

  v_balance := v_initial + v_top_up - v_deduction + v_adjustment;

  if v_balance < 0 then
    raise exception 'balance would be negative for client %: %', p_client_id, v_balance;
  end if;

  update public.clients set balance = v_balance where id = p_client_id;
  return v_balance;
end;
$$;
