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
  const byKey = new Map<string, typeof all>();
  for (const r of all) {
    const k = `${r.occurred_on}|${r.title.replace(/\s/g, '')}|${r.category}`;
    const list = byKey.get(k) ?? [];
    list.push(r);
    byKey.set(k, list);
  }

  let extraBank = 0;
  const lines: { extra: number; note: string }[] = [];
  for (const [, list] of byKey) {
    if (list.length <= 1) continue;
    const total = list.reduce((s, r) => s + bank(r), 0);
    const single = bank(list[0]);
    const extra = total - single;
    if (extra === 0) continue;
    extraBank += extra;
    lines.push({
      extra,
      note: `×${list.length} ${list[0].occurred_on} ${list[0].category} 富邦[${list.map((x) => bank(x)).join('+')}] ${list[0].title.slice(0, 38)}`,
    });
  }

  lines.sort((a, b) => a.extra - b.extra);
  console.log('app 富邦', appBank);
  console.log('真重複（同日期同標題同類型）富邦多計', extraBank);
  console.log('若只保留每組第一筆 → 富邦', appBank - extraBank);
  console.log('Notion 目標', 119947, '差距', 119947 - (appBank - extraBank));

  console.log('\n負向多計（DB 比 Notion 少）:');
  for (const l of lines.filter((x) => x.extra < 0).slice(0, 15)) {
    console.log(`  ${l.extra} ${l.note}`);
  }
  const negSum = lines.filter((x) => x.extra < 0).reduce((s, x) => s + x.extra, 0);
  const posSum = lines.filter((x) => x.extra > 0).reduce((s, x) => s + x.extra, 0);
  console.log('負向合計', negSum, '正向合計', posSum);

  // 哪些負向重複合計接近 -10200
  console.log('\n尋找負向重複子集合接近 +10200（還原後可對齊 Notion）:');
  const negs = lines.filter((x) => x.extra < 0).map((x) => x.extra);
  // greedy: largest negatives that sum to ~10200
  let target = 10200;
  let sum = 0;
  const picked: number[] = [];
  for (const n of negs.sort((a, b) => a - b)) {
    if (sum + Math.abs(n) <= target + 500) {
      sum += Math.abs(n);
      picked.push(n);
    }
  }
  console.log('picked sum', sum, picked);
}

main().catch(console.error);
