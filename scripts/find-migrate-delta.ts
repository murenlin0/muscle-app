import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { sumLedgerAccountBalances } from '../lib/ledger-balances';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function fetchRows() {
  const sb = getSupabaseAdmin();
  const all: {
    id: string;
    amount: number;
    category: string;
    payment_methods: string[];
    title: string;
    occurred_on: string;
  }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('id, amount, category, payment_methods, title, occurred_on')
      .eq('store_id', 'store1')
      .gte('occurred_on', '2024-03-16')
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }
  return all;
}

function rowBank(rows: typeof fetchRows extends () => Promise<infer T> ? T : never) {
  return sumLedgerAccountBalances(rows).bankAccounts;
}

async function main() {
  loadEnv();
  const before = await fetchRows();
  const beforeSum = sumLedgerAccountBalances(before);
  console.log('current', beforeSum, 'rows', before.length);

  // simulate what migrate changes: load migrate and run only normalization pass logic
  const { normalizeLedgerAccounts } = await import('../lib/ledger-accounts');
  const { normalizeLedgerAmount } = await import('../lib/ledger-amount');
  const { LEGACY_TRANSFER_CATEGORY } = await import('../lib/transaction-category');
  type TransactionCategory = import('../lib/transaction-category').TransactionCategory;

  let cashDelta = 0;
  let bankDelta = 0;
  const samples: string[] = [];

  for (const row of before) {
    if (row.category === LEGACY_TRANSFER_CATEGORY) continue;
    const cat = row.category as TransactionCategory;
    const beforeB = sumLedgerAccountBalances([row]).bankAccounts;
    const beforeC = sumLedgerAccountBalances([row]).cashOnHand;
    const na = normalizeLedgerAmount(cat, row.amount);
    const npm = normalizeLedgerAccounts(row.payment_methods ?? [], cat);
    const afterB = sumLedgerAccountBalances([{ ...row, amount: na, payment_methods: npm }]).bankAccounts;
    const afterC = sumLedgerAccountBalances([{ ...row, amount: na, payment_methods: npm }]).cashOnHand;
    const dB = afterB - beforeB;
    const dC = afterC - beforeC;
    if (Math.abs(dB) > 0.5 || Math.abs(dC) > 0.5) {
      cashDelta += dC;
      bankDelta += dB;
      if (samples.length < 12) {
        samples.push(`${row.occurred_on} ${row.category} $${row.amount}→${na} pm${JSON.stringify(row.payment_methods)}→${JSON.stringify(npm)} Δc${dC} Δb${dB} ${row.title.slice(0, 35)}`);
      }
    }
  }
  console.log('normalize-only delta cash', cashDelta, 'bank', bankDelta);
  for (const s of samples) console.log(' ', s);
}

main().catch(console.error);
