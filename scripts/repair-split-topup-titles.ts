/**
 * 修正日曆拆帳儲值列標題：+4000、4100（不含「儲值」前綴，頓號為累計餘額）
 * npx tsx scripts/repair-split-topup-titles.ts [--dry-run]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { memberRowSignedAmount } from '@/lib/ledger-title-balance';
import { getSupabaseAdmin } from '@/lib/supabase';

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // ok
  }
}

type Row = {
  id: string;
  occurred_on: string;
  title: string;
  amount: number;
  category: string;
  client_phone: string | null;
  client_name: string | null;
  member_note: string | null;
  source: string | null;
};

const CATEGORY_ORDER: Record<string, number> = {
  會員儲值: 0,
  會員補差額: 1,
  會員使用: 2,
};

function sortRows(a: Row, b: Row) {
  if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? -1 : 1;
  const ca = CATEGORY_ORDER[a.category] ?? 9;
  const cb = CATEGORY_ORDER[b.category] ?? 9;
  if (ca !== cb) return ca - cb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function vipSuffix(row: Row): string {
  if (row.client_name && row.client_phone) {
    return `VIP${row.client_name}${row.client_phone}`;
  }
  const m = row.title.match(/VIP.+$/i);
  return m?.[0] ?? '';
}

function isSplitTopupRow(row: Row): boolean {
  if (row.category !== '會員儲值') return false;
  if (row.member_note?.endsWith(':topup')) return true;
  if (row.source === 'calendar_backfill' || row.source === 'calendar_sync') {
    return /儲值\+\d+/.test(row.title.replace(/\s/g, ''));
  }
  return false;
}

function expectedTopupTitle(row: Row, balanceAfter: number): string {
  const vip = vipSuffix(row);
  return `+${row.amount}、${balanceAfter}${vip}`;
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const supabase = getSupabaseAdmin();

  const all: Row[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('daily_transactions')
      .select(
        'id, occurred_on, title, amount, category, client_phone, client_name, member_note, source',
      )
      .eq('store_id', 'store1')
      .in('category', ['會員儲值', '會員使用', '會員補差額'])
      .order('occurred_on', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as Row[]));
    if (!data?.length || data.length < 1000) break;
    offset += 1000;
  }
  all.sort(sortRows);

  const runningByPhone = new Map<string, number>();
  const updates: { id: string; old: string; neu: string; phone: string }[] = [];

  for (const row of all) {
    const phone = row.client_phone;
    if (!phone) continue;

    const prior = runningByPhone.get(phone) ?? 0;
    const delta = memberRowSignedAmount(row.category, row.amount);
    const after = prior + delta;

    if (isSplitTopupRow(row)) {
      const neu = expectedTopupTitle(row, after);
      const oldNorm = row.title.replace(/\s/g, '');
      const neuNorm = neu.replace(/\s/g, '');
      if (oldNorm !== neuNorm) {
        updates.push({ id: row.id, old: row.title, neu, phone });
      }
    }

    runningByPhone.set(phone, after);
  }

  if (!updates.length) {
    console.log('✓ 無需修正的拆帳儲值列');
    return;
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}將修正 ${updates.length} 筆儲值列標題：\n`);
  for (const u of updates) {
    console.log(`${u.phone}`);
    console.log(`  舊: ${u.old}`);
    console.log(`  新: ${u.neu}\n`);
  }

  if (dryRun) return;

  for (const u of updates) {
    const { error } = await supabase
      .from('daily_transactions')
      .update({ title: u.neu })
      .eq('id', u.id);
    if (error) throw new Error(error.message);
  }
  console.log(`✓ 已更新 ${updates.length} 筆`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
