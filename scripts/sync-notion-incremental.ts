/**
 * 增量同步 Notion → Supabase（不清空，upsert + migrate）
 * npx tsx scripts/sync-notion-incremental.ts
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

async function main() {
  loadEnv();
  const storeId = 'store1';
  const sb = getSupabaseAdmin();

  const { data: beforeLatest } = await sb
    .from('daily_transactions')
    .select('occurred_on')
    .eq('store_id', storeId)
    .order('occurred_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log('同步前最新日期:', beforeLatest?.occurred_on ?? '(無)');

  console.log('抓取 Notion…');
  const notionRows = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  console.log(`Notion ${notionRows.length} 筆`);

  const transactions = notionRows.map((row) => mapNotionRowToTransaction(row, storeId));
  const notionLatest = transactions.reduce<string | null>((max, r) => {
    if (!max || r.occurred_on > max) return r.occurred_on;
    return max;
  }, null);

  const { upserted } = await upsertDailyTransactions(transactions);
  console.log(`已 upsert ${upserted} 筆`);

  const report = await migrateLedgerData(storeId);
  console.log('migrate:', JSON.stringify(report));

  const { count } = await sb
    .from('daily_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('store_id', storeId);

  const { data: afterLatest } = await sb
    .from('daily_transactions')
    .select('occurred_on')
    .eq('store_id', storeId)
    .order('occurred_on', { ascending: false })
    .limit(1)
    .maybeSingle();

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
  const bal = sumLedgerAccountBalances(all);

  console.log(`\n同步後：${count} 列，最新 ${afterLatest?.occurred_on}（Notion 最新 ${notionLatest}）`);
  console.log(`餘額：現金 ${bal.cashOnHand}、富邦 ${bal.bankAccounts}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
