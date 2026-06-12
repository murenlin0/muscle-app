/**
 * 修正 DB 合寫標題與列屬性不符
 * npx tsx scripts/fix-title-mismatch-db.ts [--dry-run]
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
  const dryRun = process.argv.includes('--dry-run');
  const sb = getSupabaseAdmin();

  const all: {
    id: string;
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
      .select('id, title, amount, category, payment_methods, staff_name, client_name, client_phone')
      .eq('store_id', 'store1')
      .in('category', ['會員使用', '會員儲值', '會員補差額'])
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }

  let fixed = 0;
  let skipped = 0;

  for (const row of all) {
    if (!isCompoundVipTitle(row.title) || titleMatchesRowAttributes(row)) continue;
    const newTitle = expectedTitleForSplitRow(row);
    if (!newTitle) {
      skipped += 1;
      continue;
    }

    if (!dryRun) {
      const { error } = await sb
        .from('daily_transactions')
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw new Error(error.message);
    }
    fixed += 1;
  }

  console.log(`${dryRun ? '將修正' : '已修正'} ${fixed} 筆，略過 ${skipped} 筆`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
