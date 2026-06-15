/**
 * 模擬僅匯入（expandRows）不跑 migrate 的餘額
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { mapNotionRowToTransaction } from '../lib/notion-daily-import';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { primaryLedgerAccount } from '../lib/ledger-accounts';
import { normalizeLedgerAmount } from '../lib/ledger-amount';
import { isMultiStaffCompoundTitle, splitMultiStaffTransaction } from '../lib/multi-staff-split';
import { splitLegacyTransferRow } from '../lib/transfer-split';
import { LEGACY_TRANSFER_CATEGORY, type TransactionCategory } from '../lib/transaction-category';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

type Row = ReturnType<typeof mapNotionRowToTransaction>;

function expand(rows: Row[]): Row[] {
  const out: Row[] = [];
  for (const row of rows) {
    if (isMultiStaffCompoundTitle(row.title)) {
      const split = splitMultiStaffTransaction(row);
      if (split) {
        for (const s of split) {
          out.push({
            ...row,
            title: s.title,
            amount: normalizeLedgerAmount(s.category, s.amount),
            category: s.category,
            payment_methods: s.payment_methods,
            staff_name: s.staff_name,
            client_name: s.client_name,
            client_phone: s.client_phone,
            is_vip: s.is_vip,
          });
        }
        continue;
      }
    }
    if (row.category === LEGACY_TRANSFER_CATEGORY) {
      const split = splitLegacyTransferRow(row);
      if (split) {
        for (const s of split.rows) {
          out.push({
            ...row,
            ...s,
            category: s.category as TransactionCategory,
            amount: normalizeLedgerAmount(s.category as TransactionCategory, s.amount),
          });
        }
        continue;
      }
    }
    out.push(row);
  }
  return out;
}

function sum(rows: Row[]) {
  let cash = 0;
  let bank = 0;
  let legacy = 0;
  for (const r of rows) {
    if (r.category === LEGACY_TRANSFER_CATEGORY) legacy++;
    const cat = r.category as TransactionCategory;
    const acc = primaryLedgerAccount(r.payment_methods, cat);
    const n = normalizeLedgerAmount(cat, r.amount);
    if (acc === '現金') cash += n;
    if (acc === '富邦') bank += n;
  }
  return { cash, bank, legacy, rows: rows.length };
}

async function main() {
  loadEnv();
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const scoped = notion.filter((r) => (r.dateStart?.slice(0, 10) ?? '') >= '2024-03-16');
  const mapped = scoped.map((r) => mapNotionRowToTransaction(r, 'store1'));
  const expanded = expand(mapped);
  const s = sum(expanded);
  console.log('僅匯入+expand（不 migrate）');
  console.log(`列數 ${s.rows}  未拆轉移 ${s.legacy}`);
  console.log(`現金 ${s.cash}  富邦 ${s.bank}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
