import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { mapNotionRowToTransaction, upsertDailyTransactions } from '../lib/notion-daily-import';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const BANK = new Set(['富邦', 'Line', '街口', '仁中信', '轉帳', 'line']);

async function sumDbRaw() {
  const sb = getSupabaseAdmin();
  const all: { amount: number; payment_methods: string[] }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('amount, payment_methods')
      .eq('store_id', 'store1')
      .gte('occurred_on', '2024-03-16')
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }
  let cash = 0;
  let bank = 0;
  for (const r of all) {
    const pm = r.payment_methods ?? [];
    if (pm.includes('現金')) cash += r.amount;
    if (pm.some((p) => BANK.has(p) || BANK.has(p.toLowerCase()))) bank += r.amount;
  }
  return { cash, bank, rows: all.length };
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  await sb.from('daily_transactions').delete().eq('store_id', 'store1');
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const txs = notion.map((r) => mapNotionRowToTransaction(r, 'store1'));
  await upsertDailyTransactions(txs);
  const s = await sumDbRaw();
  console.log('僅匯入後 DB notion-raw 加總:', s);
  console.log('目標 Notion API:', '現金 16398 富邦 119947');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
