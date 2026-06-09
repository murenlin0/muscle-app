/**
 * npx tsx scripts/run-ledger-migrate.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { migrateLedgerData } from '@/lib/ledger-migrate-server';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

loadEnv();

migrateLedgerData('store1')
  .then((report) => console.log(JSON.stringify(report, null, 2)))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
