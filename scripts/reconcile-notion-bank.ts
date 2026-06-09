/**
 * 比對 Notion vs DB 富邦餘額
 * npx tsx scripts/reconcile-notion-bank.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { mapNotionRowToTransaction } from '../lib/notion-daily-import';
import { primaryLedgerAccount } from '../lib/ledger-accounts';
import { normalizeLedgerAmount } from '../lib/ledger-amount';
import { isMultiStaffCompoundTitle, splitMultiStaffTransaction } from '../lib/multi-staff-split';
import {
  getNotionKeyDiagnostics,
  NOTION_STORE1_DAILY_DB_ID,
  probeNotionConnection,
  queryNotionDatabaseAll,
} from '../lib/notion-api';
import type { TransactionCategory } from '../lib/transaction-category';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

function bank(cat: TransactionCategory, amount: number, pm: string[]): number {
  if (primaryLedgerAccount(pm, cat) !== '富邦') return 0;
  return normalizeLedgerAmount(cat, amount);
}

function notionRowBank(row: ReturnType<typeof mapNotionRowToTransaction>): number {
  if (isMultiStaffCompoundTitle(row.title)) {
    const split = splitMultiStaffTransaction(row);
    if (!split) return bank(row.category as TransactionCategory, row.amount, row.payment_methods);
    return split.reduce(
      (s, x) => s + bank(x.category as TransactionCategory, x.amount, x.payment_methods),
      0,
    );
  }
  return bank(row.category as TransactionCategory, row.amount, row.payment_methods);
}

async function main() {
  loadEnv();
  const from = '2024-03-16';

  console.log('Notion 金鑰診斷:', getNotionKeyDiagnostics());
  const probe = await probeNotionConnection(NOTION_STORE1_DAILY_DB_ID);
  console.log('Notion 連線:', probe.ok ? '成功' : probe.hint);

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const dbRows: { amount: number; category: string; payment_methods: string[]; occurred_on: string }[] =
    [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('amount, category, payment_methods, occurred_on')
      .eq('store_id', 'store1')
      .gte('occurred_on', from)
      .range(o, o + 999);
    if (!data?.length) break;
    dbRows.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }

  let dbCash = 0;
  let dbBank = 0;
  for (const r of dbRows) {
    const cat = r.category as TransactionCategory;
    const acc = primaryLedgerAccount(r.payment_methods ?? [], cat);
    const n = normalizeLedgerAmount(cat, r.amount);
    if (acc === '現金') dbCash += n;
    if (acc === '富邦') dbBank += n;
  }

  console.log(`\nDB (${dbRows.length} 列) 現金=${dbCash} 富邦=${dbBank}`);

  if (!probe.ok) {
    console.log('\n略過 Notion 逐筆比對（本地金鑰無法連線時，請在 Vercel 上執行或更新 .env.local）');
    return;
  }

  const notionRows = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const scoped = notionRows.filter((r) => (r.dateStart?.slice(0, 10) ?? '') >= from);

  let notionCash = 0;
  let notionBank = 0;
  for (const r of scoped) {
    const tx = mapNotionRowToTransaction(r, 'store1');
    const cat = tx.category as TransactionCategory;
    const acc = primaryLedgerAccount(tx.payment_methods, cat);
    const n = normalizeLedgerAmount(cat, tx.amount);
    if (acc === '現金') notionCash += n;
    if (acc === '富邦') notionBank += n;
  }

  console.log(`Notion (${scoped.length} 列) 現金=${notionCash} 富邦=${notionBank}`);
  console.log(`差額 現金=${dbCash - notionCash} 富邦=${dbBank - notionBank}`);

  const byPage = new Map<string, number>();
  for (const r of scoped) {
    const tx = mapNotionRowToTransaction(r, 'store1');
    byPage.set(r.pageId, notionRowBank(tx));
  }

  const { data: dbWithNotion } = await sb
    .from('daily_transactions')
    .select('notion_page_id, amount, category, payment_methods')
    .eq('store_id', 'store1')
    .gte('occurred_on', from)
    .not('notion_page_id', 'is', null);

  const dbByBase = new Map<string, number>();
  for (const r of dbWithNotion ?? []) {
    const base = (r.notion_page_id as string).split('#')[0];
    const cat = r.category as TransactionCategory;
    const b = bank(cat, r.amount as number, (r.payment_methods as string[]) ?? []);
    dbByBase.set(base, (dbByBase.get(base) ?? 0) + b);
  }

  const diffs: { pageId: string; diff: number }[] = [];
  for (const [pageId, expected] of byPage) {
    const actual = dbByBase.get(pageId) ?? 0;
    const diff = actual - expected;
    if (Math.abs(diff) > 0.5) diffs.push({ pageId, diff });
  }
  for (const [base, actual] of dbByBase) {
    if (!byPage.has(base)) diffs.push({ pageId: base, diff: actual });
  }

  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  console.log(`\n富邦 per-page 差異 ${diffs.length} 筆，前 15:`);
  let sum = 0;
  for (const d of diffs.slice(0, 15)) {
    sum += d.diff;
    const nr = scoped.find((x) => x.pageId === d.pageId);
    console.log(`  Δ${d.diff} ${nr?.dateStart?.slice(0, 10) ?? '?'} ${nr?.title?.slice(0, 45) ?? d.pageId.slice(0, 8)}`);
  }
  console.log('前15頁差額合計', sum, '| 全部', diffs.reduce((s, d) => s + d.diff, 0));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
