import { readFileSync } from 'fs';
import { resolve } from 'path';
import { mapNotionRowToTransaction } from '../lib/notion-daily-import';
import { sumLedgerAccountBalances } from '../lib/ledger-balances';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { normalizeCompoundTopupRow } from '../lib/multi-staff-split';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const BANK = new Set(['富邦', 'Line', '街口', '仁中信', '轉帳', 'line']);

function notionRawBank(amount: number, pm: string[]) {
  return pm.some((p) => BANK.has(p) || BANK.has(p.toLowerCase())) ? amount : 0;
}

async function main() {
  loadEnv();
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const scoped = notion.filter((r) => (r.dateStart?.slice(0, 10) ?? '') >= '2024-03-16');

  let rawBank = 0;
  const rows = [];
  for (const r of scoped) {
    rawBank += notionRawBank(r.amount, r.paymentMethods ?? []);
    let tx = mapNotionRowToTransaction(r, 'store1');
    const compound = normalizeCompoundTopupRow(tx);
    if (compound) {
      tx = {
        ...tx,
        title: compound.title,
        amount: compound.amount,
        category: compound.category,
        payment_methods: compound.payment_methods,
      };
    }
    rows.push(tx);
  }
  const app = sumLedgerAccountBalances(rows);
  console.log('notion raw bank', rawBank);
  console.log('import logic bank', app.bankAccounts);
  console.log('gap', app.bankAccounts - rawBank);

  const diffs: { d: number; line: string }[] = [];
  for (const r of scoped) {
    const raw = notionRawBank(r.amount, r.paymentMethods ?? []);
    let tx = mapNotionRowToTransaction(r, 'store1');
    const compound = normalizeCompoundTopupRow(tx);
    if (compound) {
      tx = { ...tx, ...compound, category: compound.category };
    }
    const appB = sumLedgerAccountBalances([tx]).bankAccounts;
    const d = appB - raw;
    if (Math.abs(d) > 0.5) {
      diffs.push({
        d,
        line: `${r.dateStart?.slice(0, 10)} raw${raw} app${appB} $${r.amount} [${(r.paymentMethods ?? []).join(',')}] ${r.title.slice(0, 45)}`,
      });
    }
  }
  diffs.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  console.log('top diffs sum', diffs.reduce((s, x) => s + x.d, 0));
  for (const x of diffs.slice(0, 15)) console.log(x.d, x.line);
}

main().catch(console.error);
