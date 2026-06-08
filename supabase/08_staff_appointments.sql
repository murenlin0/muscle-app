-- =============================================================================
-- 08_staff_appointments.sql — 師傅 PIN、預約紀錄
-- =============================================================================

alter table public.staff add column if not exists pin_hash text;

comment on column public.staff.pin_hash is '店內 PIN（scrypt hex）；null 時開發可用 STAFF_BOOTSTRAP_PIN';

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

grant select, insert, update on public.appointments to anon, authenticated, service_role;
grant update on public.staff to service_role;
