import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { primaryLedgerAccount } from '../lib/ledger-accounts';
import { isTransferCategory, normalizeLedgerAmount } from '../lib/ledger-amount';
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
    amount: number;
    category: string;
    payment_methods: string[];
  }[] = [];
  let offset = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('occurred_on, amount, category, payment_methods')
      .eq('store_id', 'store1')
      .gte('occurred_on', '2024-03-16')
      .order('occurred_on', { ascending: true })
      .range(offset, offset + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Notion way: sum amount where 付款方式 = 現金/富邦
  let cashNotion = 0;
  let bankNotion = 0;
  for (const r of all) {
    const pm = r.payment_methods ?? [];
    if (pm.includes('現金')) cashNotion += r.amount;
    if (pm.some((p) => ['富邦', 'Line', '街口', '仁中信', '轉帳'].includes(p))) bankNotion += r.amount;
  }

  // Current app logic (skip transfer + 會員使用)
  let cashApp = 0;
  let bankApp = 0;
  for (const r of all) {
    const cat = r.category as TransactionCategory;
    if (cat === '會員使用' || isTransferCategory(cat)) continue;
    const acc = primaryLedgerAccount(r.payment_methods ?? [], cat);
    if (acc === '現金') cashApp += r.amount;
    if (acc === '富邦') bankApp += r.amount;
  }

  // Fixed: Notion 算法 — 依帳戶加總正規化後金額（含轉出轉入）
  let cashFix = 0;
  let bankFix = 0;
  for (const r of all) {
    const cat = r.category as TransactionCategory;
    const acc = primaryLedgerAccount(r.payment_methods ?? [], cat);
    if (!acc) continue;
    const amt = normalizeLedgerAmount(cat, r.amount);
    if (acc === '現金') cashFix += amt;
    if (acc === '富邦') bankFix += amt;
  }

  console.log('Rows from 2024-03-16:', all.length);
  console.log('Notion raw payment_methods sum:');
  console.log('  現金:', cashNotion);
  console.log('  富邦(+legacy):', bankNotion);
  console.log('Current app (skip 轉出轉入):');
  console.log('  現金:', cashApp, '富邦:', bankApp, 'total:', cashApp + bankApp);
  console.log('Fixed (sum all with account):');
  console.log('  現金:', cashFix, '富邦:', bankFix, 'total:', cashFix + bankFix);
  console.log('Expected Notion: 現金 16398, 富邦 119947');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
