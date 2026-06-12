import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import {
  expectedTitleForSplitRow,
  parseActivityCompoundTitle,
  titleMatchesRowAttributes,
} from '../lib/ledger-title-fix';

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
    .select('occurred_on, title, amount, category, staff_name, client_name')
    .eq('store_id', 'store1')
    .in('category', ['會員使用', '會員儲值', '會員補差額'])
    .ilike('title', '%送%');

  for (const r of data ?? []) {
    if (!parseActivityCompoundTitle(r.title) || titleMatchesRowAttributes(r)) continue;
    const exp = expectedTitleForSplitRow(r);
    if (!exp) continue;
    console.log(`${r.occurred_on} ${r.category} $${r.amount} ${r.staff_name} ${r.client_name ?? ''}`);
    console.log(`  舊 ${r.title.slice(0, 72)}`);
    console.log(`  新 ${exp.slice(0, 72)}\n`);
  }
}

main().catch(console.error);
