import { readFileSync } from 'fs';
import { resolve } from 'path';
import { listDailyTransactions } from '../lib/reports-server';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const r = await listDailyTransactions('2024-03-01', '2026-06-04', 'store1');
  console.log('totalRows', r.totalRows);
  const mar = r.rows.filter((x) => x.occurredOn.startsWith('2024-03'));
  console.log('mar2024 count', mar.length);
  for (const row of mar) {
    console.log(' ', row.occurredOn, row.title);
  }
  const oldest = r.rows[r.rows.length - 1];
  console.log('oldest row', oldest?.occurredOn, oldest?.title);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
