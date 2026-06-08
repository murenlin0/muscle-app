import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();

const url = get('NEXT_PUBLIC_SUPABASE_URL');
const key = get('SUPABASE_SERVICE_ROLE_KEY') || get('NEXT_PUBLIC_SUPABASE_ANON_KEY');

if (!url || !key) {
  console.error('Missing Supabase env in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

const services = await supabase.from('services').select('duration_minutes, price_cash, price_member').order('sort_order');
const clients = await supabase.from('clients').select('id', { count: 'exact', head: true });
const staff = await supabase.from('staff').select('display_name').eq('is_active', true);

console.log(
  JSON.stringify(
    {
      services: { count: services.data?.length ?? 0, error: services.error?.message ?? null, data: services.data },
      clients: { count: clients.count ?? 0, error: clients.error?.message ?? null },
      staff: { data: staff.data, error: staff.error?.message ?? null },
    },
    null,
    2,
  ),
);
