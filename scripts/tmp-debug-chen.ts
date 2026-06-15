import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { parseBalanceAfter顿号, sumUnusedBalancesFromTitles } from '../lib/ledger-title-balance';
import { parseNotionNamePhone } from '../lib/phone';

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
    .select('id, occurred_on, title, client_name, client_phone, category')
    .eq('store_id', 'store1')
    .or('client_phone.eq.0928507898,title.ilike.%0928507898%')
    .in('category', ['會員儲值', '會員使用', '會員補差額'])
    .like('title', '%、%')
    .order('occurred_on', { ascending: true })
    .order('id', { ascending: true });

  console.log('rows:', data?.length);
  for (const r of data ?? []) {
    console.log(
      r.id.slice(0, 8),
      r.occurred_on,
      r.category,
      'phone=',
      r.client_phone,
      parseNotionNamePhone(r.title)?.phone,
      'bal=',
      parseBalanceAfter顿号(r.title),
      r.title,
    );
  }

  const allRows: typeof data = [];
  let offset = 0;
  for (;;) {
    const { data: chunk } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, client_name, client_phone')
      .eq('store_id', 'store1')
      .in('category', ['會員儲值', '會員使用', '會員補差額'])
      .like('title', '%、%')
      .order('occurred_on', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    allRows.push(...(chunk ?? []));
    if (!chunk || chunk.length < 1000) break;
    offset += 1000;
  }

  const neg = allRows.filter((r) => {
    const idx = r.title.lastIndexOf('、');
    const tail = r.title.slice(idx + 1);
    const m = tail.match(/^\s*(-?\d+)/);
    return m && Number(m[1]) < 0;
  });
  console.log('total sum:', sumUnusedBalancesFromTitles(allRows));
  console.log('negative balance rows in DB:', neg.length);
}

main().catch(console.error);
