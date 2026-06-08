-- =============================================================================
-- 09_portal_accounts.sql — 後台入口帳號（/login 店長／總管理）
-- 師傅仍使用 staff 表 + PIN
-- =============================================================================

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

create index if not exists portal_accounts_store_idx
  on public.portal_accounts (store_id)
  where store_id is not null;

comment on table public.portal_accounts is '/login 後台帳號；super 跨店、store 單店';

grant select, insert, update on public.portal_accounts to service_role;
