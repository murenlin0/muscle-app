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

function fp(row: {
  occurred_on: string;
  title: string;
  category: string;
  amount: number;
  payment_methods: string[];
}) {
  return `${row.occurred_on}|${row.title.replace(/\s/g, '')}|${row.category}|${row.amount}|${JSON.stringify(row.payment_methods ?? [])}`;
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  await sb.from('daily_transactions').delete().eq('store_id', 'store1');
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  await upsertDailyTransactions(notion.map((r) => mapNotionRowToTransaction(r, 'store1')));

  const { data } = await sb
    .from('daily_transactions')
    .select('id, notion_page_id, occurred_on, title, amount, category, payment_methods')
    .eq('store_id', 'store1');

  const groups = new Map<string, NonNullable<typeof data>>();
  for (const r of data ?? []) {
    const k = fp(r);
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }

  let multi = 0;
  for (const [k, list] of groups) {
    if (list.length <= 1) continue;
    multi++;
    const ids = new Set(list.map((r) => r.notion_page_id));
    if (multi <= 5) {
      console.log(`×${list.length} notion_ids=${ids.size} ${list[0].occurred_on} $${list[0].amount} ${list[0].title.slice(0, 40)}`);
      for (const r of list) console.log('  ', r.notion_page_id?.slice(0, 8), r.payment_methods);
    }
  }
  console.log('duplicate fingerprint groups', multi);
}

main().catch(console.error);
