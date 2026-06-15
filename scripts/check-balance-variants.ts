import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
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
  const sb = getSupabaseAdmin();
  const all: { category: string; amount: number; payment_methods: string[] }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('category, amount, payment_methods')
      .eq('store_id', 'store1')
      .gte('occurred_on', '2024-03-16')
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }

  const variants = ['all', 'skip轉入', 'skip轉出轉入', 'only轉出'] as const;
  for (const v of variants) {
    let cash = 0;
    let bank = 0;
    for (const r of all) {
      if (v === 'skip轉入' && r.category === '轉入') continue;
      if (v === 'skip轉出轉入' && (r.category === '轉入' || r.category === '轉出')) continue;
      if (v === 'only轉出' && r.category !== '轉出' && r.category !== '轉入' && r.category !== '轉移') {
        /* include non-transfer */
      } else if (v === 'only轉出' && r.category === '轉入') continue;

      const cat = r.category as TransactionCategory;
      const acc = primaryLedgerAccount(r.payment_methods ?? [], cat);
      const n = normalizeLedgerAmount(cat, r.amount);
      if (acc === '現金') cash += n;
      if (acc === '富邦') bank += n;
    }
    console.log(v, '現金', cash, '富邦', bank);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
