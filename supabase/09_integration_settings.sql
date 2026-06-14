-- 後端整合設定（Google refresh token 等），僅 service role 讀寫
create table if not exists public.integration_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.integration_settings enable row level security;

drop policy if exists "service_only_integration_settings" on public.integration_settings;
create policy "service_only_integration_settings"
  on public.integration_settings for all to authenticated, anon
  using (false)
  with check (false);

grant select, insert, update, delete on public.integration_settings to service_role;
