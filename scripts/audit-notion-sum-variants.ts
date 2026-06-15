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
  const all: { amount: number; category: string; payment_methods: string[]; occurred_on: string; title: string }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('amount, category, payment_methods, occurred_on, title')
      .eq('store_id', 'store1')
      .gte('occurred_on', '2024-03-16')
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }

  const BANK = new Set(['富邦', 'Line', '街口', '仁中信', '轉帳', 'line']);
  let appCash = 0;
  let appBank = 0;
  let rawCash = 0;
  let rawBank = 0;
  let normBankTagged = 0;
  let normCashTagged = 0;

  for (const r of all) {
    const cat = r.category as TransactionCategory;
    const pm = r.payment_methods ?? [];
    const n = normalizeLedgerAmount(cat, r.amount);
    const acc = primaryLedgerAccount(pm, cat);
    if (acc === '現金') appCash += n;
    if (acc === '富邦') appBank += n;
    if (pm.includes('現金')) {
      rawCash += r.amount;
      normCashTagged += n;
    }
    if (pm.some((p) => BANK.has(p) || BANK.has(p.toLowerCase()))) {
      rawBank += r.amount;
      normBankTagged += n;
    }
  }

  console.log('rows', all.length);
  console.log('app 現金/富邦', appCash, appBank);
  console.log('raw tag 現金/富邦', rawCash, rawBank);
  console.log('normalized on tagged 現金/富邦', normCashTagged, normBankTagged);
  console.log('目標 Notion: 現金 16398 富邦 119947');
  console.log('富邦缺口', 119947 - appBank);

  // 找讓缺口=10200的候選：重複列刪除後?
  // 會員使用誤標富邦但 duplicate - if we REMOVE duplicates keeping 1, effect on bank?

  // 雙打列：若 Notion 是1列10000儲值+雙人使用，我們拆錯?
  const doubleRows = all.filter((r) => /雙打|仁、|錦\.湘/.test(r.title));
  let dBank = 0;
  for (const r of doubleRows) {
    dBank += primaryLedgerAccount(r.payment_methods, r.category as TransactionCategory) === '富邦'
      ? normalizeLedgerAmount(r.category as TransactionCategory, r.amount)
      : 0;
  }
  console.log('雙打/多人相關列 富邦貢獻', dBank, '列數', doubleRows.length);

  // 會員儲值 富邦 去重（同日同標題只算一次）
  const seen = new Map<string, number>();
  let dedupBank = 0;
  for (const r of all) {
    const cat = r.category as TransactionCategory;
    const b =
      primaryLedgerAccount(r.payment_methods ?? [], cat) === '富邦'
        ? normalizeLedgerAmount(cat, r.amount)
        : 0;
    if (b === 0) continue;
    const k = `${r.occurred_on}|${r.title.replace(/\s/g, '')}|${r.category}|${r.amount}`;
    if (seen.has(k)) continue;
    seen.set(k, 1);
    dedupBank += b;
  }
  console.log('富邦去重後', dedupBank, '差', dedupBank - appBank);

  // 缺口 10200：列出富邦=10200的單列或組合
  const bankRows = all
    .map((r) => ({
      ...r,
      bank: primaryLedgerAccount(r.payment_methods ?? [], r.category as TransactionCategory) === '富邦'
        ? normalizeLedgerAmount(r.category as TransactionCategory, r.amount)
        : 0,
    }))
    .filter((r) => r.bank !== 0);

  for (const target of [10200, 10000, 200, 500, 1500, 3000, 4500]) {
    const hits = bankRows.filter((r) => Math.abs(r.bank) === target);
    if (hits.length) {
      console.log(`\n富邦絕對值=${target} 的列 (${hits.length}):`);
      for (const h of hits.slice(0, 5)) {
        console.log(`  ${h.occurred_on} ${h.category} ${h.bank} ${h.title.slice(0, 50)}`);
      }
    }
  }
}

main().catch(console.error);
