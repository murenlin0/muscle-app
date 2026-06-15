import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { primaryLedgerAccount } from '../lib/ledger-accounts';
import { normalizeLedgerAmount } from '../lib/ledger-amount';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import type { TransactionCategory } from '../lib/transaction-category';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const BANK = new Set(['富邦', 'Line', '街口', '仁中信', '轉帳', 'line']);

function sumDb(rows: { category: string; amount: number; payment_methods: string[] }[]) {
  let cash = 0;
  let bank = 0;
  const cats = new Map<string, number>();
  for (const r of rows) {
    cats.set(r.category, (cats.get(r.category) ?? 0) + 1);
    const cat = r.category as TransactionCategory;
    const acc = primaryLedgerAccount(r.payment_methods ?? [], cat);
    const n = normalizeLedgerAmount(cat, r.amount);
    if (acc === '現金') cash += n;
    if (acc === '富邦') bank += n;
  }
  return { cash, bank, cats, rows: rows.length };
}

function sumNotionRaw(rows: { amount: number; paymentMethods?: string[] }[]) {
  let cash = 0;
  let bank = 0;
  for (const r of rows) {
    const pm = r.paymentMethods ?? [];
    if (pm.includes('現金')) cash += r.amount;
    if (pm.some((p) => BANK.has(p) || BANK.has(p.toLowerCase()))) bank += r.amount;
  }
  return { cash, bank, rows: rows.length };
}

async function fetchDb() {
  const sb = getSupabaseAdmin();
  const all: { category: string; amount: number; payment_methods: string[] }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('category, amount, payment_methods')
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
  const db = await fetchDb();
  const dbSum = sumDb(db);
  console.log('=== DB (app算法) ===');
  console.log(`列數 ${dbSum.rows}  現金 ${dbSum.cash}  富邦 ${dbSum.bank}`);
  console.log('轉出', dbSum.cats.get('轉出') ?? 0, '轉入', dbSum.cats.get('轉入') ?? 0, '轉移', dbSum.cats.get('轉移') ?? 0);

  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const scoped = notion.filter((r) => (r.dateStart?.slice(0, 10) ?? '') >= '2024-03-16');
  const nSum = sumNotionRaw(scoped);
  console.log('\n=== Notion (raw加總) ===');
  console.log(`列數 ${nSum.rows}  現金 ${nSum.cash}  富邦 ${nSum.bank}`);
  console.log(`目標 現金 16398  富邦 119947`);
  console.log(`差 現金 ${dbSum.cash - nSum.cash}  富邦 ${dbSum.bank - nSum.bank}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
