/**
 * 謝明潔 2026-05-30：雙打各 -1500（修正合併 -3000），報表+日曆
 * npx tsx scripts/fix-xie-mingjie-may30.ts [--apply]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '@/lib/supabase';
import { patchCalendarEventSummary } from '@/lib/google-calendar';
import { getGoogleCalendarId, getGoogleRefreshToken } from '@/lib/integration-settings';
import { refreshGoogleAccessToken } from '@/lib/google-oauth';
import { STORE_TIMEZONE } from '@/lib/store-timezone';
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

const TOPUP_ROW_ID = '8ece885f-d6a6-425f-9445-bcd79fc28bdd';
const REN_ROW_ID = 'a99e7734-659b-48e5-a984-66d73d8c9cdc';
const XIANG_ROW_ID = 'ca00f5fe-bc6b-48f3-933b-e016c408069b';

const TOPUP_TITLE = `+4000、6500${VIP}`;
const REN_TITLE = `仁90分-1500、5000${VIP}`;
const XIANG_TITLE = `湘90分-1500、3500${VIP}`;

const CAL_COMPOUND_ID = 'bbkiihgsohhpelkevbmidiu4gk';

async function fetchCalendarEvent(eventId: string) {
  const calendarId = await getGoogleCalendarId();
  const token = await refreshGoogleAccessToken((await getGoogleRefreshToken())!);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId!)}/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error('無法讀取日曆事件');
  return (await res.json()) as {
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    colorId?: string;
  };
}

async function createCalendarEvent(
  summary: string,
  start: { dateTime?: string; date?: string },
  end: { dateTime?: string; date?: string },
  colorId?: string,
) {
  const calendarId = await getGoogleCalendarId();
  const token = await refreshGoogleAccessToken((await getGoogleRefreshToken())!);
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId!)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary,
        start: { ...start, timeZone: STORE_TIMEZONE },
        end: { ...end, timeZone: STORE_TIMEZONE },
        ...(colorId ? { colorId } : {}),
      }),
    },
  );
  if (!res.ok) {
    const err = (await res.json()) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? '無法建立日曆事件');
  }
  return (await res.json()) as { id: string };
}

async function audit(sb: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await sb
    .from('daily_transactions')
    .select('occurred_on, title, amount, category, id')
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
  console.log(`累計餘額: ${clientMemberBalance(rows, PHONE)}${bad ? ` (${bad} 筆不符)` : ' ✓ 全部一致'}`);
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const sb = getSupabaseAdmin();

  console.log(apply ? '=== 執行 ===' : '=== dry-run ===');
  console.log('\n2026-05-30 修正：');
  console.log(`  儲值: ${TOPUP_TITLE}`);
  console.log(`  仁:   ${REN_TITLE}`);
  console.log(`  湘:   ${XIANG_TITLE}`);
  console.log(`\n日曆: 原合寫事件改儲值，另建仁/湘各 -1500`);

  if (apply) {
    const { error: e0 } = await sb
      .from('daily_transactions')
      .update({ title: TOPUP_TITLE })
      .eq('id', TOPUP_ROW_ID);
    if (e0) throw new Error(e0.message);

    const { error: e1 } = await sb
      .from('daily_transactions')
      .update({ title: REN_TITLE, amount: 1500, staff_name: '仁' })
      .eq('id', REN_ROW_ID);
    if (e1) throw new Error(e1.message);

    const { error: e2 } = await sb
      .from('daily_transactions')
      .update({ title: XIANG_TITLE, amount: 1500, staff_name: '湘湘' })
      .eq('id', XIANG_ROW_ID);
    if (e2) throw new Error(e2.message);

    const ev = await fetchCalendarEvent(CAL_COMPOUND_ID);
    await patchCalendarEventSummary(CAL_COMPOUND_ID, TOPUP_TITLE);

    const ren = await createCalendarEvent(REN_TITLE, ev.start, ev.end, ev.colorId);
    const xiang = await createCalendarEvent(XIANG_TITLE, ev.start, ev.end, ev.colorId);
    console.log(`\n✓ DB 已更新`);
    console.log(`✓ 日曆: ${CAL_COMPOUND_ID} → 儲值`);
    console.log(`  新建 仁: ${ren.id}`);
    console.log(`  新建 湘: ${xiang.id}`);
  }

  await audit(sb);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
