/**
 * 找出 DB 富邦與「若依 Notion 付款方式標籤」差 10200 的具體列
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

const BANK_TAGS = new Set(['富邦', 'Line', '街口', '仁中信', '轉帳', 'line']);

function notionTagBank(amount: number, pm: string[]): number {
  if (pm.some((p) => BANK_TAGS.has(p) || BANK_TAGS.has(p.toLowerCase()))) return amount;
  return 0;
}

function appBank(cat: TransactionCategory, amount: number, pm: string[]): number {
  const acc = primaryLedgerAccount(pm, cat);
  if (acc !== '富邦') return 0;
  return normalizeLedgerAmount(cat, amount);
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
  let offset = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('occurred_on, title, amount, category, payment_methods')
      .eq('store_id', 'store1')
      .gte('occurred_on', '2024-03-16')
      .range(offset, offset + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  let appTotal = 0;
  let tagTotal = 0;
  const diffs: { diff: number; row: (typeof all)[0] }[] = [];

  for (const r of all) {
    const cat = r.category as TransactionCategory;
    const a = appBank(cat, r.amount, r.payment_methods ?? []);
    const t = notionTagBank(r.amount, r.payment_methods ?? []);
    appTotal += a;
    tagTotal += t;
    const d = a - t;
    if (Math.abs(d) > 0.5) diffs.push({ diff: d, row: r });
  }

  console.log('app 富邦:', appTotal);
  console.log('tag 富邦 (含會員使用等):', tagTotal);
  console.log('差:', appTotal - tagTotal);
  console.log('目標 Notion 富邦: 119947, app缺口:', 119947 - appTotal);

  // 假設 Notion = app + 會員使用誤標富邦的調整?
  diffs.sort((a, b) => a.diff - b.diff);
  console.log('\napp 少算 (diff 負, 前15):');
  for (const x of diffs.filter((d) => d.diff < 0).slice(0, 15)) {
    console.log(
      `  ${x.diff} | ${x.row.occurred_on} ${x.row.category} $${x.row.amount} [${x.row.payment_methods.join(',')}] ${x.row.title.slice(0, 50)}`,
    );
  }

  console.log('\napp 多算 (diff 正, 前15):');
  for (const x of diffs.filter((d) => d.diff > 0).slice(-15)) {
    console.log(
      `  +${x.diff} | ${x.row.occurred_on} ${x.row.category} $${x.row.amount} [${x.row.payment_methods.join(',')}] ${x.row.title.slice(0, 50)}`,
    );
  }

  const negSum = diffs.filter((d) => d.diff < 0).reduce((s, d) => s + d.diff, 0);
  const posSum = diffs.filter((d) => d.diff > 0).reduce((s, d) => s + d.diff, 0);
  console.log('\napp少算合計:', negSum, 'app多算合計:', posSum);

  // 雙打 / 多人未拆分
  console.log('\n=== 雙打/多人異常標題 ===');
  for (const r of all) {
    const t = r.title.replace(/\s/g, '');
    if (/雙打|仁、|\.湘\.|錦\.湘/.test(t) && /\+?\d{4,}/.test(t)) {
      const a = appBank(r.category as TransactionCategory, r.amount, r.payment_methods ?? []);
      console.log(
        `  ${r.occurred_on} ${r.category} $${r.amount} 富邦${a} [${r.payment_methods.join(',')}] ${r.title.slice(0, 55)}`,
      );
    }
  }
}

main().catch(console.error);
