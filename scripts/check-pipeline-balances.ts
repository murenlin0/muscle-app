import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { mapNotionRowToTransaction, upsertDailyTransactions } from '../lib/notion-daily-import';
import { migrateLedgerData } from '../lib/ledger-migrate-server';
import { sumLedgerAccountBalances } from '../lib/ledger-balances';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function sumDb() {
  const sb = getSupabaseAdmin();
  const all: { amount: number; category: string; payment_methods: string[] }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('amount, category, payment_methods')
      .eq('store_id', 'store1')
      .gte('occurred_on', '2024-03-16')
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }
  return { ...sumLedgerAccountBalances(all), rows: all.length };
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  await sb.from('daily_transactions').delete().eq('store_id', 'store1');
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const txs = notion.map((r) => mapNotionRowToTransaction(r, 'store1'));
  await upsertDailyTransactions(txs);
  const afterImport = await sumDb();
  console.log('import only', afterImport);
  await migrateLedgerData('store1');
  const afterMigrate = await sumDb();
  console.log('after migrate', afterMigrate);
  console.log('target: 現金 16398 富邦 119947');
}

main().catch(console.error);
