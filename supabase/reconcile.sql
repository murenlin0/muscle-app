-- =============================================================================
-- reconcile.sql — 筋棧 DB 一次對齊（可重複執行，不會清空資料）
-- =============================================================================
-- 用途：把 01～11 的增量變更濃縮成一份；跑完看最下方驗證結果。
-- 適用：已跑過舊版 SQL、想確認有沒有漏欄位／漏表／漏權限。
--
-- ⚠️ 不會建立 01_schema 的核心表（clients、staff…）。
--    若驗證顯示缺核心表，請先跑 01_schema.sql + 02_rls.sql。
--
-- ⚠️ 若要「全部砍掉重來」，用 00_reset.sql → full_setup.sql（會清空資料）。
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- A. staff 擴充欄位（08 + 11）
-- -----------------------------------------------------------------------------
alter table public.staff add column if not exists pin_hash text;
alter table public.staff add column if not exists login_pin text;

comment on column public.staff.pin_hash is '店內 PIN（scrypt hex）；null 時可用 STAFF_BOOTSTRAP_PIN';
comment on column public.staff.login_pin is '店內 PIN 明文（僅管理後台顯示）；與 pin_hash 同步';

-- -----------------------------------------------------------------------------
-- B. clients 擴充（04；01 新專案已內建可略過）
-- -----------------------------------------------------------------------------
alter table public.clients add column if not exists is_vip boolean not null default false;

comment on column public.clients.is_vip is '已儲值會員（Notion/CAL 慣例名前綴 VIP）';

-- -----------------------------------------------------------------------------
-- C. appointments（08）
-- -----------------------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete restrict,
  staff_id uuid references public.staff (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  service_label text not null,
  service_duration_minutes integer not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending_checkout',
  calendar_event_id text,
  calendar_event_etag text,
  calendar_title text,
  note text,
  raw_message text not null,
  created_by_staff_id uuid references public.staff (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint appointments_status_allowed check (
    status in ('pending_checkout', 'completed', 'cancelled')
  ),
  constraint appointments_duration_positive check (service_duration_minutes > 0)
);

create index if not exists appointments_store_starts_idx
  on public.appointments (store_id, starts_at desc);

create index if not exists appointments_calendar_event_idx
  on public.appointments (calendar_event_id)
  where calendar_event_id is not null;

-- -----------------------------------------------------------------------------
-- D. portal_accounts（09 + 11）
-- -----------------------------------------------------------------------------
create table if not exists public.portal_accounts (
  id uuid primary key default gen_random_uuid(),
  role public.admin_role not null,
  store_id text references public.stores (id) on delete restrict,
  display_name text not null,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint portal_accounts_role_store_chk check (
    (role = 'super' and store_id is null)
    or (role = 'store' and store_id is not null)
  )
);

alter table public.portal_accounts add column if not exists staff_id uuid references public.staff (id) on delete set null;
alter table public.portal_accounts add column if not exists password_plain text;

comment on table public.portal_accounts is '/login 後台帳號；super 跨店、store 單店';
comment on column public.portal_accounts.password_plain is '登入密碼明文（僅管理後台顯示）；與 password_hash 同步';

create index if not exists portal_accounts_store_idx
  on public.portal_accounts (store_id)
  where store_id is not null;

create index if not exists portal_accounts_staff_id_idx
  on public.portal_accounts (staff_id)
  where staff_id is not null;

-- -----------------------------------------------------------------------------
-- E. RLS（新表補上；舊表若已開可重複執行）
-- -----------------------------------------------------------------------------
alter table if exists public.appointments enable row level security;
alter table if exists public.portal_accounts enable row level security;

-- appointments / portal_accounts：僅 service_role 經 API 存取（無 anon policy）

-- -----------------------------------------------------------------------------
-- F. GRANT（07 精簡 + 新表）
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

grant select on public.stores to anon, authenticated;
grant select on public.services to anon, authenticated;
grant select on public.staff to anon, authenticated;
grant select, insert, update on public.clients to anon, authenticated;
grant select on public.ledger_records to anon, authenticated;
grant select on public.shareholders to anon, authenticated;
grant select, insert, update, delete on public.import_batches to anon, authenticated;
grant select, insert on public.calendar_sync_log to anon, authenticated;
grant select, insert, update, delete on public.expenses to anon, authenticated;
grant select, insert, update on public.monthly_closings to anon, authenticated;
grant select, insert on public.monthly_closing_snapshots to anon, authenticated;
grant insert on public.ledger_records to anon, authenticated;

grant select, insert, update on public.appointments to service_role;
grant select, insert, update on public.portal_accounts to service_role;
grant update on public.staff to service_role;

-- 相容舊 08（若曾 grant anon，保留不影響 API）
grant select, insert, update on public.appointments to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- G. 種子資料（03 精簡；不覆蓋既有會員）
-- -----------------------------------------------------------------------------
insert into public.stores (id, name, area)
values
  ('store1', '林口民有店', '新北市林口區'),
  ('store2', '林口文一店', '新北市林口區')
on conflict (id) do update set
  name = excluded.name,
  area = excluded.area,
  is_active = true;

insert into public.services (store_id, name, duration_minutes, price_cash, price_member, sort_order)
select s.id, v.name, v.duration_minutes, v.price_cash, v.price_member, v.sort_order
from public.stores s
cross join (
  values
    ('30分鐘', 30, 700, null::integer, 1),
    ('60分鐘', 60, 1200, 1000, 2),
    ('90分鐘', 90, 1700, 1500, 3),
    ('120分鐘', 120, 2100, 1900, 4)
) as v(name, duration_minutes, price_cash, price_member, sort_order)
on conflict (store_id, duration_minutes) do update set
  name = excluded.name,
  price_cash = excluded.price_cash,
  price_member = excluded.price_member,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.staff (store_id, display_name, commission_rate, bonus_formula)
select 'store1', v.display_name, v.commission_rate, v.bonus_formula
from (
  values
    ('仁', 0.6000::numeric, '{"tier": "6成"}'::jsonb),
    ('錦', 0.7000::numeric, '{"tier": "7成"}'::jsonb),
    ('約翰', 0.6000::numeric, '{"tier": "6成"}'::jsonb),
    ('湘', 0.7000::numeric, '{"tier": "7成"}'::jsonb),
    ('杰恩', 0.7000::numeric, '{"tier": "7成"}'::jsonb),
    ('寶', 0.6000::numeric, '{"tier": "6成"}'::jsonb)
) as v(display_name, commission_rate, bonus_formula)
where not exists (
  select 1
  from public.staff st
  where st.store_id = 'store1'
    and st.display_name = v.display_name
    and st.is_active = true
);

-- -----------------------------------------------------------------------------
-- H. 驗證（跑完看結果，全部應為 true / 有資料）
-- -----------------------------------------------------------------------------
select '--- 核心表是否存在 ---' as section;

select
  t.table_name,
  true as ok
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_name in (
    'stores', 'clients', 'services', 'staff', 'shareholders',
    'ledger_records', 'import_batches', 'appointments', 'portal_accounts'
  )
order by t.table_name;

select '--- staff 欄位 ---' as section;

select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff' and column_name = 'pin_hash'
  ) as has_pin_hash,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff' and column_name = 'login_pin'
  ) as has_login_pin;

select '--- 民有店師傅（應含 寶）---' as section;

select display_name, is_active
from public.staff
where store_id = 'store1'
order by display_name;

select '--- 權限（API 用 service_role）---' as section;

select
  has_table_privilege('service_role', 'public.clients', 'SELECT') as service_can_read_clients,
  has_table_privilege('service_role', 'public.appointments', 'INSERT') as service_can_insert_appointments,
  has_table_privilege('service_role', 'public.portal_accounts', 'SELECT') as service_can_read_portal_accounts,
  has_table_privilege('anon', 'public.clients', 'SELECT') as anon_can_read_clients;

select '--- RLS 是否啟用 ---' as section;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('appointments', 'portal_accounts', 'clients', 'staff')
order by c.relname;

-- -----------------------------------------------------------------------------
-- I. daily_transactions（12；Notion 每日紀錄匯入）
-- -----------------------------------------------------------------------------
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

alter table public.daily_transactions add column if not exists category text;

create index if not exists daily_transactions_category_idx
  on public.daily_transactions (store_id, category, occurred_on desc);

alter table if exists public.daily_transactions enable row level security;
grant select, insert, update, delete on public.daily_transactions to service_role;

-- -----------------------------------------------------------------------------
-- J. daily_transaction_edits（18；流水帳手動編輯紀錄 + 復原）
-- -----------------------------------------------------------------------------
create table if not exists public.daily_transaction_edits (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete restrict,
  transaction_id uuid,
  action text not null check (action in ('create', 'update', 'delete', 'undo')),
  before_data jsonb,
  after_data jsonb,
  summary text not null,
  actor_name text not null,
  actor_role text not null,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists daily_transaction_edits_store_created_idx
  on public.daily_transaction_edits (store_id, created_at desc);

create index if not exists daily_transaction_edits_undo_stack_idx
  on public.daily_transaction_edits (store_id, created_at desc)
  where undone_at is null and action in ('create', 'update', 'delete');

alter table public.daily_transaction_edits enable row level security;
grant select, insert, update, delete on public.daily_transaction_edits to service_role;

notify pgrst, 'reload schema';

select '--- 完成：若上方表齊、師傅有 6 人、service_can_* 為 true 即 OK ---' as section;
