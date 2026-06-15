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

function bank(r: { amount: number; category: string; payment_methods: string[] }): number {
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
  const all: {
    id: string;
    occurred_on: string;
    title: string;
    amount: number;
    category: string;
    payment_methods: string[];
    notion_page_id: string | null;
  }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, payment_methods, notion_page_id')
      .eq('store_id', 'store1')
      .gte('occurred_on', '2024-03-16')
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }

  const appBank = all.reduce((s, r) => s + bank(r), 0);

  // 真重複：同 notion_page_id 完全相同的列（不應發生）
  const byNotionExact = new Map<string, typeof all>();
  for (const r of all) {
    if (!r.notion_page_id) continue;
    const list = byNotionExact.get(r.notion_page_id) ?? [];
    list.push(r);
    byNotionExact.set(r.notion_page_id, list);
  }
  let dupNotionBank = 0;
  for (const [pid, list] of byNotionExact) {
    if (list.length <= 1) continue;
    const extra = list.reduce((s, r) => s + bank(r), 0) - bank(list[0]);
    if (extra !== 0) {
      dupNotionBank += extra;
      console.log(`notion_id dup ${pid.slice(0, 8)} ×${list.length} Δ富邦${extra}`);
    }
  }

  // 同 notion base 多列（拆分）— 預期行為
  const byBase = new Map<string, typeof all>();
  for (const r of all) {
    if (!r.notion_page_id) continue;
    const base = r.notion_page_id.split('#')[0];
    const list = byBase.get(base) ?? [];
    list.push(r);
    byBase.set(base, list);
  }

  let multiSplitExtra = 0;
  const multiSamples: string[] = [];
  for (const [base, list] of byBase) {
    if (list.length <= 1) continue;
    const total = list.reduce((s, r) => s + bank(r), 0);
    // 若全是會員使用+一筆儲值，total 應等於儲值那筆
    const topups = list.filter((r) => r.category === '會員儲值');
    const topupBank = topups.reduce((s, r) => s + bank(r), 0);
    if (topups.length === 1 && total === topupBank) continue; // OK split

    if (list.length >= 3 && list.some((r) => isMultiStaffCompoundTitle(r.title))) {
      const expected = 10000; // typical
      if (total !== topupBank) {
        multiSamples.push(`${list[0].occurred_on} ×${list.length} 富邦${total} 儲值${topupBank} ${list[0].title.slice(0, 40)}`);
      }
    }
  }

  console.log('app 富邦', appBank, '目標', 119947, '差', 119947 - appBank);
  console.log('notion_id 完全重複 富邦多計', dupNotionBank);

  // 工資/分紅：同日期同標題兩筆不同金額（真重複匯入）
  console.log('\n=== 同標題真重複（2列同 category 同 title）===');
  const byKey = new Map<string, typeof all>();
  for (const r of all) {
    const k = `${r.occurred_on}|${r.title.replace(/\s/g, '')}|${r.category}`;
    const list = byKey.get(k) ?? [];
    list.push(r);
    byKey.set(k, list);
  }
  let trueDupBank = 0;
  for (const [, list] of byKey) {
    if (list.length <= 1) continue;
    const total = list.reduce((s, r) => s + bank(r), 0);
    const single = bank(list[0]);
    const extra = total - single;
    if (extra !== 0) {
      trueDupBank += extra;
      if (Math.abs(extra) >= 1000) {
        const r = list[0];
        console.log(`  Δ${extra} ×${list.length} ${r.occurred_on} ${r.category} ${r.title.slice(0, 40)}`);
      }
    }
  }
  console.log('真重複富邦多計合計', trueDupBank);
  console.log('去真重複後富邦', appBank - trueDupBank);

  for (const s of multiSamples) console.log('compound', s);
}

function isMultiStaffCompoundTitle(title: string): boolean {
  return /[、.·].+?\+\d+送\d+-\d+、\d+VIP/.test(title.replace(/\s/g, ''));
}

main().catch(console.error);
