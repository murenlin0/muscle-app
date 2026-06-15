/** 列出特定電話的所有會員交易 */
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
  const phones = process.argv.slice(2);
  for (const phone of phones) {
    const { data } = await sb
      .from('daily_transactions')
      .select('occurred_on, title, amount, category')
      .eq('store_id', 'store1')
      .or(`client_phone.eq.${phone},title.ilike.%${phone}%`)
      .in('category', ['會員儲值', '會員使用', '會員補差額'])
      .order('occurred_on', { ascending: true });
    console.log(`\n===== ${phone} (${data?.length ?? 0} 筆) =====`);
    let net = 0;
    for (const r of data ?? []) {
      const a = Math.round(r.amount ?? 0);
      net += r.category === '會員使用' ? -a : a;
      console.log(`${r.occurred_on} [${r.category}] amt=${a} 累計=${net} | ${r.title}`);
    }
  }
}

main().catch(console.error);
