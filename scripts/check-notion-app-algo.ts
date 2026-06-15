import { readFileSync } from 'fs';
import { resolve } from 'path';
import { mapNotionRowToTransaction } from '../lib/notion-daily-import';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { primaryLedgerAccount } from '../lib/ledger-accounts';
import { normalizeLedgerAmount } from '../lib/ledger-amount';
import type { TransactionCategory } from '../lib/transaction-category';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const scoped = notion.filter((r) => (r.dateStart?.slice(0, 10) ?? '') >= '2024-03-16');

  let cashRaw = 0;
  let bankRaw = 0;
  const BANK = new Set(['富邦', 'Line', '街口', '仁中信', '轉帳', 'line']);

  let cashApp = 0;
  let bankApp = 0;
  let transferRows = 0;

  for (const r of scoped) {
    const pm = r.paymentMethods ?? [];
    if (pm.includes('現金')) cashRaw += r.amount;
    if (pm.some((p) => BANK.has(p) || BANK.has(p.toLowerCase()))) bankRaw += r.amount;

    const tx = mapNotionRowToTransaction(r, 'store1');
    if (tx.category === '轉移') transferRows++;
    const cat = tx.category as TransactionCategory;
    const acc = primaryLedgerAccount(tx.payment_methods, cat);
    const n = normalizeLedgerAmount(cat, tx.amount);
    if (acc === '現金') cashApp += n;
    if (acc === '富邦') bankApp += n;
  }

  console.log('Notion 列數', scoped.length);
  console.log('raw加總  現金', cashRaw, '富邦', bankRaw);
  console.log('app算法(不拆分) 現金', cashApp, '富邦', bankApp, '轉移列', transferRows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
