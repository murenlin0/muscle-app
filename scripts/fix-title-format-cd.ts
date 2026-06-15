/**
 * 正規化會員標題為：<師傅方案描述><±金額...>、<餘額><會員段>
 *   - C：舊式 x/y → 由 y-x 取餘額（也作為錨點）
 *   - D：缺 +/- 或 、餘額 → 以該客人前後合規列的餘額為錨點推算
 *   - B：無電話會員 → 優先補資料中既有電話，查無才標 (無電話)
 *   - 排除 A1（A電話未清除/反向合寫），交由人工確認
 *
 * 用法：
 *   npx tsx scripts/fix-title-format-cd.ts          # dry-run，輸出 fix-title-format-report.txt
 *   npx tsx scripts/fix-title-format-cd.ts --apply  # 寫回
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';

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
  client_phone: string | null;
};

const NO_PHONE_RE = /（無電話）|\(無電話\)/;

async function fetchMembers(): Promise<Row[]> {
  const sb = getSupabaseAdmin();
  const out: Row[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, created_at, title, amount, category, client_phone')
      .in('category', ['會員使用', '會員儲值'])
      .order('occurred_on', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    out.push(...(data as Row[]));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

/** A1：A 的電話沒清掉 或 電話後掛人名（反向合寫） */
function isA1(title: string): boolean {
  const compact = title.replace(/\s/g, '');
  return /09\d{8}\/(?!\d)/.test(compact) || /09\d{8}\/[\u4e00-\u9fffA-Za-z]/.test(compact);
}

/** 名字字元（排除方案/金流關鍵字，避免把「分/儲/值/送」當成名字一部分） */
const NAME_CHAR = '(?:(?![分儲值送])[\\u4e00-\\u9fffA-Za-z])';

/** 定位會員段起點：最後一個 VIP（含其前面的「A名/」）；無 VIP 時找結尾「名字+電話」 */
function locateMember(title: string): { start: number; block: string } | null {
  const upper = title.toUpperCase();
  const vipIdx = upper.lastIndexOf('VIP');
  if (vipIdx >= 0) {
    const pre = title.slice(0, vipIdx);
    const am = pre.match(new RegExp(`(${NAME_CHAR}{1,12})\\/\\s*$`));
    const start = am ? am.index! : vipIdx;
    return { start, block: title.slice(start) };
  }
  const m = title.match(new RegExp(`${NAME_CHAR}{2,12}09\\d{8}\\s*$`));
  if (m) return { start: m.index!, block: title.slice(m.index!) };
  return null;
}

/** 會員身分鍵（B 擁有者）：去 VIP、去「A名/」前段、去(無電話)、去空白 */
function ownerName(block: string): string {
  let s = block.replace(NO_PHONE_RE, '');
  const slash = s.lastIndexOf('/');
  if (slash >= 0) s = s.slice(slash + 1);
  s = s.replace(/VIP/i, '').replace(/09\d{8}/g, '').replace(/\s/g, '').trim();
  return s;
}

function trailingPhone(title: string): string | null {
  const ms = [...title.matchAll(/09\d{8}/g)];
  if (!ms.length) return null;
  return ms[ms.length - 1][0];
}

/** 舊式 x/y 剩餘＝y-x（x 為已用、y 為儲值總額） */
function legacyRemaining(title: string): number | null {
  const m = title.match(/(?:^|[^\d])(-?\d{1,6})\/(\d{1,6})/);
  if (!m) return null;
  return Number(m[2]) - Number(m[1]);
}

function hasDunBalance(title: string): boolean {
  const idx = title.lastIndexOf('、');
  return idx >= 0 && /^\s*-?\d/.test(title.slice(idx + 1));
}

function hasSign(title: string, category: string): boolean {
  if (category === '會員儲值') return /\+\s*\d/.test(title);
  const t = title.replace(/(?:^|[^\d])(-?\d{1,6})\/(\d{1,6})/g, '');
  return /-\s*\d/.test(t);
}

function hasLegacyUsedStored(title: string): boolean {
  return /(?:^|[^\d])-?\d{1,6}\/\d{1,6}/.test(title);
}

/** 已合規：會員段OK + 有 、餘額 + 有正確 +/- + 無舊式 x/y */
function conforms(row: Row): boolean {
  const tailOk = NO_PHONE_RE.test(row.title) || /09\d{8}\s*$/.test(row.title) || Boolean(row.client_phone && /09\d{8}/.test(row.client_phone));
  return tailOk && hasDunBalance(row.title) && hasSign(row.title, row.category) && !hasLegacyUsedStored(row.title);
}

/** 該列揭示的「交易後餘額」：、餘額 → 結清(0) → 舊式剩餘 */
function annotatedBalance(title: string): number | null {
  const idx = title.lastIndexOf('、');
  if (idx >= 0) {
    const m = title.slice(idx + 1).match(/^\s*(-?\d+)/);
    if (m) return Number(m[1]);
  }
  if (title.includes('結清')) return 0;
  return legacyRemaining(title);
}

/** 清掉前綴中的金額標記（x/y、、餘額、獨立 +N/-N），保留描述文字 */
function cleanPrefix(prefix: string): string {
  return prefix
    .replace(/-?\d{1,6}\/\d{1,6}/g, '') // 舊式 x/y
    .replace(/、\s*-?\d+/g, '') // 殘留 、餘額
    .replace(/[+\-]\s*\d{1,6}/g, '') // 獨立 +N/-N
    .replace(/[;；]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const all = await fetchMembers();

  // 名字→電話 對照（供 B 補電話）
  const nameToPhone = new Map<string, string>();
  for (const r of all) {
    const loc = locateMember(r.title);
    if (!loc) continue;
    const name = ownerName(loc.block);
    const phone = r.client_phone || trailingPhone(r.title);
    if (name && phone && !nameToPhone.has(name)) nameToPhone.set(name, phone);
  }

  // 客人分組鍵
  const keyOf = (r: Row): string | null => {
    if (r.client_phone) return r.client_phone;
    const tp = trailingPhone(r.title);
    if (tp) return tp;
    const loc = locateMember(r.title);
    if (!loc) return null;
    const name = ownerName(loc.block);
    const mapped = nameToPhone.get(name);
    return mapped ?? (name ? `nophone:${name}` : null);
  };

  // 排除 A1
  const rows = all.filter((r) => !isA1(r.title));

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }

  type Patch = { row: Row; newTitle: string; balance: number };
  const patches: Patch[] = [];
  const noPhoneMarked = new Set<string>();
  const phoneFilled = new Map<string, string>();

  for (const [key, list] of groups) {
    list.sort((a, b) => {
      if (a.occurred_on !== b.occurred_on) return a.occurred_on.localeCompare(b.occurred_on);
      if (a.category !== b.category) return a.category === '會員儲值' ? -1 : 1;
      if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
      return a.id.localeCompare(b.id);
    });
    const n = list.length;
    const delta = list.map((r) => (r.category === '會員儲值' ? Math.abs(r.amount) : -Math.abs(r.amount)));

    // 同 (日期+標題) 為合寫單元；錨點屬該單元最後一列
    const unitId = list.map((r) => `${r.occurred_on}__${r.title}`);
    const lastIdxOfUnit = new Map<string, number>();
    unitId.forEach((u, i) => lastIdxOfUnit.set(u, i));
    const anchorAt: (number | null)[] = list.map((r, i) =>
      lastIdxOfUnit.get(unitId[i]!) === i ? annotatedBalance(r.title) : null,
    );

    const bal = new Array<number>(n).fill(0);
    let running = 0;
    for (let i = 0; i < n; i += 1) {
      running += delta[i]!;
      if (anchorAt[i] !== null) running = anchorAt[i]!;
      bal[i] = running;
    }
    for (let i = n - 2; i >= 0; i -= 1) {
      if (anchorAt[i] !== null) continue;
      bal[i] = bal[i + 1]! - delta[i + 1]!;
    }

    const isNoPhoneKey = key.startsWith('nophone:');
    const ownerPhone = isNoPhoneKey ? null : key;

    // 以單元為單位重建
    const seenUnit = new Set<string>();
    for (let i = 0; i < n; i += 1) {
      const u = unitId[i]!;
      if (seenUnit.has(u)) continue;
      seenUnit.add(u);
      const unitRows = list.filter((_, j) => unitId[j] === u);
      // 已全部合規的單元不動
      if (unitRows.every((r) => conforms(r))) continue;
      const sample = unitRows[0]!;
      const loc = locateMember(sample.title);
      if (!loc) continue;

      // 會員段：補電話或 (無電話)
      let block = loc.block.trim();
      const hasPhoneInBlock = /09\d{8}/.test(block);
      const hasNoPhoneMark = NO_PHONE_RE.test(block);
      if (!hasPhoneInBlock && !hasNoPhoneMark) {
        if (ownerPhone) {
          block = `${block}${ownerPhone}`;
          phoneFilled.set(ownerName(loc.block), ownerPhone);
        } else {
          block = `${block}(無電話)`;
          noPhoneMarked.add(ownerName(loc.block));
        }
      }

      const prefix = cleanPrefix(sample.title.slice(0, loc.start));

      // 合寫單元的符號：儲值在前、使用在後
      const signParts: string[] = [];
      for (const ur of [...unitRows].sort((a, b) => (a.category === '會員儲值' ? -1 : 1))) {
        signParts.push(`${ur.category === '會員儲值' ? '+' : '-'}${Math.abs(ur.amount)}`);
      }
      const unitBal = bal[lastIdxOfUnit.get(u)!]!;
      const newTitle = `${prefix}${signParts.join('')}、${unitBal}${block}`;

      for (const ur of unitRows) {
        if (ur.title !== newTitle) patches.push({ row: ur, newTitle, balance: unitBal });
      }
    }
  }

  const lines: string[] = [];
  const log = (s = '') => lines.push(s);
  log(`掃描會員列(排除A1): ${rows.length}`);
  log(`客人分組: ${groups.size}`);
  log(`需改寫: ${patches.length}`);
  log(`負餘額筆數: ${patches.filter((p) => p.balance < 0).length}`);
  log(`補上既有電話的會員: ${[...phoneFilled.entries()].map(([n, p]) => `${n}=${p}`).join(', ') || '無'}`);
  log(`標記(無電話)的會員: ${[...noPhoneMarked].join(', ') || '無'}`);

  log('\n--- 負餘額(全部) ---');
  for (const p of patches.filter((p) => p.balance < 0)) {
    log(`${p.row.occurred_on} [${p.row.category}] amt=${p.row.amount} bal=${p.balance}`);
    log(`  舊: ${p.row.title}`);
    log(`  新: ${p.newTitle}`);
  }

  log('\n--- 全部改寫 ---');
  for (const p of patches) {
    log(`${p.row.occurred_on} [${p.row.category}] amt=${p.row.amount} bal=${p.balance}`);
    log(`  舊: ${p.row.title}`);
    log(`  新: ${p.newTitle}`);
  }

  writeFileSync(resolve(process.cwd(), 'fix-title-format-report.txt'), lines.join('\n'), 'utf8');
  console.log(lines.slice(0, 6).join('\n'));
  console.log('\n報告寫入 fix-title-format-report.txt');

  if (!apply) {
    console.log('(dry-run，加 --apply 寫回)');
    return;
  }

  const sb = getSupabaseAdmin();
  let done = 0;
  for (const p of patches) {
    const { error } = await sb.from('daily_transactions').update({ title: p.newTitle }).eq('id', p.row.id);
    if (error) console.error(p.row.id, error.message);
    else done += 1;
  }
  console.log(`updated ${done}/${patches.length}`);
}

main().catch(console.error);
