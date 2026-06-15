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
  const { data } = await sb
    .from('daily_transactions')
    .select('category, amount, payment_methods, title, occurred_on')
    .eq('store_id', 'store1')
    .in('category', ['轉出', '轉入']);

  let outCash = 0;
  let outBank = 0;
  let inCash = 0;
  let inBank = 0;

  for (const r of data ?? []) {
    const cat = r.category as TransactionCategory;
    const acc = primaryLedgerAccount(r.payment_methods ?? [], cat);
    const n = normalizeLedgerAmount(cat, r.amount);
    if (cat === '轉出') {
      if (acc === '現金') outCash += n;
      if (acc === '富邦') outBank += n;
    } else {
      if (acc === '現金') inCash += n;
      if (acc === '富邦') inBank += n;
    }
  }

  console.log('轉出/轉入', data?.length, '筆');
  console.log('轉出 現金', outCash, '富邦', outBank);
  console.log('轉入 現金', inCash, '富邦', inBank);
  console.log('淨 現金', outCash + inCash, '富邦', outBank + inBank);
  console.log('若 Notion 只算轉出側：現金', outCash, '富邦', outBank);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
