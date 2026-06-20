/**
 * 陳宥唯 0910678327 → 併入陳宥奇 0928294900
 * - 刪 2024-03-01 期初儲值（Notion 封存 + DB）
 * - 2026-03-21 改記陳宥奇（DB + Notion + Calendar）
 * - 重算陳宥奇餘額標題
 * - 確認無陳宥唯後刪 clients
 *
 * npx tsx scripts/merge-chen-youwei-to-youqi.ts           # dry-run
 * npx tsx scripts/merge-chen-youwei-to-youqi.ts --apply
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  archiveNotionPage,
  buildNotionTitleUpdate,
  readNotionTokenFromEnv,
  updateNotionPageProperties,
} from '@/lib/notion-api';
import { patchCalendarEventSummary } from '@/lib/google-calendar';
import {
  memberRowSignedAmount,
  parseBalanceAfter顿号,
  clientMemberBalance,
} from '@/lib/ledger-title-balance';
import { stripAllSpaces } from '@/lib/phone';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const STORE = 'store1' as const;
const OLD_PHONE = '0910678327';
const OLD_NAME = '陳宥唯';
const NEW_PHONE = '0928294900';
const NEW_NAME = '陳宥奇';
const MAR21_CALENDAR_ID = 'pd81vtu0tp2519mkot98sg4qvs';

const OPENING_ROW_ID = 'e8e6cd32-65d3-4153-b852-f352c5e451f9';
const OPENING_NOTION_PAGE = '37e07d21-c964-8102-8b4c-d78bfd41f5e6';
const MAR21_ROW_ID = '5120e55d-a24d-48a7-81b7-c57dadc600de';
const MAR21_NOTION_PAGE = '32c07d21-c964-80ae-b930-efcdd971effa';

const CATEGORY_ORDER: Record<string, number> = {
  會員儲值: 0,
  會員補差額: 1,
  會員使用: 2,
};

type Row = {
  id: string;
  occurred_on: string;
  title: string;
  amount: number;
  category: string;
  client_phone: string | null;
  client_name: string | null;
  notion_page_id?: string | null;
};

function sortRows(a: Row, b: Row) {
  if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? -1 : 1;
  const ca = CATEGORY_ORDER[a.category] ?? 9;
  const cb = CATEGORY_ORDER[b.category] ?? 9;
  if (ca !== cb) return ca - cb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function vipSuffix(name: string, phone: string) {
  return `VIP${name}${phone}`;
}

function expectedTitle(row: Row, balanceAfter: number): string | null {
  const vip = vipSuffix(NEW_NAME, NEW_PHONE);
  const t = stripAllSpaces(row.title);

  if (row.category === '會員儲值') {
    if (t.startsWith('+') || /\+\d+/.test(t)) {
      return `+${row.amount}、${balanceAfter}${vip}`;
    }
    // 合寫儲值列
    const head = t.match(/^(.+?\d+分)/)?.[1];
    if (head && /現金儲值|儲值/.test(t)) {
      return t.replace(/、\d+VIP/i, `、${balanceAfter}VIP`).replace(/VIP.+$/i, vip);
    }
    return `+${row.amount}、${balanceAfter}${vip}`;
  }

  if (row.category === '會員使用') {
    const head = t.match(/^(.+?\d+分)/)?.[1] ?? t.match(/^(.+?)(?=-\d)/)?.[1] ?? '';
    if (head) return `${head}-${row.amount}、${balanceAfter}${vip}`;
    return `${t.split('-')[0]}-${row.amount}、${balanceAfter}${vip}`;
  }

  return null;
}

async function loadYouqiRows(sb: ReturnType<typeof getSupabaseAdmin>): Promise<Row[]> {
  const { data, error } = await sb
    .from('daily_transactions')
    .select('id, occurred_on, title, amount, category, client_phone, client_name, notion_page_id')
    .eq('store_id', STORE)
    .in('category', ['會員儲值', '會員使用', '會員補差額'])
    .or(`client_phone.eq.${NEW_PHONE},title.ilike.%${NEW_PHONE}%`)
    .order('occurred_on')
    .order('id');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  rows.sort(sortRows);
  return rows;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const sb = getSupabaseAdmin();

  console.log(apply ? '=== 執行 ===' : '=== dry-run ===\n');

  // 1. 刪 2024-03-01
  console.log('1. 刪除 2024-03-01 陳宥唯期初儲值');
  console.log(`   DB id=${OPENING_ROW_ID}`);
  console.log(`   Notion page=${OPENING_NOTION_PAGE}`);

  // 2. 2026-03-21 改陳宥奇
  const mar21NewTitle = `湘90分-1500、1500${vipSuffix(NEW_NAME, NEW_PHONE)}`;
  console.log('\n2. 2026-03-21 改記陳宥奇');
  console.log(`   舊: 湘90分-1500、1500VIP陳宥唯0910678327`);
  console.log(`   新: ${mar21NewTitle}`);
  console.log(`   Calendar: ${MAR21_CALENDAR_ID}`);

  if (apply) {
    const { error: delErr } = await sb.from('daily_transactions').delete().eq('id', OPENING_ROW_ID);
    if (delErr) throw new Error(delErr.message);
    if (readNotionTokenFromEnv()) {
      await archiveNotionPage(OPENING_NOTION_PAGE);
      console.log('   ✓ Notion 期初列已封存');
    } else {
      console.log('   ⚠ 略過 Notion（未設定 NOTION_API_KEY）');
    }

    const { error: upErr } = await sb
      .from('daily_transactions')
      .update({
        title: mar21NewTitle,
        client_name: NEW_NAME,
        client_phone: NEW_PHONE,
      })
      .eq('id', MAR21_ROW_ID);
    if (upErr) throw new Error(upErr.message);

    await patchCalendarEventSummary(MAR21_CALENDAR_ID, mar21NewTitle);

    if (readNotionTokenFromEnv()) {
      await updateNotionPageProperties(MAR21_NOTION_PAGE, buildNotionTitleUpdate(mar21NewTitle));
      console.log('   ✓ DB + Notion + Calendar 已更新');
    } else {
      console.log('   ✓ DB + Calendar 已更新（Notion 待補）');
    }
  }

  // 3. 重算陳宥奇餘額標題
  console.log('\n3. 重算陳宥奇餘額標題');
  const rows = await loadYouqiRows(sb);
  let running = 0;
  const titleFixes: { id: string; old: string; neu: string; notionPageId?: string | null }[] = [];

  for (const row of rows) {
    const delta = memberRowSignedAmount(row.category, row.amount);
    running += delta;
    const tb = parseBalanceAfter顿号(stripAllSpaces(row.title));
    if (tb !== null && tb !== running) {
      const neu = expectedTitle(row, running);
      if (neu && stripAllSpaces(neu) !== stripAllSpaces(row.title)) {
        titleFixes.push({ id: row.id, old: row.title, neu, notionPageId: row.notion_page_id });
      }
    }
  }

  if (!titleFixes.length) {
    console.log('   標題餘額全部一致');
  } else {
    for (const f of titleFixes) {
      console.log(`   ${f.id.slice(0, 8)}…`);
      console.log(`     舊: ${f.old}`);
      console.log(`     新: ${f.neu}`);
      if (apply) {
        const { error } = await sb.from('daily_transactions').update({ title: f.neu }).eq('id', f.id);
        if (error) throw new Error(error.message);
      }
    }
    if (apply) console.log(`   ✓ 已修正 ${titleFixes.length} 筆標題`);
  }

  const balance = clientMemberBalance(
    (await loadYouqiRows(sb)).map((r) => ({
      ...r,
      client_phone: NEW_PHONE,
    })),
    NEW_PHONE,
  );
  console.log(`\n   陳宥奇累計餘額: ${balance}`);

  // 4. 確認報表無陳宥唯
  console.log('\n4. 檢查是否還有陳宥唯 / 0910678327');
  const { data: remain } = await sb
    .from('daily_transactions')
    .select('id, occurred_on, title')
    .eq('store_id', STORE)
    .or(`client_phone.eq.${OLD_PHONE},title.ilike.%${OLD_PHONE}%,title.ilike.%${OLD_NAME}%`);

  if (remain?.length) {
    console.log(`   ⚠ 仍有 ${remain.length} 筆:`);
    for (const r of remain) console.log(`     ${r.occurred_on} ${r.title}`);
  } else {
    console.log('   ✓ 報表流水無陳宥唯');
  }

  // 5. 刪 clients
  const { data: oldClients } = await sb
    .from('clients')
    .select('id, name, phone')
    .or(`phone.eq.${OLD_PHONE},name.ilike.%${OLD_NAME}%`);

  if (!oldClients?.length) {
    console.log('\n5. clients 表無陳宥唯紀錄，無需刪除');
  } else {
    console.log(`\n5. 刪除 clients ${oldClients.length} 筆:`);
    for (const c of oldClients) {
      console.log(`   ${c.name} ${c.phone} id=${c.id}`);
      if (apply) {
        const { error } = await sb.from('clients').delete().eq('id', c.id);
        if (error) console.log(`   ⚠ 刪除失敗: ${error.message}`);
        else console.log('   ✓ 已刪除');
      }
    }
  }

  // calendar 再搜一次
  if (apply) {
    console.log('\n6. 更新 2026-06-13 calendar backfill 若有需要…');
    const { data: jun13 } = await sb
      .from('daily_transactions')
      .select('id, title, member_note')
      .eq('store_id', STORE)
      .eq('occurred_on', '2026-06-13')
      .eq('client_phone', NEW_PHONE);
    for (const r of jun13 ?? []) {
      const note = r.member_note as string | null;
      if (!note?.startsWith('gcal:')) continue;
      const eventId = note.split(':')[1];
      if (!eventId) continue;
      console.log(`   patch calendar ${eventId}: ${r.title}`);
      await patchCalendarEventSummary(eventId, r.title);
    }
  }

  console.log('\n完成');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
