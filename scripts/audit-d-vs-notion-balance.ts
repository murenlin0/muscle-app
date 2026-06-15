/**
 * 逐客人：Notion 會員餘額公式加總 vs App 最新頓號餘額
 * 特別列出 D 類（非 A/B/C）仍不一致者
 * npx tsx scripts/audit-d-vs-notion-balance.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import {
  latestClientBalanceFromTitles,
  parseBalanceAfter顿号,
  type TitleBalanceRow,
} from '../lib/ledger-title-balance';
import { parseNotionNamePhone, stripVipPrefix } from '../lib/phone';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const PLUS = new Set(['儲值', 'VIP 結清', 'VIP 活動']);
const MINUS = new Set(['VIP 30分', 'VIP 60分', 'VIP 90分', 'VIP 120分', 'VIP 150分', 'VIP 180分']);

function notionSigned(serviceType: string | null, amount: number): number | null {
  const t = serviceType?.trim() ?? '';
  if (PLUS.has(t)) return Math.round(amount);
  if (MINUS.has(t)) return -Math.round(amount);
  return null;
}

function phoneFromTitle(title: string): string | null {
  return parseNotionNamePhone(title)?.phone ?? null;
}

function nameFromTitle(title: string): string | null {
  const ms = [...title.matchAll(/VIP\s*([\u4e00-\u9fffA-Za-z]{2,12})/gi)];
  return ms[ms.length - 1]?.[1] ?? null;
}

type DbRow = TitleBalanceRow & { amount: number; category: string };

function phoneKey(r: DbRow): string | null {
  if (r.client_phone) return r.client_phone;
  return phoneFromTitle(r.title);
}
function nameKey(r: DbRow): string | null {
  if (r.client_name) {
    const n = stripVipPrefix(r.client_name).trim();
    if (n) return n;
  }
  return nameFromTitle(r.title);
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  console.log('載入 Notion…');
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);

  // Notion 逐客人公式加總
  const notionByClient = new Map<string, { sum: number; name: string | null; rows: number }>();
  const notionNameToPhone = new Map<string, string>();
  for (const r of notion) {
    const signed = notionSigned(r.serviceType, r.amount);
    if (signed === null) continue;
    const phone = phoneFromTitle(r.title);
    const name = nameFromTitle(r.title);
    if (phone && name) notionNameToPhone.set(name, phone);
    const key = phone ?? (name ? `name:${name}` : null);
    if (!key) continue;
    const e = notionByClient.get(key) ?? { sum: 0, name, rows: 0 };
    e.sum += signed;
    e.rows += 1;
    if (name) e.name = name;
    notionByClient.set(key, e);
  }

  // DB 會員列
  const dbRows: DbRow[] = [];
  let o = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, client_name, client_phone')
      .eq('store_id', 'store1')
      .lte('occurred_on', today)
      .in('category', ['會員儲值', '會員使用', '會員補差額'])
      .range(o, o + 999);
    if (error) throw error;
    if (!data?.length) break;
    dbRows.push(...(data as DbRow[]));
    if (data.length < 1000) break;
    o += 1000;
  }

  const nameToPhone = new Map<string, string>();
  for (const r of dbRows) {
    const p = phoneKey(r);
    const n = nameKey(r);
    if (p && n && !nameToPhone.has(n)) nameToPhone.set(n, p);
  }

  const dbGroups = new Map<string, DbRow[]>();
  for (const r of dbRows) {
    const p = phoneKey(r);
    const n = nameKey(r);
    const key = p ?? (n ? nameToPhone.get(n) ?? notionNameToPhone.get(n) ?? `name:${n}` : null);
    if (!key) continue;
    const arr = dbGroups.get(key) ?? [];
    arr.push(r);
    dbGroups.set(key, arr);
  }

  type Mismatch = {
    key: string;
    name: string | null;
    notionSum: number;
    latestBal: number | null;
    diff: number;
    latestDate: string;
    sample: string;
    tag: string;
  };
  const mismatches: Mismatch[] = [];

  const allKeys = new Set([...notionByClient.keys(), ...dbGroups.keys()]);
  for (const key of allKeys) {
    const notionSum = notionByClient.get(key)?.sum ?? 0;
    const list = dbGroups.get(key) ?? [];
    list.sort((a, b) =>
      a.occurred_on !== b.occurred_on ? a.occurred_on.localeCompare(b.occurred_on) : (a.id ?? '').localeCompare(b.id ?? ''),
    );

    let net = 0;
    let hasRefund = false;
    for (const r of list) {
      const a = Math.round(r.amount ?? 0);
      net += r.category === '會員使用' ? -a : a;
      if (r.category === '會員補差額' && a < 0) hasRefund = true;
    }
    const lastRow = list[list.length - 1];
    const lastHasDun = lastRow ? parseBalanceAfter顿号(lastRow.title) !== null : false;

    const phone = key.startsWith('name:') ? null : key;
    const latestBal = phone
      ? latestClientBalanceFromTitles(list, phone)
      : list.length
        ? latestClientBalanceFromTitles(list.map((r) => ({ ...r, client_phone: key })), key)
        : null;

    const lb = latestBal ?? 0;
    const diff = lb - notionSum;
    if (diff === 0) continue;

    const tag =
      net < 0 ? 'A' : hasRefund ? 'B' : !lastHasDun ? 'C' : 'D';

    mismatches.push({
      key,
      name: notionByClient.get(key)?.name ?? nameKey(list[list.length - 1] ?? list[0]!) ?? null,
      notionSum,
      latestBal,
      diff,
      latestDate: lastRow?.occurred_on ?? '—',
      sample: lastRow?.title ?? '—',
      tag,
    });
  }

  mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const dOnly = mismatches.filter((m) => m.tag === 'D');

  const lines: string[] = [];
  const log = (s = '') => { lines.push(s); console.log(s); };

  log(`Notion 客人數(公式): ${notionByClient.size}`);
  log(`DB 客人數: ${dbGroups.size}`);
  log(`全部不一致: ${mismatches.length} 人`);
  log(`其中 D 類: ${dOnly.length} 人`);

  log('\n=== 確認：楊子毅 / 蔡欣家 ===');
  for (const phone of ['0911301695', '0912372254']) {
    const m = mismatches.find((x) => x.key === phone);
    const n = notionByClient.get(phone);
    const lb = latestClientBalanceFromTitles(
      dbGroups.get(phone)?.filter((r) => r.title.includes('、')) ?? [],
      phone,
    );
    log(`${phone}: Notion公式=${n?.sum ?? '?'} App最新頓號=${lb ?? '?'} ${m ? `差=${m.diff} [${m.tag}]` : '✓ 一致'}`);
    const last = dbGroups.get(phone)?.slice(-1)[0];
    if (last) log(`  最新列: ${last.occurred_on} | ${last.title}`);
  }

  log('\n=== D 類：最新頓號餘額 ≠ Notion 會員餘額加總 ===');
  for (const m of dOnly) {
    log(`\n[D] ${m.name ?? ''} ${m.key.startsWith('name:') ? m.key : m.key}`);
    log(`  Notion公式=${m.notionSum}  最新頓號=${m.latestBal}  差=${m.diff}  (${m.latestDate})`);
    log(`  例: ${m.sample}`);
  }

  writeFileSync(resolve(process.cwd(), 'audit-d-vs-notion-report.txt'), lines.join('\n'), 'utf8');
}

main().catch((e) => { console.error(e); process.exit(1); });
