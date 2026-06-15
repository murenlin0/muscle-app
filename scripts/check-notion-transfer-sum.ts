import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const BANK = new Set(['富邦', 'Line', '街口', '仁中信', '轉帳', 'line']);

async function main() {
  loadEnv();
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const scoped = notion.filter((r) => (r.dateStart?.slice(0, 10) ?? '') >= '2024-03-16');
  const transfers = scoped.filter((r) => r.serviceType?.trim() === '轉移');

  let cash = 0;
  let bank = 0;
  for (const r of transfers) {
    const pm = r.paymentMethods ?? [];
    if (pm.includes('現金')) cash += r.amount;
    if (pm.some((p) => BANK.has(p) || BANK.has(p.toLowerCase()))) bank += r.amount;
  }
  console.log('Notion 轉移列', transfers.length);
  console.log('轉移對現金加總', cash);
  console.log('轉移對富邦加總', bank);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
