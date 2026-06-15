/** 查「標題 +8000 但列金額較小」的拆分是否缺富邦 */
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

function bank(r: { amount: number; category: string; payment_methods: string[] }) {
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
  const cases = [
    { date: '2025-01-08', phone: '09770376282' },
    { date: '2024-11-06', phone: '0910248543' },
    { date: '2024-12-26', phone: 'Jiayu' },
    { date: '2026-05-28', phone: '0939521686' },
  ];

  for (const c of cases) {
    const { data } = await sb
      .from('daily_transactions')
      .select('occurred_on, title, amount, category, payment_methods')
      .eq('store_id', 'store1')
      .eq('occurred_on', c.date)
      .ilike('title', `%${c.phone}%`);
    console.log(`\n=== ${c.date} ${c.phone} ===`);
    let sumBank = 0;
    let sumCash = 0;
    for (const r of data ?? []) {
      const cat = r.category as TransactionCategory;
      const b = bank(r);
      const cash =
        primaryLedgerAccount(r.payment_methods ?? [], cat) === '現金'
          ? normalizeLedgerAmount(cat, r.amount)
          : 0;
      sumBank += b;
      sumCash += cash;
      console.log(`  ${r.category} $${r.amount} 現金${cash} 富邦${b} [${(r.payment_methods ?? []).join(',')}]`);
      console.log(`    ${r.title.replace(/\n/g, ' ').slice(0, 70)}`);
    }
    console.log(`  小計 現金${sumCash} 富邦${sumBank}`);
  }
}

main().catch(console.error);
