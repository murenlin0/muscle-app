/**
 * 重複列對富邦的淨影響（找出是否接近 10200）
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

function bank(r: { amount: number; category: string; payment_methods: string[] }): number {
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
  console.log('app 富邦', appBank, '目標', 119947, '差', 119947 - appBank);

  // 依 notion_page_id 重複
  const byNotion = new Map<string, typeof all>();
  for (const r of all) {
    if (!r.notion_page_id) continue;
    const base = r.notion_page_id.split('#')[0];
    const list = byNotion.get(base) ?? [];
    list.push(r);
    byNotion.set(base, list);
  }

  let extraBankFromDupNotion = 0;
  const notionDupSamples: string[] = [];
  for (const [pid, list] of byNotion) {
    if (list.length <= 1) continue;
    const total = list.reduce((s, r) => s + bank(r), 0);
    const first = bank(list[0]);
    const extra = total - first;
    if (extra !== 0) {
      extraBankFromDupNotion += extra;
      if (notionDupSamples.length < 12) {
        const r = list[0];
        notionDupSamples.push(
          `Δ富邦${extra} ×${list.length} ${r.occurred_on} ${r.category} ${r.title.slice(0, 45)}`,
        );
      }
    }
  }
  console.log('\n同一 notion_page_id 重複造成的富邦多計:', extraBankFromDupNotion);
  console.log('若去重後富邦:', appBank - extraBankFromDupNotion);
  for (const s of notionDupSamples) console.log(' ', s);

  // 依 日+標題 重複
  const byTitle = new Map<string, typeof all>();
  for (const r of all) {
    const k = `${r.occurred_on}|${r.title.replace(/\s/g, '')}`;
    const list = byTitle.get(k) ?? [];
    list.push(r);
    byTitle.set(k, list);
  }

  let extraBankTitle = 0;
  let groupsWithBankDup = 0;
  const titleDupSamples: string[] = [];
  for (const [, list] of byTitle) {
    if (list.length <= 1) continue;
    const total = list.reduce((s, r) => s + bank(r), 0);
    const first = bank(list[0]);
    const extra = total - first;
    if (extra === 0) continue;
    groupsWithBankDup += 1;
    extraBankTitle += extra;
    if (titleDupSamples.length < 15) {
      const r = list[0];
      titleDupSamples.push(
        `Δ${extra} ×${list.length} ${r.occurred_on} ${r.category} $${r.amount} 富邦${bank(r)} [${r.payment_methods.join(',')}] ${r.title.slice(0, 40)}`,
      );
    }
  }
  console.log('\n同日同標題重複 富邦多計:', extraBankTitle, `(${groupsWithBankDup} 組)`);
  console.log('去重後富邦:', appBank - extraBankTitle);
  for (const s of titleDupSamples) console.log(' ', s);

  // 無 notion_page_id 的列
  const noNotion = all.filter((r) => !r.notion_page_id);
  const noNotionBank = noNotion.reduce((s, r) => s + bank(r), 0);
  console.log('\n無 notion_page_id:', noNotion.length, '列, 富邦', noNotionBank);

  // 會員類異常：+金額在標題但類型錯
  console.log('\n=== 標題含儲值特徵 + 金額 的會員使用 (前20) ===');
  let n = 0;
  for (const r of all) {
    const t = r.title.replace(/\s/g, '');
    if (r.category !== '會員使用') continue;
    if (!/\+\d{4,}/.test(t)) continue;
  if (n++ < 20) {
      console.log(`  ${r.occurred_on} $${r.amount} 富邦${bank(r)} ${r.title.slice(0, 55)}`);
    }
  }
  console.log('…共', all.filter((r) => r.category === '會員使用' && /\+\d{4,}/.test(r.title.replace(/\s/g, ''))).length, '筆');
}

main().catch(console.error);
