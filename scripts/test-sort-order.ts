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
    .select('occurred_on, title')
    .eq('store_id', 'store1')
    .gte('occurred_on', '2024-03-01')
    .lte('occurred_on', '2026-12-31')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(0, 4);

  console.log('Page 0 first 5 (should be newest first):');
  for (const r of data ?? []) {
    console.log(r.occurred_on, r.title.slice(0, 40));
  }

  const { data: data2 } = await sb
    .from('daily_transactions')
    .select('occurred_on, title')
    .gte('occurred_on', '2024-03-01')
    .lte('occurred_on', '2026-12-31')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(0, 4)
    .eq('store_id', 'store1');

  console.log('\nEq AFTER range (current bug pattern):');
  for (const r of data2 ?? []) {
    console.log(r.occurred_on, r.title.slice(0, 40));
  }
}

main().catch(console.error);
