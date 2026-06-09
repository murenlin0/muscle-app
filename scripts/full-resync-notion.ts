/**
 * 從 Notion 完整重匯 daily_transactions（先清空該店再 upsert）
 * npx tsx scripts/full-resync-notion.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import {
  mapNotionRowToTransaction,
  upsertDailyTransactions,
} from '../lib/notion-daily-import';
import { migrateLedgerData } from '../lib/ledger-migrate-server';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { sumLedgerAccountBalances } from '../lib/ledger-balances';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function printBalances(storeId: string) {
  const sb = getSupabaseAdmin();
  const all: { amount: number; category: string; payment_methods: string[] }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('amount, category, payment_methods')
      .eq('store_id', storeId)
      .gte('occurred_on', '2024-03-16')
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }
  const { cashOnHand, bankAccounts } = sumLedgerAccountBalances(all);
  console.log(`餘額 (${all.length} 列): 現金=${cashOnHand} 富邦=${bankAccounts}`);
}

async function main() {
  loadEnv();
  const storeId = 'store1';
  const sb = getSupabaseAdmin();

  console.log('抓取 Notion…');
  const notionRows = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  console.log(`Notion ${notionRows.length} 筆`);

  console.log('清空本店流水帳…');
  const { error: delErr } = await sb.from('daily_transactions').delete().eq('store_id', storeId);
  if (delErr) throw new Error(delErr.message);

  const transactions = notionRows.map((row) => mapNotionRowToTransaction(row, storeId));
  const { upserted } = await upsertDailyTransactions(transactions);
  console.log(`已寫入 ${upserted} 筆（含拆分展開）`);

  console.log('正規化…');
  const report = await migrateLedgerData(storeId);
  console.log(JSON.stringify(report, null, 2));

  await printBalances(storeId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
