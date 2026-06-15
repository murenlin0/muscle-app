import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { mapNotionRowToTransaction, upsertDailyTransactions } from '../lib/notion-daily-import';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { sumLedgerAccountBalances } from '../lib/ledger-balances';
import { normalizeLedgerAccounts } from '../lib/ledger-accounts';
import { normalizeCompoundTopupRow } from '../lib/multi-staff-split';
import { LEGACY_TRANSFER_CATEGORY, type TransactionCategory } from '../lib/transaction-category';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

function fingerprint(row: {
  occurred_on: string;
  title: string;
  category: string;
  amount: number;
  payment_methods: string[];
}) {
  return `${row.occurred_on}|${row.title.replace(/\s/g, '')}|${row.category}|${row.amount}|${JSON.stringify(row.payment_methods ?? [])}`;
}

async function fetchAll() {
  const sb = getSupabaseAdmin();
  const all: {
    id: string;
    occurred_on: string;
    title: string;
    category: string;
    amount: number;
    payment_methods: string[];
  }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, category, amount, payment_methods')
      .eq('store_id', 'store1')
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
  const sb = getSupabaseAdmin();
  await sb.from('daily_transactions').delete().eq('store_id', 'store1');
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  await upsertDailyTransactions(notion.map((r) => mapNotionRowToTransaction(r, 'store1')));

  let rows = await fetchAll();
  console.log('1 import', sumLedgerAccountBalances(rows), 'n', rows.length);

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = fingerprint(r);
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  const deleteIds: string[] = [];
  for (const [, list] of groups) {
    if (list.length <= 1) continue;
    for (let i = 1; i < list.length; i++) deleteIds.push(list[i].id);
  }
  const deleted = rows.filter((r) => deleteIds.includes(r.id));
  console.log('dedupe would remove', deleteIds.length, 'balance', sumLedgerAccountBalances(deleted));
  if (deleteIds.length) {
    await sb.from('daily_transactions').delete().in('id', deleteIds);
  }
  rows = await fetchAll();
  console.log('2 after dedupe', sumLedgerAccountBalances(rows), 'n', rows.length);

  let accountUpdates = 0;
  for (const row of rows) {
    if (row.category === LEGACY_TRANSFER_CATEGORY) continue;
    const compound = normalizeCompoundTopupRow(row);
    if (compound) {
      await sb
        .from('daily_transactions')
        .update({
          title: compound.title,
          amount: Math.round(compound.amount),
          category: compound.category,
          payment_methods: normalizeLedgerAccounts(compound.payment_methods, compound.category),
          staff_name: compound.staff_name,
          client_name: compound.client_name,
          client_phone: compound.client_phone,
          is_vip: compound.is_vip,
        })
        .eq('id', row.id);
      continue;
    }
    const npm = normalizeLedgerAccounts(row.payment_methods ?? [], row.category as TransactionCategory);
    if (JSON.stringify(npm) !== JSON.stringify(row.payment_methods ?? [])) {
      await sb.from('daily_transactions').update({ payment_methods: npm }).eq('id', row.id);
      accountUpdates++;
    }
  }
  rows = await fetchAll();
  console.log('3 after norm accounts+compound', sumLedgerAccountBalances(rows), 'n', rows.length, 'acct', accountUpdates);
}

main().catch(console.error);
