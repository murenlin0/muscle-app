/**
 * 批次修正：蕭鼎亞 5/9 補列、蔡聰榮電話、問題會員餘額對帳
 * npx tsx scripts/fix-batch-clients-reconcile.ts [--apply]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  createNotionDailyPage,
  readNotionTokenFromEnv,
  buildNotionTitleUpdate,
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

type Row = {
  id: string;
  occurred_on: string;
  title: string;
  amount: number;
  category: string;
  staff_name: string | null;
  client_name: string | null;
  client_phone: string | null;
  notion_page_id?: string | null;
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

function staffPrefix(staffName: string | null): string {
  if (!staffName) return '仁';
  if (staffName === '湘湘') return '湘';
  return staffName;
}

function durationForAmount(amount: number): string {
  if (amount >= 1900) return '120分';
  if (amount >= 1500) return '90分';
  return '60分';
}

function extractUsageHead(title: string, staffName: string | null, amount: number): string {
  const t = stripAllSpaces(title);
  const m = t.match(/^(.+?\d+分)/);
  if (m) {
    const head = m[1];
    if (!/儲值|現金|富邦|\+4000|\+5000|\+6000|\+20000/.test(head)) return head;
  }
  return `${staffPrefix(staffName)}${durationForAmount(amount)}`;
}

function rebuildTitle(row: Row, balanceAfter: number, name: string, phone: string): string {
  const vip = `VIP${name}${phone}`;
  const t = stripAllSpaces(row.title);

  if (row.category === '會員儲值') {
    return `+${row.amount}、${balanceAfter}${vip}`;
  }

  if (row.category === '會員補差額') {
    const head = extractUsageHead(row.title, row.staff_name, row.amount);
    if (/活動送/.test(t)) return `${head}活動送${row.amount}、${balanceAfter}${vip}`;
    return `${head}活動送${row.amount}、${balanceAfter}${vip}`;
  }

  const head = extractUsageHead(row.title, row.staff_name, row.amount);
  return `${head}-${row.amount}、${balanceAfter}${vip}`;
}

async function loadMemberRows(
  sb: ReturnType<typeof getSupabaseAdmin>,
  phone: string,
): Promise<Row[]> {
  const { data, error } = await sb
    .from('daily_transactions')
    .select(
      'id, occurred_on, title, amount, category, staff_name, client_name, client_phone, notion_page_id',
    )
    .eq('store_id', 'store1')
    .or(`client_phone.eq.${phone},title.ilike.%${phone}%`)
    .in('category', ['會員儲值', '會員使用', '會員補差額']);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  rows.sort(sortRows);
  return rows;
}

async function reconcileClient(
  sb: ReturnType<typeof getSupabaseAdmin>,
  phone: string,
  name: string,
  apply: boolean,
): Promise<{ fixed: number; balance: number | null; bad: number }> {
  const rows = await loadMemberRows(sb, phone);
  let running = 0;
  let fixed = 0;
  let bad = 0;

  for (const row of rows) {
    running += memberRowSignedAmount(row.category, row.amount);
    const tb = parseBalanceAfter顿号(stripAllSpaces(row.title));
    const neu = rebuildTitle(row, running, name, phone);
    const needsPhoneFix = row.title.includes('09286270782');
    const needsFix =
      stripAllSpaces(neu) !== stripAllSpaces(row.title) ||
      row.client_phone !== phone ||
      needsPhoneFix;

    if (tb !== null && tb !== running) bad++;
    if (!needsFix) continue;

    console.log(`  [${row.occurred_on}] ${row.category}`);
    console.log(`    舊: ${row.title}`);
    console.log(`    新: ${neu}`);
    fixed++;

    if (apply) {
      const { error } = await sb
        .from('daily_transactions')
        .update({
          title: neu.replace(/09286270782/g, '0928627078'),
          client_phone: phone,
          client_name: name,
        })
        .eq('id', row.id);
      if (error) throw new Error(error.message);

      const pageId = row.notion_page_id?.split('#')[0];
      if (pageId && readNotionTokenFromEnv()) {
        try {
          await updateNotionPageProperties(pageId, buildNotionTitleUpdate(neu));
        } catch {
          // 合寫共用頁略過
        }
      }
    }
  }

  return { fixed, balance: clientMemberBalance(rows, phone), bad };
}

async function fixCaiPhoneGlobally(sb: ReturnType<typeof getSupabaseAdmin>, apply: boolean) {
  const { data } = await sb
    .from('daily_transactions')
    .select('id, title, client_phone')
    .eq('store_id', 'store1')
    .or('title.ilike.%09286270782%,client_phone.eq.09286270782');

  if (!data?.length) return;
  console.log(`\n蔡聰榮電話修正 ${data.length} 筆`);
  for (const r of data) {
    const neu = (r.title as string).replace(/09286270782/g, '0928627078');
    if (apply) {
      await sb
        .from('daily_transactions')
        .update({ title: neu, client_phone: '0928627078', client_name: '蔡聰榮' })
        .eq('id', r.id);
    }
    console.log(`  ${neu.slice(0, 55)}`);
  }
}

async function insertXiaoMay9(sb: ReturnType<typeof getSupabaseAdmin>, apply: boolean) {
  const phone = '0928540001';
  const name = '蕭鼎亞';
  const date = '2026-05-09';
  const amount = 1000;

  const rows = await loadMemberRows(sb, phone);
  const before = rows.filter((r) => r.occurred_on < date);
  let prior = 0;
  for (const r of before) prior += memberRowSignedAmount(r.category, r.amount);
  const after = prior - amount;
  const title = `錦60分-${amount}、${after}VIP${name}${phone}`;
  const calId = 'kdiohspetk7g7fqctgo4hjcim8';

  console.log(`\n蕭鼎亞 5/9 補列：前餘 ${prior} → ${after}`);
  console.log(`  ${title}`);

  const { data: exist } = await sb
    .from('daily_transactions')
    .select('id')
    .eq('store_id', 'store1')
    .eq('occurred_on', date)
    .eq('client_phone', phone)
    .eq('amount', amount);
  if (exist?.length) {
    console.log('  已存在，略過新增');
    return;
  }

  if (!apply) return;

  let notionPageId: string | null = null;
  if (readNotionTokenFromEnv()) {
    notionPageId = await createNotionDailyPage({
      title,
      date,
      amount,
      serviceType: 'VIP 60分',
      staffName: '錦',
    });
    console.log(`  ✓ Notion ${notionPageId.slice(0, 8)}…`);
  } else {
    console.log('  ⚠ Notion 略過（無 API 金鑰）');
  }

  const { error } = await sb.from('daily_transactions').insert({
    store_id: 'store1',
    notion_page_id: notionPageId,
    occurred_on: date,
    title,
    amount,
    service_type: 'VIP 60分',
    category: '會員使用',
    payment_methods: [],
    staff_name: '錦',
    is_designated: false,
    member_note: `gcal:${calId}:single`,
    client_name: name,
    client_phone: phone,
    is_vip: true,
    source: 'manual_fix',
  });
  if (error) throw new Error(error.message);

  await patchCalendarEventSummary(calId, title);
  console.log('  ✓ DB + Calendar');
}

async function auditClient(sb: ReturnType<typeof getSupabaseAdmin>, phone: string, name: string) {
  const rows = await loadMemberRows(sb, phone);
  let running = 0;
  let bad = 0;
  for (const r of rows) {
    running += memberRowSignedAmount(r.category, r.amount);
    const tb = parseBalanceAfter顿号(stripAllSpaces(r.title));
    if (tb !== null && tb !== running) bad++;
  }
  const bal = clientMemberBalance(rows, phone);
  console.log(`  ${name} ${phone}: 餘額 ${bal}${bad ? ` ⚠ ${bad} 筆頓號不符` : ' ✓'}`);
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const sb = getSupabaseAdmin();

  console.log(apply ? '=== 執行 ===' : '=== dry-run ===');

  await insertXiaoMay9(sb, apply);
  await fixCaiPhoneGlobally(sb, apply);

  const clients: [string, string][] = [
    ['0928294900', '陳宥奇'],
    ['0922013860', '謝明潔'],
    ['0905731802', '洪昱杰'],
    ['0922651957', '林妤真'],
    ['0939527658', '江麗婷'],
    ['0922451511', '施智升'],
    ['0928540001', '蕭鼎亞'],
    ['0928627078', '蔡聰榮'],
  ];

  console.log('\n--- 餘額標題對帳 ---');
  for (const [phone, name] of clients) {
    console.log(`\n${name}:`);
    const { fixed } = await reconcileClient(sb, phone, name, apply);
    if (fixed === 0) console.log('  （無需修改）');
    else if (apply) console.log(`  ✓ 已修正 ${fixed} 筆`);
  }

  // 蔡聰榮：合併標題中殘留 70782 後再對帳一次
  await fixCaiPhoneGlobally(sb, apply);

  console.log('\n--- 最終對帳 ---');
  for (const [phone, name] of clients) {
    await auditClient(sb, phone, name);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
