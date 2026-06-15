/**
 * 列出應收帳款組成
 * npx tsx scripts/audit-accounts-receivable.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { primaryLedgerAccount } from '../lib/ledger-accounts';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const all: {
    occurred_on: string;
    amount: number;
    category: string;
    payment_methods: string[];
    title: string;
  }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('occurred_on, amount, category, payment_methods, title')
      .eq('store_id', 'store1')
      .order('occurred_on', { ascending: true })
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }

  let ar = 0;
  const byCat: Record<string, number> = {};
  const rows: { date: string; cat: string; amt: number; pm: string; title: string }[] = [];

  for (const row of all) {
    const cat = row.category;
    if (cat !== '一般消費' && cat !== '會員補差額') continue;
    if (primaryLedgerAccount(row.payment_methods ?? [], cat)) continue;
    const amt = Math.abs(row.amount ?? 0);
    ar += amt;
    byCat[cat] = (byCat[cat] ?? 0) + amt;
    rows.push({
      date: row.occurred_on,
      cat,
      amt,
      pm: (row.payment_methods ?? []).join(',') || '(空)',
      title: row.title,
    });
  }

  console.log(`應收帳款合計 $${ar.toLocaleString()}（${rows.length} 筆）\n`);
  for (const [cat, sum] of Object.entries(byCat)) {
    console.log(`  ${cat}: $${sum.toLocaleString()}`);
  }
  console.log('\n明細：');
  for (const r of rows) {
    console.log(`${r.date} ${r.cat} $${r.amt} [${r.pm}] ${r.title.slice(0, 70)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
