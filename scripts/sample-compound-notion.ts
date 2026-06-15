import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { isMultiStaffCompoundTitle, splitMultiStaffTransaction } from '../lib/multi-staff-split';
import { mapNotionRowToTransaction } from '../lib/notion-daily-import';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const rows = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const compounds = rows.filter((r) => isMultiStaffCompoundTitle(r.title));
  console.log('compound count', compounds.length);
  for (const r of compounds.slice(0, 15)) {
    const tx = mapNotionRowToTransaction(r, 'store1');
    const split = splitMultiStaffTransaction(tx);
    const topup = split?.[0];
    console.log(
      `${r.dateStart?.slice(0, 10)} notion$${r.amount} pm=[${(r.paymentMethods ?? []).join(',')}] topup$${topup?.amount} | ${r.title.slice(0, 55)}`,
    );
  }
  let bankOver = 0;
  for (const r of compounds) {
    const tx = mapNotionRowToTransaction(r, 'store1');
    const split = splitMultiStaffTransaction(tx);
    const topup = split?.[0]?.amount ?? 0;
    const pm = r.paymentMethods ?? [];
    const hasBank = pm.some((p) => ['富邦', 'Line', '街口', '仁中信', '轉帳'].includes(p));
    if (hasBank) bankOver += topup - r.amount;
  }
  console.log('extra bank from topup split (has bank pm):', bankOver);
}

main().catch(console.error);
