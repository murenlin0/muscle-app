-- =============================================================================
-- 00_reset.sql — 清除舊 MVP 與新系統所有 public 業務表
-- 在 Supabase SQL Editor 執行（會清空資料）
-- =============================================================================

drop table if exists public.monthly_closing_snapshots cascade;
drop table if exists public.monthly_closings cascade;
drop table if exists public.calendar_sync_log cascade;
drop table if exists public.import_batches cascade;
drop table if exists public.expenses cascade;
drop table if exists public.ledger_records cascade;
drop table if exists public.shareholders cascade;
drop table if exists public.staff cascade;
drop table if exists public.services cascade;
drop table if exists public.clients cascade;
drop table if exists public.admin_users cascade;
drop table if exists public.stores cascade;

-- 舊 MVP 表
drop table if exists public.appointments cascade;
drop table if exists public.therapist_availability cascade;
drop table if exists public.therapists cascade;

drop type if exists public.admin_role cascade;
drop type if exists public.ledger_type cascade;
drop type if exists public.ledger_source cascade;
drop type if exists public.payment_method cascade;
drop type if exists public.closing_section cascade;
drop type if exists public.entity_type cascade;
drop type if exists public.parse_status cascade;

drop function if exists public.admin_can_access_store(text);
drop function if exists public.current_admin_store_id();
drop function if exists public.current_admin_role();
