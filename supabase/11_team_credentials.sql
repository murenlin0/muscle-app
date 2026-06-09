-- =============================================================================
-- 11_team_credentials.sql — 後台可檢視／調整師傅 PIN、店長密碼
-- =============================================================================

alter table public.staff add column if not exists login_pin text;
comment on column public.staff.login_pin is '店內 PIN 明文（僅管理後台顯示）；與 pin_hash 同步';

alter table public.portal_accounts add column if not exists staff_id uuid references public.staff (id) on delete set null;
alter table public.portal_accounts add column if not exists password_plain text;
comment on column public.portal_accounts.password_plain is '登入密碼明文（僅管理後台顯示）；與 password_hash 同步';

create index if not exists portal_accounts_staff_id_idx
  on public.portal_accounts (staff_id)
  where staff_id is not null;
