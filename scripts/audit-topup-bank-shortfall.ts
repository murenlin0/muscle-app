/**
 * 同一標題群組：標題儲值金額 vs 實際富邦入帳
 */
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

function parseTopup(title: string): number | null {
  const t = title.replace(/\s/g, '');
  const m = t.match(/\+(\d{3,})送?/) ?? t.match(/儲值(\d{3,})/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
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

  const groups = new Map<string, typeof all>();
  for (const r of all) {
    const k = `${r.occurred_on}|${r.title.replace(/\s/g, '')}`;
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }

  let totalShortfall = 0;
  const shorts: { gap: number; note: string }[] = [];

  for (const [, list] of groups) {
    const topup = parseTopup(list[0].title);
    if (!topup) continue;
    const bankTopup = list
      .filter((r) => r.category === '會員儲值')
      .reduce((s, r) => s + bank(r), 0);
    const cashTopup = list
      .filter((r) => r.category === '會員儲值')
      .reduce((s, r) => {
        const cat = r.category as TransactionCategory;
        return primaryLedgerAccount(r.payment_methods ?? [], cat) === '現金'
          ? s + normalizeLedgerAmount(cat, r.amount)
          : s;
      }, 0);
    const gap = topup - bankTopup - cashTopup;
    if (gap > 0) {
      totalShortfall += gap;
      shorts.push({
        gap,
        note: `${list[0].occurred_on} 標題+${topup} 富邦${bankTopup} 現金${cashTopup} 缺${gap} ${list[0].title.slice(0, 45)}`,
      });
    }
  }

  shorts.sort((a, b) => b.gap - a.gap);
  console.log('儲值入帳不足（標題 vs 現金+富邦）合計缺:', totalShortfall);
  console.log('Notion 富邦缺口:', 10200);
  console.log('\n前 25 筆缺口最大:');
  for (const s of shorts.slice(0, 25)) console.log(`  ${s.gap} | ${s.note}`);
}

main().catch(console.error);
