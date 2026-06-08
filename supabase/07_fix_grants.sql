-- =============================================================================
-- 07_fix_grants.sql — 修復 permission denied（在 SQL Editor 整份貼上執行）
-- 若 02_rls.sql 已跑過也可再跑，不會壞
-- =============================================================================

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

-- 確認 clients 表存在
select
  has_table_privilege('anon', 'public.clients', 'SELECT') as anon_can_read_clients,
  has_table_privilege('service_role', 'public.clients', 'SELECT') as service_role_can_read_clients;
