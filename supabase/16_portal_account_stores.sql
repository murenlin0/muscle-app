-- =============================================================================
-- 16_portal_account_stores.sql — 店長多店支援
-- 請在 Supabase Dashboard → SQL Editor 執行此檔案
-- =============================================================================

-- 1. 建立多店關聯表
create table if not exists public.portal_account_stores (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.portal_accounts(id) on delete cascade,
  store_id text not null references public.stores(id) on delete cascade,
  unique(account_id, store_id),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.portal_account_stores to service_role;

-- 2. 遷移現有 portal_accounts.store_id → portal_account_stores
insert into public.portal_account_stores (account_id, store_id)
select id, store_id
from public.portal_accounts
where role = 'store' and store_id is not null
on conflict do nothing;

-- 3. 放寬約束：store 角色不再強制綁 store_id（靠 portal_account_stores）
alter table public.portal_accounts
  drop constraint if exists portal_accounts_role_store_chk;

alter table public.portal_accounts
  add constraint portal_accounts_role_store_chk
  check (role in ('super', 'store'));

comment on table public.portal_account_stores
  is '店長可管多間分店；登入時查此表取得 storeIds[]';
