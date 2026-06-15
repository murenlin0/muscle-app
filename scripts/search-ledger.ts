import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function fetchAll() {
  loadEnv();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const all: {
    id: string;
    occurred_on: string;
    title: string;
    amount: number;
    category: string;
    payment_methods: string[];
  }[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, payment_methods')
      .eq('store_id', 'store1')
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function main() {
  const all = await fetchAll();
  const terms = process.argv.slice(2);

  if (terms.length) {
    const lower = (s: string) => s.toLowerCase();
    const hits = all.filter((r) =>
      terms.some((term) => lower(r.title ?? '').includes(lower(term))),
    );
    console.log(`Search: ${terms.join(', ')} → ${hits.length} hits\n`);
    for (const r of hits.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))) {
      console.log(
        `${r.occurred_on} | ${r.category} | $${r.amount} | ${(r.payment_methods ?? []).join('、') || '—'} | ${r.title}`,
      );
    }
    return;
  }

  console.log('=== 所有「支出」標題含廣告/google/推廣/ADS ===\n');
  const ads = all.filter(
    (r) =>
      r.category === '支出' &&
      /廣告|google|推廣|ads|map|地圖|商家|et/i.test(r.title ?? ''),
  );
  for (const r of ads.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))) {
    console.log(
      `${r.occurred_on} | $${r.amount} | ${(r.payment_methods ?? []).join('、')} | ${r.title}`,
    );
  }

  console.log('\n=== 支出金額 > 10000 ===\n');
  const big = all.filter((r) => r.category === '支出' && Math.abs(r.amount) > 10000);
  for (const r of big.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))) {
    console.log(
      `${r.occurred_on} | $${r.amount} | ${(r.payment_methods ?? []).join('、')} | ${r.title}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
