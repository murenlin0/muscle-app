-- 18_ledger_edit_history.sql — 流水帳手動編輯紀錄（支援復原）
-- 可重複執行

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
