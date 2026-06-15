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

  console.log('=== 儲值標題金額 vs 列金額不符（會員儲值/補差額）===');
  let bankGap = 0;
  for (const r of all) {
    if (!['會員儲值', '會員補差額'].includes(r.category)) continue;
    const t = r.title.replace(/\s/g, '');
    const topup = t.match(/\+(\d{3,})送?/)?.[1] ?? t.match(/儲值(\d{3,})/)?.[1];
    if (!topup) continue;
    const expected = Number(topup);
    if (!Number.isFinite(expected) || expected === r.amount) continue;
    const cat = r.category as TransactionCategory;
    const b =
      primaryLedgerAccount(r.payment_methods ?? [], cat) === '富邦'
        ? normalizeLedgerAmount(cat, r.amount)
        : 0;
    const expectedB =
      primaryLedgerAccount(r.payment_methods ?? [], cat) === '富邦'
        ? normalizeLedgerAmount(cat, expected)
        : 0;
    bankGap += expectedB - b;
    console.log(
      `${r.occurred_on} ${r.category} 列$${r.amount} 標題+${expected} 富邦差${expectedB - b} ${r.title.slice(0, 50)}`,
    );
  }
  console.log('若依標題儲值金額修正富邦差', bankGap);

  // payment_methods 含 Line 但 category 會員儲值
  console.log('\n=== Line/街口 儲值列 ===');
  let lineBank = 0;
  for (const r of all) {
    if (r.category !== '會員儲值') continue;
    const pm = r.payment_methods ?? [];
    if (!pm.some((p) => ['Line', '街口', '仁中信', '轉帳'].includes(p))) continue;
    const cat = r.category as TransactionCategory;
    const b =
      primaryLedgerAccount(pm, cat) === '富邦' ? normalizeLedgerAmount(cat, r.amount) : 0;
    lineBank += b;
    if (b > 0)
      console.log(`${r.occurred_on} $${r.amount} [${pm.join(',')}] ${r.title.slice(0, 45)}`);
  }
  console.log('Line/街口等儲值 富邦合計', lineBank);
}

main().catch(console.error);
