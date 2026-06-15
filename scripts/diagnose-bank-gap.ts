import { readFileSync } from 'fs';
import { resolve } from 'path';
import { mapNotionRowToTransaction } from '../lib/notion-daily-import';
import { isMultiStaffCompoundTitle, splitMultiStaffTransaction } from '../lib/multi-staff-split';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const BANK = new Set(['富邦', 'Line', '街口', '仁中信', '轉帳', 'line']);

function bankRaw(amount: number, pm: string[]) {
  return pm.some((p) => BANK.has(p) || BANK.has(p.toLowerCase())) ? amount : 0;
}

async function main() {
  loadEnv();
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const scoped = notion.filter((r) => (r.dateStart?.slice(0, 10) ?? '') >= '2024-03-16');

  let notionBank = 0;
  for (const r of scoped) notionBank += bankRaw(r.amount, r.paymentMethods ?? []);

  let expandBank = 0;
  let expandExtra = 0;
  const extraSamples: string[] = [];

  for (const r of scoped) {
    const tx = mapNotionRowToTransaction(r, 'store1');
    const notionB = bankRaw(r.amount, r.paymentMethods ?? []);

    if (isMultiStaffCompoundTitle(tx.title)) {
      const split = splitMultiStaffTransaction(tx);
      if (split) {
        let splitB = 0;
        for (const s of split) {
          splitB += bankRaw(
            s.amount,
            s.payment_methods?.length ? s.payment_methods : ['富邦'],
          );
        }
        expandExtra += splitB - notionB;
        if (Math.abs(splitB - notionB) > 0.5 && extraSamples.length < 10) {
          extraSamples.push(
            `${r.dateStart?.slice(0, 10)} notionB${notionB} splitB${splitB} $${r.amount} [${(r.paymentMethods ?? []).join(',')}] ${r.title.slice(0, 40)}`,
          );
        }
        expandBank += splitB;
        continue;
      }
    }
    expandBank += notionB;
  }

  console.log('Notion bank', notionBank);
  console.log('If all compounds expanded', expandBank);
  console.log('Extra from compound expand', expandExtra);
  for (const s of extraSamples) console.log(' ', s);
}

main().catch(console.error);
