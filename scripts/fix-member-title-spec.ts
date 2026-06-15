/**
 * 補齊會員儲值/會員使用標題的 +/-金額 與 、餘額。
 * 用法：
 *   npx tsx scripts/fix-member-title-spec.ts          # dry-run 試算，輸出 fix-member-report.txt
 *   npx tsx scripts/fix-member-title-spec.ts --apply  # 實際寫回資料庫
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { parseNotionNamePhone } from '../lib/phone';

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
  created_at: string;
  title: string;
  amount: number;
  category: string;
  store_id: string;
  client_name: string | null;
  client_phone: string | null;
};

async function fetchAll(): Promise<Row[]> {
  const sb = getSupabaseAdmin();
  const out: Row[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, created_at, title, amount, category, store_id, client_name, client_phone')
      .in('category', ['會員使用', '會員儲值'])
      .order('occurred_on', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    out.push(...(data as Row[]));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

/** 頓號餘額：最後一個「、」後的數字（容許空白、負數與後綴） */
function dunBalance(title: string): number | null {
  const idx = title.lastIndexOf('、');
  if (idx < 0) return null;
  const m = title.slice(idx + 1).match(/^\s*(-?\d+)/);
  return m ? Number(m[1]) : null;
}

/** 舊式 已用/儲值（需有非數字邊界，避免吃到電話），回傳剩餘 */
function legacyBalance(title: string): number | null {
  const m = title.match(/(?:^|[^\d])(-?\d{1,6})\/(\d{1,6})\s*(?=VIP|$)/i);
  if (!m) return null;
  return Number(m[2]) - Number(m[1]);
}

/** 標題已標注的「交易後餘額」；「結清」= 欠額已付清，餘額歸 0 */
function annotatedBalance(title: string): number | null {
  return dunBalance(title) ?? (title.includes('結清') ? 0 : legacyBalance(title));
}

function hasSign(title: string, category: string): boolean {
  if (category === '會員儲值') return /\+\s*\d/.test(title);
  // 排除舊式 -500/4000 的負號
  const t = title.replace(/(?:^|[^\d])(-?\d{1,6})\/(\d{1,6})/g, '');
  return /-\s*\d/.test(t);
}

function clientPhoneOf(row: Row): string | null {
  if (row.client_phone) return row.client_phone;
  return parseNotionNamePhone(row.title)?.phone ?? null;
}

/** 個別化標題：補上 sign 與 、餘額 */
function buildFixedTitle(row: Row, balance: number, needSign: boolean, needBalance: boolean): string {
  let title = row.title;
  const sign = row.category === '會員儲值' ? `+${Math.abs(row.amount)}` : `-${Math.abs(row.amount)}`;

  if (needBalance) {
    // 移除舊式 已用/儲值 段（資訊改由 、餘額 表達）
    title = title.replace(/((?:^|[^\d]))(-?\d{1,6})\/(\d{1,6})\s*(?=VIP|$)/i, '$1').replace(/\s{2,}/g, ' ');
    let insert = needSign ? sign : '';
    insert += `、${balance}`;
    const vipIdx = title.toUpperCase().lastIndexOf('VIP');
    if (vipIdx >= 0) {
      title = `${title.slice(0, vipIdx).trimEnd()}${insert}${title.slice(vipIdx)}`;
    } else {
      title = `${title.trimEnd()}${insert}`;
    }
    return title;
  }

  if (needSign) {
    // 已有 、餘額 → 把 sign 插在最後一個 、 前
    const dunIdx = title.lastIndexOf('、');
    if (dunIdx >= 0 && /^\s*\d/.test(title.slice(dunIdx + 1))) {
      return `${title.slice(0, dunIdx)}${sign}${title.slice(dunIdx)}`;
    }
    const vipIdx = title.toUpperCase().lastIndexOf('VIP');
    if (vipIdx >= 0) return `${title.slice(0, vipIdx).trimEnd()}${sign}${title.slice(vipIdx)}`;
    return `${title.trimEnd()}${sign}`;
  }

  return title;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const rows = await fetchAll();
  const lines: string[] = [];
  const log = (s: string) => lines.push(s);

  // 依 店+客人電話 分組
  const groups = new Map<string, Row[]>();
  const noPhone: Row[] = [];
  for (const r of rows) {
    const phone = clientPhoneOf(r);
    if (!phone) {
      noPhone.push(r);
      continue;
    }
    const key = `${r.store_id}|${phone}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const fixes: { row: Row; newTitle: string; balance: number }[] = [];
  let negativeCount = 0;
  let noAnchorClients = 0;

  for (const [, list] of groups) {
    // 同日先儲值後使用
    list.sort((a, b) => {
      if (a.occurred_on !== b.occurred_on) return a.occurred_on.localeCompare(b.occurred_on);
      if (a.category !== b.category) return a.category === '會員儲值' ? -1 : 1;
      if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
      return a.id.localeCompare(b.id);
    });

    const n = list.length;
    const delta = list.map((r) => (r.category === '會員儲值' ? Math.abs(r.amount) : -Math.abs(r.amount)));

    // 同日同標題視為合寫群組；標注餘額屬於群組「最後一列之後」
    const lastOfGroup = new Map<string, number>();
    for (let i = 0; i < n; i += 1) {
      lastOfGroup.set(`${list[i]!.occurred_on}|${list[i]!.title}`, i);
    }
    const anchorAt: (number | null)[] = list.map((r, i) => {
      if (lastOfGroup.get(`${r.occurred_on}|${r.title}`) !== i) return null;
      return annotatedBalance(r.title);
    });

    if (!anchorAt.some((a) => a !== null)) noAnchorClients += 1;

    // 正向：錨點重設
    const bal: number[] = new Array(n).fill(0);
    let running = 0;
    for (let i = 0; i < n; i += 1) {
      running += delta[i]!;
      if (anchorAt[i] !== null) running = anchorAt[i]!;
      bal[i] = running;
    }
    // 反向：非錨點列由下一列倒推（涵蓋首錨點前與群組內）
    for (let i = n - 2; i >= 0; i -= 1) {
      if (anchorAt[i] !== null) continue;
      bal[i] = bal[i + 1]! - delta[i + 1]!;
    }

    for (let i = 0; i < n; i += 1) {
      const row = list[i]!;
      const needSign = !hasSign(row.title, row.category);
      const needBalance = dunBalance(row.title) === null;
      if (!needSign && !needBalance) continue;
      if (bal[i]! < 0) negativeCount += 1;
      fixes.push({ row, newTitle: buildFixedTitle(row, bal[i]!, needSign, needBalance), balance: bal[i]! });
    }
  }

  log(`member rows: ${rows.length}, clients: ${groups.size}`);
  log(`rows to fix: ${fixes.length}`);
  log(`fixes with negative balance: ${negativeCount}`);
  log(`clients without any annotated anchor: ${noAnchorClients}`);
  log(`no-phone rows skipped: ${noPhone.length}`);

  log('\n--- no-phone rows (first 30) ---');
  for (const r of noPhone.slice(0, 30)) {
    log(`${r.occurred_on} [${r.category}] amt=${r.amount} | ${r.title}`);
  }

  log('\n--- negative-balance fixes (first 30) ---');
  for (const f of fixes.filter((f) => f.balance < 0).slice(0, 30)) {
    log(`${f.row.occurred_on} [${f.row.category}] amt=${f.row.amount} bal=${f.balance}`);
    log(`  舊: ${f.row.title}`);
    log(`  新: ${f.newTitle}`);
  }

  log('\n--- sample fixes (first 80) ---');
  for (const f of fixes.slice(0, 80)) {
    log(`${f.row.occurred_on} [${f.row.category}] amt=${f.row.amount} bal=${f.balance}`);
    log(`  舊: ${f.row.title}`);
    log(`  新: ${f.newTitle}`);
  }

  writeFileSync(resolve(process.cwd(), 'fix-member-report.txt'), lines.join('\n'), 'utf8');
  console.log(lines.slice(0, 6).join('\n'));
  console.log('report written to fix-member-report.txt');

  if (!apply) {
    console.log('(dry-run，未寫入。加 --apply 寫回)');
    return;
  }

  const sb = getSupabaseAdmin();
  let done = 0;
  for (const f of fixes) {
    const { error } = await sb
      .from('daily_transactions')
      .update({ title: f.newTitle })
      .eq('id', f.row.id);
    if (error) {
      console.error(`update failed ${f.row.id}: ${error.message}`);
      continue;
    }
    done += 1;
    if (done % 200 === 0) console.log(`updated ${done}/${fixes.length}`);
  }
  console.log(`updated ${done}/${fixes.length} rows`);
}

main().catch(console.error);
