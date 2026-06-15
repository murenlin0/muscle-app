/** 會員補差額 金額加總 */
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
  const rows: { amount: number }[] = [];
  let o = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('amount')
      .eq('store_id', 'store1')
      .eq('category', '會員補差額')
      .range(o, o + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }
  const sum = rows.reduce((s, r) => s + Math.round(r.amount ?? 0), 0);
  console.log(`會員補差額 筆數: ${rows.length}`);
  console.log(`金額數字加總: $${sum.toLocaleString()}`);
}

main().catch(console.error);
