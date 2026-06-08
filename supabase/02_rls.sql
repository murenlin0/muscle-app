-- =============================================================================
-- 02_rls.sql — GRANT + RLS
-- LINE 會員：Phase 1 經 Next.js API（service role）存取
-- 後台管理員：authenticated + admin_users（super 跨店 / store 單店）
-- =============================================================================

alter table public.stores enable row level security;
alter table public.admin_users enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.shareholders enable row level security;
alter table public.ledger_records enable row level security;
alter table public.calendar_sync_log enable row level security;
alter table public.expenses enable row level security;
alter table public.import_batches enable row level security;
alter table public.monthly_closings enable row level security;
alter table public.monthly_closing_snapshots enable row level security;

-- -----------------------------------------------------------------------------
-- 管理員權限 helper（security definer）
-- -----------------------------------------------------------------------------
create or replace function public.current_admin_role()
returns public.admin_role
language sql
stable
security definer
set search_path = public
as $$
  select au.role
  from public.admin_users au
  where au.user_id = auth.uid()
    and au.is_active = true
  limit 1;
$$;

create or replace function public.current_admin_store_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select au.store_id
  from public.admin_users au
  where au.user_id = auth.uid()
    and au.is_active = true
  limit 1;
$$;

create or replace function public.admin_can_access_store(p_store_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_admin_role() = 'super'
    or public.current_admin_store_id() = p_store_id;
$$;

grant execute on function public.current_admin_role() to authenticated;
grant execute on function public.current_admin_store_id() to authenticated;
grant execute on function public.admin_can_access_store(text) to authenticated;

-- -----------------------------------------------------------------------------
-- GRANT
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

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

-- admin_users：僅本人可讀自己的紀錄；super 可讀全部（Phase 5 後台）
grant select on public.admin_users to authenticated;

-- -----------------------------------------------------------------------------
-- Policies（先刪再建）
-- -----------------------------------------------------------------------------
drop policy if exists "public_read_stores" on public.stores;
drop policy if exists "admin_read_own_admin_users" on public.admin_users;
drop policy if exists "admin_read_all_admin_users" on public.admin_users;
drop policy if exists "mvp_select_services" on public.services;
drop policy if exists "admin_select_services" on public.services;
drop policy if exists "mvp_select_staff" on public.staff;
drop policy if exists "admin_select_staff" on public.staff;
drop policy if exists "mvp_all_clients" on public.clients;
drop policy if exists "admin_select_clients" on public.clients;
drop policy if exists "admin_write_clients" on public.clients;
drop policy if exists "mvp_select_ledger" on public.ledger_records;
drop policy if exists "admin_select_ledger" on public.ledger_records;
drop policy if exists "mvp_select_shareholders" on public.shareholders;
drop policy if exists "admin_select_shareholders" on public.shareholders;
drop policy if exists "mvp_import_batches" on public.import_batches;
drop policy if exists "admin_import_batches" on public.import_batches;
drop policy if exists "admin_expenses" on public.expenses;
drop policy if exists "admin_calendar_sync_log" on public.calendar_sync_log;

create policy "public_read_stores"
  on public.stores for select to anon, authenticated
  using (is_active = true);

create policy "admin_read_own_admin_users"
  on public.admin_users for select to authenticated
  using (user_id = auth.uid());

create policy "admin_read_all_admin_users"
  on public.admin_users for select to authenticated
  using (public.current_admin_role() = 'super');

-- Phase 1 MVP：anon 可讀服務／師傅（LIFF 經 API）
create policy "mvp_select_services"
  on public.services for select to anon
  using (is_active = true);

create policy "admin_select_services"
  on public.services for select to authenticated
  using (public.admin_can_access_store(store_id) and is_active = true);

create policy "mvp_select_staff"
  on public.staff for select to anon
  using (is_active = true);

create policy "admin_select_staff"
  on public.staff for select to authenticated
  using (public.admin_can_access_store(store_id) and is_active = true);

-- Phase 1 MVP：anon 全開（實際由 Next.js API + service role 控管）
create policy "mvp_all_clients"
  on public.clients for all to anon
  using (true) with check (true);

create policy "admin_select_clients"
  on public.clients for select to authenticated
  using (public.admin_can_access_store(store_id));

create policy "admin_write_clients"
  on public.clients for all to authenticated
  using (public.admin_can_access_store(store_id))
  with check (public.admin_can_access_store(store_id));

create policy "mvp_select_ledger"
  on public.ledger_records for select to anon
  using (true);

create policy "admin_select_ledger"
  on public.ledger_records for select to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id
        and public.admin_can_access_store(c.store_id)
    )
  );

create policy "mvp_select_shareholders"
  on public.shareholders for select to anon
  using (is_active = true);

create policy "admin_select_shareholders"
  on public.shareholders for select to authenticated
  using (public.admin_can_access_store(store_id) and is_active = true);

create policy "mvp_import_batches"
  on public.import_batches for all to anon
  using (true) with check (true);

create policy "admin_import_batches"
  on public.import_batches for all to authenticated
  using (public.admin_can_access_store(store_id))
  with check (public.admin_can_access_store(store_id));

create policy "admin_expenses"
  on public.expenses for all to authenticated
  using (public.admin_can_access_store(store_id))
  with check (public.admin_can_access_store(store_id));

create policy "admin_calendar_sync_log"
  on public.calendar_sync_log for all to authenticated
  using (public.admin_can_access_store(store_id))
  with check (public.admin_can_access_store(store_id));
