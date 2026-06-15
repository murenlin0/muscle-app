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
  const { data } = await getSupabaseAdmin()
    .from('daily_transactions')
    .select('occurred_on, title, amount, category, payment_methods, staff_name')
    .eq('store_id', 'store1')
    .ilike('client_name', '%張茜茜%')
    .order('occurred_on');
  for (const r of data ?? []) {
    console.log(`${r.occurred_on} ${r.category} $${r.amount} [${(r.payment_methods ?? []).join(',')}] ${r.staff_name} | ${r.title}`);
  }
}

main().catch(console.error);
