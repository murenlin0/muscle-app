/**
 * 逐客人：DB 會員餘額(signed加總) vs Notion 會員餘額公式加總
 * npx tsx scripts/audit-db-notion-member-balance.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { memberRowSignedAmount, sumUnusedMemberBalances } from '../lib/ledger-title-balance';
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

function notionSigned(st: string | null, amount: number): number | null {
  const t = st?.trim() ?? '';
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

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const notionByClient = new Map<string, { sum: number; name: string | null }>();
  const notionNameToPhone = new Map<string, string>();
  for (const r of notion) {
    const signed = notionSigned(r.serviceType, r.amount);
    if (signed === null) continue;
    const phone = phoneFromTitle(r.title);
    const name = nameFromTitle(r.title);
    if (phone && name) notionNameToPhone.set(name, phone);
    const key = phone ?? (name ? `name:${name}` : null);
    if (!key) continue;
    const e = notionByClient.get(key) ?? { sum: 0, name };
    e.sum += signed;
    if (name) e.name = name;
    notionByClient.set(key, e);
  }

  type Row = {
    id: string;
    occurred_on: string;
    title: string;
    amount: number;
    category: string;
    client_name: string | null;
    client_phone: string | null;
    notion_page_id: string | null;
  };
  const dbRows: Row[] = [];
  let o = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, client_name, client_phone, notion_page_id')
      .eq('store_id', 'store1')
      .lte('occurred_on', today)
      .in('category', ['會員儲值', '會員使用', '會員補差額'])
      .range(o, o + 999);
    if (error) throw error;
    if (!data?.length) break;
    dbRows.push(...(data as Row[]));
    if (data.length < 1000) break;
    o += 1000;
  }

  const dbByClient = new Map<string, { sum: number; name: string | null }>();
  const dbNameToPhone = new Map<string, string>();
  for (const r of dbRows) {
    const phone = r.client_phone ?? phoneFromTitle(r.title);
    const name = r.client_name ? stripVipPrefix(r.client_name).trim() : nameFromTitle(r.title);
    if (phone && name) dbNameToPhone.set(name, phone);
    const key = phone ?? (name ? dbNameToPhone.get(name) ?? notionNameToPhone.get(name) ?? `name:${name}` : null);
    if (!key) continue;
    const e = dbByClient.get(key) ?? { sum: 0, name: name ?? null };
    e.sum += memberRowSignedAmount(r.category, r.amount);
    if (name) e.name = name;
    dbByClient.set(key, e);
  }

  const dbTotal = sumUnusedMemberBalances(dbRows);
  const notionTotal = [...notionByClient.values()].reduce((s, e) => s + e.sum, 0);

  const lines: string[] = [];
  const log = (s = '') => { lines.push(s); console.log(s); };

  log('=== 總計 ===');
  log(`DB 餘額未使用: $${dbTotal.toLocaleString()}`);
  log(`Notion 會員餘額加總: $${notionTotal.toLocaleString()}`);
  log(`差異: $${(dbTotal - notionTotal).toLocaleString()}`);

  log('\n=== 楊子毅 / 蔡欣家 同步確認 ===');
  for (const phone of ['0911301695', '0912372254']) {
    const db = dbByClient.get(phone);
    const nt = notionByClient.get(phone);
    const dbOnly = dbRows.filter((r) => (r.client_phone ?? phoneFromTitle(r.title)) === phone);
    const ntOnly = notion.filter((r) => phoneFromTitle(r.title) === phone && notionSigned(r.serviceType, r.amount) !== null);
    log(`${phone} ${db?.name ?? ''}: DB=${db?.sum ?? '?'} Notion=${nt?.sum ?? '?'} ${db?.sum === nt?.sum ? '✓' : '✗'} (DB ${dbOnly.length} 筆 / Notion ${ntOnly.length} 筆)`);
    const dbPages = new Set(dbOnly.map((r) => r.notion_page_id).filter(Boolean));
    const ntPages = new Set(ntOnly.map((r) => r.pageId));
    let missingInDb = 0;
    for (const p of ntPages) if (!dbPages.has(p)) missingInDb++;
    let missingInNotion = 0;
    for (const p of dbPages) if (p && !ntPages.has(p)) missingInNotion++;
    if (missingInDb || missingInNotion) log(`  page 差異: Notion有DB無=${missingInDb} DB有Notion無=${missingInNotion}`);
    else log('  page id 一一對應 ✓');
  }

  const mismatches: { key: string; name: string | null; db: number; notion: number; diff: number }[] = [];
  const allKeys = new Set([...dbByClient.keys(), ...notionByClient.keys()]);
  for (const key of allKeys) {
    const db = dbByClient.get(key)?.sum ?? 0;
    const nt = notionByClient.get(key)?.sum ?? 0;
    if (db !== nt) {
      mismatches.push({
        key,
        name: dbByClient.get(key)?.name ?? notionByClient.get(key)?.name ?? null,
        db,
        notion: nt,
        diff: db - nt,
      });
    }
  }
  mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  log(`\n=== 逐客人不一致 (${mismatches.length}) ===`);
  for (const m of mismatches) {
    log(`${m.name ?? ''} ${m.key}: DB=${m.db} Notion=${m.notion} 差=${m.diff}`);
  }

  writeFileSync(resolve(process.cwd(), 'audit-db-notion-member-balance.txt'), lines.join('\n'), 'utf8');
}

main().catch((e) => { console.error(e); process.exit(1); });
