/**
 * 謝明潔 2026-06-13：兩筆各 -1500（修正合併錯誤的 -3000 與 -0）
 * npx tsx scripts/fix-xie-mingjie-jun13.ts [--apply]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '@/lib/supabase';
import { patchCalendarEventSummary } from '@/lib/google-calendar';
import {
  clientMemberBalance,
  memberRowSignedAmount,
  parseBalanceAfter顿号,
} from '@/lib/ledger-title-balance';
import { stripAllSpaces } from '@/lib/phone';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const PHONE = '0922013860';
const NAME = '謝明潔';
const VIP = `VIP${NAME}${PHONE}`;
const DATE = '2026-06-13';

const REN_ROW_ID = '008883fb-5b11-4190-892a-01d77a822e2f';
const XIANG_ROW_ID = '31b5d5e2-737b-4e7e-a733-0501b50f8887';
const REN_CAL_ID = 'lc1vnpdro18t91t9snftpsaoqg';
const XIANG_CAL_ID = 'fodr5cjgdcch914sc5inhbt19g';

const REN_TITLE = `仁90分-1500、2000${VIP}`;
const XIANG_TITLE = `湘90分-1500、500${VIP}`;

async function auditPhone(sb: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await sb
    .from('daily_transactions')
    .select('id, occurred_on, title, amount, category, client_phone')
    .eq('store_id', 'store1')
    .or(`client_phone.eq.${PHONE},title.ilike.%${PHONE}%`)
    .in('category', ['會員儲值', '會員使用', '會員補差額'])
    .order('occurred_on')
    .order('id');

  const ORDER: Record<string, number> = { 會員儲值: 0, 會員補差額: 1, 會員使用: 2 };
  const rows = [...(data ?? [])].sort((a, b) => {
    if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? -1 : 1;
    return (ORDER[a.category] ?? 9) - (ORDER[b.category] ?? 9) || (a.id < b.id ? -1 : 1);
  });

  let running = 0;
  let bad = 0;
  console.log('\n--- 對帳 ---');
  for (const r of rows) {
    running += memberRowSignedAmount(r.category, r.amount);
    const tb = parseBalanceAfter顿号(stripAllSpaces(r.title));
    const ok = tb === null || tb === running;
    if (!ok) bad++;
    console.log(
      `${r.occurred_on} [${r.category}] $${r.amount} → ${running}` +
        (tb !== null ? ` 頓號=${tb}${ok ? ' ✓' : ' ✗'}` : ''),
    );
    console.log(`  ${r.title}`);
  }
  console.log(`累計: ${clientMemberBalance(rows, PHONE)}${bad ? ` (${bad} 筆不符)` : ' ✓'}`);
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const sb = getSupabaseAdmin();

  console.log(apply ? '=== 執行 ===' : '=== dry-run ===');
  console.log(`\n2026-06-13 謝明潔 改為兩筆各 -1500：`);
  console.log(`  仁: ${REN_TITLE}`);
  console.log(`  湘: ${XIANG_TITLE}`);

  if (apply) {
    const { error: e1 } = await sb
      .from('daily_transactions')
      .update({ title: REN_TITLE, amount: 1500, category: '會員使用' })
      .eq('id', REN_ROW_ID);
    if (e1) throw new Error(e1.message);

    const { error: e2 } = await sb
      .from('daily_transactions')
      .update({ title: XIANG_TITLE, amount: 1500, category: '會員使用' })
      .eq('id', XIANG_ROW_ID);
    if (e2) throw new Error(e2.message);

    await patchCalendarEventSummary(REN_CAL_ID, REN_TITLE);
    await patchCalendarEventSummary(XIANG_CAL_ID, XIANG_TITLE);
    console.log('\n✓ DB + Calendar 已更新');
  }

  await auditPhone(sb);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
