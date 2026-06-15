import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getFinancialOverview } from '../lib/financial-summary-server';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const ov = await getFinancialOverview('2024-03-01', '2026-06-11', 'store1');
  console.log('餘額未使用:', ov.assets.unusedMemberBalance);
}

main().catch(console.error);
