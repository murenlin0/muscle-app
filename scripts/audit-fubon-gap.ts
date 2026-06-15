/**
 * 追查富邦差額 119947 - 109747 = 10200
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { primaryLedgerAccount } from '../lib/ledger-accounts';
import { normalizeLedgerAmount } from '../lib/ledger-amount';
import { isMultiStaffCompoundTitle, splitMultiStaffTransaction } from '../lib/multi-staff-split';
import type { TransactionCategory } from '../lib/transaction-category';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

type Tx = {
  id: string;
  occurred_on: string;
  title: string;
  amount: number;
  category: string;
  payment_methods: string[];
};

function bankContrib(r: Tx): number {
  const cat = r.category as TransactionCategory;
  const acc = primaryLedgerAccount(r.payment_methods ?? [], cat);
  if (acc !== '富邦') return 0;
  return normalizeLedgerAmount(cat, r.amount);
}

async function main() {
  loadEnv();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const all: Tx[] = [];
  let offset = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, payment_methods')
      .eq('store_id', 'store1')
      .gte('occurred_on', '2024-03-16')
      .order('occurred_on', { ascending: true })
      .range(offset, offset + 999);
    if (!data?.length) break;
    all.push(...(data as Tx[]));
    if (data.length < 1000) break;
    offset += 1000;
  }

  const GAP = 119947 - 109747;
  console.log('目標差額:', GAP);

  // 1. 會員儲值有金額但無富邦帳戶
  console.log('\n=== 會員儲值但無富邦 (應有卻沒有) ===');
  let lostBank = 0;
  for (const r of all) {
    if (r.category !== '會員儲值') continue;
    const b = bankContrib(r);
    if (b === 0 && r.amount > 0) {
      lostBank += r.amount;
      console.log(`  ${r.occurred_on} $${r.amount} [${r.payment_methods.join(',')}] ${r.title.slice(0, 55)}`);
    }
  }
  console.log('合計漏計富邦:', lostBank);

  // 2. 多人合寫未拆分 — 應有富邦 vs 實際
  console.log('\n=== 多人合寫未拆分 (修復後應增加的富邦) ===');
  let fixGain = 0;
  const seen = new Set<string>();
  for (const r of all) {
    if (!isMultiStaffCompoundTitle(r.title)) continue;
    const key = `${r.occurred_on}|${r.title}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const split = splitMultiStaffTransaction(r);
    if (!split) continue;

    const actual = all
      .filter((x) => x.occurred_on === r.occurred_on && x.title.replace(/\s/g, '') === r.title.replace(/\s/g, ''))
      .reduce((s, x) => s + bankContrib(x), 0);

    const expected = split.reduce(
      (s, x) => s + bankContrib({ ...r, category: x.category, amount: x.amount, payment_methods: x.payment_methods }),
      0,
    );

    const diff = expected - actual;
    if (diff !== 0) {
      fixGain += diff;
      console.log(`  ${r.occurred_on} 實際富邦${actual} → 應為${expected} (Δ${diff})`);
      console.log(`    ${r.title.slice(0, 60)}`);
    }
  }
  console.log('修復多人合寫可追回富邦:', fixGain);

  // 3. 會員儲值被標成其他類型但有富邦?
  console.log('\n=== 標題含 +10000 儲值特徵但類型不是會員儲值 ===');
  for (const r of all) {
    const t = r.title.replace(/\s/g, '');
    if (/\+\d{4,}送?\d*-/.test(t) && r.category !== '會員儲值' && !isMultiStaffCompoundTitle(r.title)) {
      console.log(`  ${r.occurred_on} ${r.category} $${r.amount} ${r.title.slice(0, 55)}`);
    }
  }

  // 4. 富邦+10000 級別的列
  console.log('\n=== 富邦貢獻 = 10000 的列 ===');
  for (const r of all) {
    const b = bankContrib(r);
    if (b === 10000) {
      console.log(`  ${r.occurred_on} ${r.category} ${r.title.slice(0, 55)}`);
    }
  }

  // 5. 金額加總為 10200 的候選
  console.log('\n=== 富邦貢獻加總接近 10200 的異常群組 ===');
  const compounds = all.filter((r) => isMultiStaffCompoundTitle(r.title));
  const byDate = new Map<string, Tx[]>();
  for (const r of compounds) {
    const k = r.occurred_on;
    const list = byDate.get(k) ?? [];
    list.push(r);
    byDate.set(k, list);
  }
  for (const [date, list] of byDate) {
    const actual = list.reduce((s, r) => s + bankContrib(r), 0);
    const uniqueTitle = list[0]?.title;
    const split = uniqueTitle ? splitMultiStaffTransaction({ title: uniqueTitle, amount: 0, payment_methods: [] }) : null;
    const expected = split?.reduce(
      (s, x) => s + bankContrib({ ...list[0], category: x.category, amount: x.amount, payment_methods: x.payment_methods }),
      0,
    ) ?? 0;
    console.log(`  ${date}: ${list.length}列 compound, 富邦實際${actual} 應${expected} Δ${expected - actual}`);
  }

  // 6. 重複列是否多計富邦
  console.log('\n=== 同日同標題重複且影響富邦 ===');
  const td = new Map<string, Tx[]>();
  for (const r of all) {
    const k = `${r.occurred_on}|${r.title.replace(/\s/g, '')}`;
    const list = td.get(k) ?? [];
    list.push(r);
    td.set(k, list);
  }
  let dupBank = 0;
  let dupCount = 0;
  for (const [, list] of td) {
    if (list.length < 2) continue;
    const b = list.reduce((s, r) => s + bankContrib(r), 0);
    if (b === 0) continue;
    const single = bankContrib(list[0]);
    if (Math.abs(b - single * list.length) > 0.5) {
      dupCount += 1;
      dupBank += b - single;
      if (dupCount <= 8) {
        console.log(`  ×${list.length} ${list[0].occurred_on} ${list[0].category} 富邦${b} (應${single}) ${list[0].title.slice(0, 45)}`);
      }
    }
  }
  console.log(`重複多計富邦合計: ${dupBank} (${dupCount} 組)`);

  // 7. 2026-05-31 張茜茜
  console.log('\n=== 張茜茜 相關列 ===');
  for (const r of all) {
    if (!r.title.includes('張茜茜') && !r.title.includes('0916453353')) continue;
    console.log(
      `  ${r.occurred_on} | ${r.category} | $${r.amount} | 富邦${bankContrib(r)} | [${r.payment_methods.join(',')}] | ${r.title.slice(0, 65)}`,
    );
  }
}

main().catch(console.error);
