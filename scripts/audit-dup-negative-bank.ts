import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { primaryLedgerAccount } from '../lib/ledger-accounts';
import { normalizeLedgerAmount } from '../lib/ledger-amount';
import type { TransactionCategory } from '../lib/transaction-category';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

function bank(r: { amount: number; category: string; payment_methods: string[] }): number {
  const cat = r.category as TransactionCategory;
  if (primaryLedgerAccount(r.payment_methods ?? [], cat) !== '富邦') return 0;
  return normalizeLedgerAmount(cat, r.amount);
}

async function main() {
  loadEnv();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const all: {
    occurred_on: string;
    title: string;
    amount: number;
    category: string;
    payment_methods: string[];
  }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('occurred_on, title, amount, category, payment_methods')
      .eq('store_id', 'store1')
      .gte('occurred_on', '2024-03-16')
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }

  const appBank = all.reduce((s, r) => s + bank(r), 0);

  const byTitle = new Map<string, typeof all>();
  for (const r of all) {
    const k = `${r.occurred_on}|${r.title.replace(/\s/g, '')}`;
    const list = byTitle.get(k) ?? [];
    list.push(r);
    byTitle.set(k, list);
  }

  let negExtra = 0;
  let posExtra = 0;
  const negSamples: { extra: number; note: string }[] = [];

  for (const [, list] of byTitle) {
    if (list.length <= 1) continue;
    const total = list.reduce((s, r) => s + bank(r), 0);
    const first = bank(list[0]);
    const extra = total - first;
    if (extra < 0) {
      negExtra += extra;
      if (negSamples.length < 20) {
        const r = list[0];
        negSamples.push({
          extra,
          note: `×${list.length} ${r.occurred_on} ${r.category} ${list.map((x) => `${x.category}:${bank(x)}`).join(' | ')} ${r.title.slice(0, 35)}`,
        });
      }
    } else if (extra > 0) {
      posExtra += extra;
    }
  }

  console.log('app 富邦', appBank);
  console.log('重複群組 負向多計 (使 DB 比單筆低):', negExtra);
  console.log('重複群組 正向多計:', posExtra);
  console.log('若移除負向重複多計 → 富邦', appBank - negExtra);
  console.log('目標 Notion', 119947, '仍差', 119947 - (appBank - negExtra));
  console.log('\n負向重複樣本:');
  for (const s of negSamples) console.log(`  ${s.extra} ${s.note}`);
}

main().catch(console.error);
