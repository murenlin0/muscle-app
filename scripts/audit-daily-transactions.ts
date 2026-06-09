/**
 * 稽核 daily_transactions 資料問題
 * npx tsx scripts/audit-daily-transactions.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const supabase = createClient(url, key);

interface Row {
  id: string;
  occurred_on: string;
  title: string;
  amount: number;
  category: string;
  payment_methods: string[];
}

async function fetchAllRows(): Promise<Row[]> {
  const pageSize = 1000;
  const all: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, payment_methods')
      .eq('store_id', 'store1')
      .order('occurred_on', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as Row[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  const rows = await fetchAllRows();
  console.log(`Total rows: ${rows.length}\n`);

  const nets = new Map<string, number>();
  for (const r of rows) {
    for (const m of r.payment_methods ?? []) {
      nets.set(m, (nets.get(m) ?? 0) + r.amount);
    }
  }
  console.log('Net by payment method (raw amount sum):');
  for (const [k, v] of [...nets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${k}: ${v.toLocaleString('zh-TW')}`);
  }
  console.log('');

  const byCategory = new Map<string, number>();
  for (const r of rows) {
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  }
  console.log('By category:', Object.fromEntries(byCategory));

  const legacyPayments = new Set<string>();
  for (const r of rows) {
    for (const p of r.payment_methods ?? []) {
      if (p !== '現金' && p !== '富邦' && p !== '') legacyPayments.add(p);
    }
  }
  console.log('\nLegacy payment methods:', [...legacyPayments]);

  const issues: string[] = [];

  for (const r of rows) {
    const pm = r.payment_methods ?? [];
    if (r.category === '會員使用' && pm.length > 0) {
      issues.push(`會員使用有帳戶: ${r.occurred_on} ${r.title.slice(0, 30)} [${pm.join(',')}]`);
    }
    if ((r.category === '支出' || r.category === '分紅') && r.amount > 0) {
      issues.push(`支出/分紅為正: ${r.occurred_on} ${r.category} ${r.amount} ${r.title.slice(0, 40)}`);
    }
    if (r.category === '轉移') {
      issues.push(`仍為轉移: ${r.occurred_on} ${r.amount} ${r.title.slice(0, 40)} [${pm.join(',')}]`);
    }
    if (pm.length > 1) {
      issues.push(`多個帳戶: ${r.occurred_on} ${r.title.slice(0, 30)} [${pm.join(',')}]`);
    }
  }

  console.log(`\nIssues found: ${issues.length}`);
  for (const i of issues.slice(0, 50)) console.log(' -', i);
  if (issues.length > 50) console.log(` ... and ${issues.length - 50} more`);

  // P&L simulation (current logic)
  let serviceIncome = 0;
  let subleaseIncome = 0;
  let expense = 0;
  for (const r of rows) {
    const amt = r.amount;
    if (r.category === '收入') subleaseIncome += amt;
    else if (['一般消費', '會員使用', '會員補差額', '會員儲值'].includes(r.category))
      serviceIncome += amt;
    else if (r.category === '支出' || r.category === '工資') expense += amt;
  }
  console.log('\nCurrent P&L logic (all time):');
  console.log('  serviceIncome:', serviceIncome);
  console.log('  subleaseIncome:', subleaseIncome);
  console.log('  expense (支出+工資):', expense);
  console.log('  netProfit:', serviceIncome + subleaseIncome - expense);

  // Fixed P&L (no 會員使用, abs expenses, include 分紅)
  let serviceFixed = 0;
  let subleaseFixed = 0;
  let expenseFixed = 0;
  for (const r of rows) {
    const amt = r.amount;
    if (r.category === '收入') subleaseFixed += amt;
    else if (['一般消費', '會員補差額', '會員儲值'].includes(r.category)) serviceFixed += amt;
    else if (['支出', '工資', '分紅'].includes(r.category)) expenseFixed += Math.abs(amt);
  }
  console.log('\nFixed P&L logic (no 會員使用, abs expense):');
  console.log('  serviceIncome:', serviceFixed);
  console.log('  subleaseIncome:', subleaseFixed);
  console.log('  expense:', expenseFixed);
  console.log('  netProfit:', serviceFixed + subleaseFixed - expenseFixed);

  const transfers = rows.filter((r) => r.category === '轉移');
  console.log(`\n轉移 rows sample (${transfers.length} total):`);
  for (const t of transfers.slice(0, 10)) {
    console.log(`  ${t.occurred_on} ${t.amount} "${t.title}" [${(t.payment_methods ?? []).join(',')}]`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
