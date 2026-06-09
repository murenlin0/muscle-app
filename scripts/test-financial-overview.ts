/**
 * npx tsx scripts/test-financial-overview.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getFinancialOverview } from '@/lib/financial-summary-server';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

loadEnv();

const to = '2026-06-04';
const from = '2026-01-01';

getFinancialOverview(from, to, 'store1').then((o) => {
  console.log('Period:', from, 'to', to);
  console.log('Assets:', o.assets);
  console.log('Income:', o.incomeStatement);
  console.log('Net check:', o.incomeStatement.totalIncome, '-', o.incomeStatement.totalExpense, '=', o.incomeStatement.netProfit);
});
