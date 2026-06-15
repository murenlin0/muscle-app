/**
 * 比較 migrate 前後餘額（重新 wipe + import，不寫入 migrate）
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { mapNotionRowToTransaction, upsertDailyTransactions } from '../lib/notion-daily-import';
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

async function fetchRows() {
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
  return all;
}

async function main() {
  loadEnv();
  const storeId = 'store1';
  const sb = getSupabaseAdmin();

  console.log('wipe + import…');
  await sb.from('daily_transactions').delete().eq('store_id', storeId);
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const txs = notion.map((r) => mapNotionRowToTransaction(r, storeId));
  await upsertDailyTransactions(txs);

  const pre = sumLedgerAccountBalances(await fetchRows());
  console.log('migrate 前', pre, '列數', (await fetchRows()).length);

  await migrateLedgerData(storeId);

  const post = sumLedgerAccountBalances(await fetchRows());
  console.log('migrate 後', post, '列數', (await fetchRows()).length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
