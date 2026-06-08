-- 在與 .env.local 相同的 Supabase 專案執行

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'stores', 'admin_users', 'clients', 'services', 'staff', 'shareholders',
    'ledger_records', 'calendar_sync_log', 'expenses',
    'import_batches', 'monthly_closings', 'monthly_closing_snapshots'
  )
order by table_name;

select id, name from public.stores order by id;

select store_id, duration_minutes, price_cash, price_member
from public.services
where is_active = true
order by store_id, sort_order;

select has_table_privilege('anon', 'public.services', 'SELECT') as anon_can_select_services;
