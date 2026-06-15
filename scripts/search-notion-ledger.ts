import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '@/lib/notion-api';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const terms = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ['et', '商家', '地圖', 'map', 'google', '廣告', '推廣', 'gmb', 'ads', '關鍵字'];

  const rows = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const lower = (s: string) => s.toLowerCase();

  const hits = rows.filter((r) =>
    terms.some(
      (t) =>
        lower(r.title ?? '').includes(lower(t)) ||
        lower(r.serviceType ?? '').includes(lower(t)),
    ),
  );

  console.log(`Notion total: ${rows.length}, matches: ${hits.length}\n`);
  for (const r of hits.sort((a, b) =>
    (a.dateStart ?? '').localeCompare(b.dateStart ?? ''),
  )) {
    console.log(
      `${(r.dateStart ?? '').slice(0, 10)} | $${r.amount} | ${r.serviceType ?? '—'} | ${r.paymentMethods.join('、')} | ${r.title}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
