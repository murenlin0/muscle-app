/**
 * 稽核 Notion 付款方式（仁中信/街口/Line 等）在 DB 的歸戶情況
 * npx tsx scripts/audit-payment-accounts.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';

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

  console.log('載入 Notion…');
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);

  // Notion 付款方式分布
  const notionPmCount = new Map<string, number>();
  const notionPmAmount = new Map<string, number>();
  for (const r of notion) {
    const pms = r.paymentMethods.length ? r.paymentMethods : ['(空白)'];
    for (const pm of pms) {
      notionPmCount.set(pm, (notionPmCount.get(pm) ?? 0) + 1);
      notionPmAmount.set(pm, (notionPmAmount.get(pm) ?? 0) + r.amount);
    }
  }

  // DB 資料
  const dbRows: { notion_page_id: string | null; payment_methods: string[]; amount: number; category: string }[] = [];
  let o = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('notion_page_id, payment_methods, amount, category')
      .eq('store_id', 'store1')
      .range(o, o + 999);
    if (error) throw error;
    if (!data?.length) break;
    dbRows.push(...(data as any));
    if (data.length < 1000) break;
    o += 1000;
  }
  const dbByPage = new Map<string, { payment_methods: string[]; amount: number; category: string }>();
  for (const r of dbRows) {
    const pid = r.notion_page_id?.split('#')[0];
    if (pid && !dbByPage.has(pid)) dbByPage.set(pid, r);
  }

  // DB payment_methods 分布
  const dbPmCount = new Map<string, number>();
  for (const r of dbRows) {
    const pms = r.payment_methods?.length ? r.payment_methods : ['(空白)'];
    for (const pm of pms) dbPmCount.set(pm, (dbPmCount.get(pm) ?? 0) + 1);
  }

  // 焦點：Notion 付款方式為 仁中信/街口/Line 的列，DB 現在歸到什麼帳戶
  const TARGET = ['仁中信', '街口', 'Line', 'line', 'LINE'];
  const focus: { pm: string; dbPm: string; count: number; amount: number }[] = [];
  const focusMap = new Map<string, { count: number; amount: number }>();
  for (const r of notion) {
    const hit = r.paymentMethods.find((p) => TARGET.includes(p) || TARGET.includes(p.toLowerCase()));
    if (!hit) continue;
    const db = dbByPage.get(r.pageId);
    const dbPm = db ? (db.payment_methods?.length ? db.payment_methods.join('+') : '(空白)') : '(DB查無)';
    const key = `${hit} → DB:${dbPm}`;
    const e = focusMap.get(key) ?? { count: 0, amount: 0 };
    e.count += 1;
    e.amount += r.amount;
    focusMap.set(key, e);
  }

  const lines: string[] = [];
  const log = (s = '') => lines.push(s);

  log('=== Notion 付款方式分布（筆數 / 金額合計）===');
  for (const [pm, c] of [...notionPmCount.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${pm}: ${c} 筆 / $${(notionPmAmount.get(pm) ?? 0).toLocaleString()}`);
  }

  log('\n=== DB payment_methods 分布（筆數）===');
  for (const [pm, c] of [...dbPmCount.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${pm}: ${c} 筆`);
  }

  log('\n=== 焦點：Notion 仁中信/街口/Line → DB 現況歸戶 ===');
  for (const [k, v] of [...focusMap.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
    log(`  ${k}: ${v.count} 筆 / $${v.amount.toLocaleString()}`);
  }

  writeFileSync(resolve(process.cwd(), 'audit-payment-accounts-report.txt'), lines.join('\n'), 'utf8');
  console.log(lines.join('\n'));
  console.log('\n報告寫入 audit-payment-accounts-report.txt');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
