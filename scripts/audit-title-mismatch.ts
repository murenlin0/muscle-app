/**
 * 稽核：合寫標題與列屬性（類型/金額/帳戶）不符
 * npx tsx scripts/audit-title-mismatch.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import {
  expectedTitleForSplitRow,
  isCompoundVipTitle,
  titleMatchesRowAttributes,
} from '../lib/ledger-title-fix';

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
    id: string;
    occurred_on: string;
    title: string;
    amount: number;
    category: string;
    payment_methods: string[];
    staff_name: string | null;
    client_name: string | null;
    client_phone: string | null;
  }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select(
        'id, occurred_on, title, amount, category, payment_methods, staff_name, client_name, client_phone',
      )
      .eq('store_id', 'store1')
      .in('category', ['會員使用', '會員儲值'])
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }

  const mismatches = all.filter(
    (r) => isCompoundVipTitle(r.title) && !titleMatchesRowAttributes(r),
  );

  console.log(`會員列 ${all.length}，合寫標題不符屬性 ${mismatches.length} 筆\n`);
  for (const r of mismatches.slice(0, 20)) {
    const exp = expectedTitleForSplitRow(r);
    console.log(`${r.occurred_on} ${r.category} $${r.amount} [${(r.payment_methods ?? []).join(',')}]`);
    console.log(`  現: ${r.title.slice(0, 70)}`);
    console.log(`  應: ${exp?.slice(0, 70) ?? '(無)'}\n`);
  }
  if (mismatches.length > 20) console.log(`…另有 ${mismatches.length - 20} 筆`);
}

main().catch(console.error);
