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

  function bank(r: (typeof all)[0]) {
    const cat = r.category as TransactionCategory;
    if (primaryLedgerAccount(r.payment_methods ?? [], cat) !== '富邦') return 0;
    return normalizeLedgerAmount(cat, r.amount);
  }

  // 會員補差額 with 富邦
  console.log('=== 會員補差額 有富邦標籤 ===');
  let topupGap = 0;
  for (const r of all) {
    if (r.category !== '會員補差額') continue;
    const b = bank(r);
    if (b !== 0) console.log(`${r.occurred_on} ${b} [${r.payment_methods.join(',')}] ${r.title.slice(0, 50)}`);
    topupGap += b;
  }
  console.log('補差額富邦合計', topupGap);

  // 按月累計富邦
  console.log('\n=== 按月富邦累計 ===');
  const byMonth = new Map<string, number>();
  for (const r of all) {
    const m = r.occurred_on.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + bank(r));
  }
  let cum = 0;
  for (const [m, v] of [...byMonth.entries()].sort()) {
    cum += v;
    console.log(`${m}: 月${v} 累計${cum}`);
  }

  // 找 amount=10200 或 組合
  console.log('\n=== 可疑：一般消費/收入 富邦 大額 ===');
  for (const r of all) {
    const b = bank(r);
    if (b >= 5000 && b <= 15000 && !['會員儲值', '轉入', '轉出'].includes(r.category)) {
      console.log(`${r.occurred_on} ${r.category} ${b} ${r.title.slice(0, 50)}`);
    }
  }

  // 早期 2024-03~05 富邦
  let early = 0;
  for (const r of all) {
    if (r.occurred_on > '2024-05-31') break;
    early += bank(r);
  }
  console.log('\n2024-03-16~2024-05-31 富邦', early);

  // 若 Notion 從 2024-03-01 開始?
  let fromMar1 = 0;
  const { data: mar } = await sb
    .from('daily_transactions')
    .select('amount, category, payment_methods, occurred_on')
    .eq('store_id', 'store1')
    .gte('occurred_on', '2024-03-01')
    .lt('occurred_on', '2024-03-16');
  for (const r of mar ?? []) {
    const cat = r.category as TransactionCategory;
    if (primaryLedgerAccount(r.payment_methods ?? [], cat) === '富邦') {
      fromMar1 += normalizeLedgerAmount(cat, r.amount);
    }
  }
  console.log('2024-03-01~03-15 額外富邦', fromMar1, '(若 Notion 含這段 →', 109747 + fromMar1, ')');
}

main().catch(console.error);
