-- =============================================================================
-- 06_multi_store.sql — 既有專案升級：單庫多店（store_id）
-- 若已跑過新版 01_schema.sql 可略過
-- 執行前請先備份；既有資料會預設歸到 store1（民有店）
-- =============================================================================

do $$ begin
  create type public.admin_role as enum ('super', 'store');
exception
  when duplicate_object then null;
end $$;

-- stores
create table if not exists public.stores (
  id text primary key,
  name text not null,
  area text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.stores (id, name, area)
values
  ('store1', '林口民有店', '新北市林口區'),
  ('store2', '林口文一店', '新北市林口區')
on conflict (id) do update set
  name = excluded.name,
  area = excluded.area;

-- admin_users（新表）
create table if not exists public.admin_users (
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

-- clients.store_id
alter table public.clients add column if not exists store_id text;
update public.clients set store_id = 'store1' where store_id is null;
alter table public.clients alter column store_id set not null;

alter table public.clients drop constraint if exists clients_phone_unique;
alter table public.clients drop constraint if exists clients_line_user_id_unique;
alter table public.clients drop constraint if exists clients_store_phone_unique;

alter table public.clients
  add constraint clients_store_id_fkey
  foreign key (store_id) references public.stores (id) on delete restrict;

alter table public.clients
  add constraint clients_store_phone_unique unique (store_id, phone);

drop index if exists clients_line_user_id_idx;
create unique index if not exists clients_store_line_user_id_idx
  on public.clients (store_id, line_user_id)
  where line_user_id is not null;

-- services.store_id
alter table public.services add column if not exists store_id text;
update public.services set store_id = 'store1' where store_id is null;
alter table public.services alter column store_id set not null;
alter table public.services drop constraint if exists services_duration_unique;
alter table public.services drop constraint if exists services_store_duration_unique;
alter table public.services
  add constraint services_store_id_fkey
  foreign key (store_id) references public.stores (id) on delete restrict;
alter table public.services
  add constraint services_store_duration_unique unique (store_id, duration_minutes);

-- staff.store_id
alter table public.staff add column if not exists store_id text;
update public.staff set store_id = 'store1' where store_id is null;
alter table public.staff alter column store_id set not null;
drop index if exists staff_display_name_active_idx;
create unique index if not exists staff_store_display_name_active_idx
  on public.staff (store_id, display_name)
  where is_active = true;
alter table public.staff
  add constraint staff_store_id_fkey
  foreign key (store_id) references public.stores (id) on delete restrict;

-- 其餘表（若存在）
alter table public.shareholders add column if not exists store_id text;
update public.shareholders set store_id = 'store1' where store_id is null;

alter table public.expenses add column if not exists store_id text;
update public.expenses set store_id = 'store1' where store_id is null;

alter table public.import_batches add column if not exists store_id text;
update public.import_batches set store_id = 'store1' where store_id is null;

alter table public.calendar_sync_log add column if not exists store_id text;
update public.calendar_sync_log set store_id = 'store1' where store_id is null;

alter table public.monthly_closings add column if not exists store_id text;
update public.monthly_closings set store_id = 'store1' where store_id is null;
alter table public.monthly_closings drop constraint if exists monthly_closings_year_month_unique;
alter table public.monthly_closings drop constraint if exists monthly_closings_store_year_month_unique;
alter table public.monthly_closings
  add constraint monthly_closings_store_year_month_unique unique (store_id, year_month);

-- 重新套用 RLS（02_rls.sql 完整內容）
-- 請在執行本檔後再跑 02_rls.sql
