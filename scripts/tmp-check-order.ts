import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from('daily_transactions')
    .select('id, occurred_on, created_at, title, category')
    .eq('store_id', 'store1')
    .or('client_phone.eq.0928507898,title.ilike.%0928507898%')
    .eq('occurred_on', '2025-03-03')
    .order('created_at', { ascending: true });
  console.log(data);
}

main().catch(console.error);
