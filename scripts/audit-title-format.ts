/**
 * 稽核客人標題是否符合格式：
 *   師傅 方案 (+儲值 / -會員使用 / 單次) 、餘額 會員(姓名+電話，無電話標(無電話)，A用B寫 A/VIP B電話)
 *
 * 用法：npx tsx scripts/audit-title-format.ts
 * 產出：audit-title-format-report.txt
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
  title: string;
  amount: number;
  category: string;
  client_phone: string | null;
};

async function fetchMembers(): Promise<Row[]> {
  const sb = getSupabaseAdmin();
  const out: Row[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, client_phone')
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

const NO_PHONE_MARK = /\(無電話\)|（無電話）/;

/** 頓號後餘額（、後面接數字） */
function hasDunBalance(title: string): boolean {
  const idx = title.lastIndexOf('、');
  if (idx < 0) return false;
  return /^\s*-?\d/.test(title.slice(idx + 1));
}

/** +/- 號（排除舊式 x/y 的數字斜線段） */
function hasSign(title: string, category: string): boolean {
  if (category === '會員儲值') return /\+\s*\d/.test(title);
  const t = title.replace(/(?:^|[^\d])(-?\d{1,6})\/(\d{1,6})/g, '');
  return /-\s*\d/.test(t);
}

/** 仍是舊式「已用/儲值」寫法（x/y，y 為儲值總額） */
function hasLegacyUsedStored(title: string): boolean {
  return /(?:^|[^\d])-?\d{1,6}\/\d{1,6}/.test(title);
}

/** 結尾會員身分是否合規：VIP名電話 / A/VIP名電話 / 任何(無電話) */
function memberTailOk(title: string, phoneCol: string | null): boolean {
  if (NO_PHONE_MARK.test(title)) return true;
  if (phoneCol && /09\d{8}/.test(phoneCol)) return true;
  // 標題結尾為 ...名字09xxxxxxxx（電話收尾，且電話後沒有殘留 /人名）
  return /09\d{8}\s*$/.test(title);
}

/** A 的電話沒清掉：人名+電話 後面接 /VIP 或 /人名 */
function hasLeadingPhoneBeforeSlash(title: string): boolean {
  const compact = title.replace(/\s/g, '');
  // 09xxxxxxxx/ 之後不是純數字（排除餘額 x/y）
  return /09\d{8}\/(?!\d)/.test(compact);
}

/** 電話後還掛 /人名（反向合寫，如 VIP施順雄0930906500/跑班） */
function hasTrailingNameAfterPhone(title: string): boolean {
  const compact = title.replace(/\s/g, '');
  return /09\d{8}\/[\u4e00-\u9fffA-Za-z]/.test(compact);
}

async function main() {
  loadEnv();
  const rows = await fetchMembers();

  // 互斥分類：一筆只進最該優先處理的一類
  const cat = {
    leadingPhone: [] as Row[], // A電話未清除
    trailingName: [] as Row[], // 電話後掛人名（反向）
    noMember: [] as Row[], // 無電話且未標(無電話)
    legacyFmt: [] as Row[], // 舊式x/y，缺 +/- 或 、餘額
    missingSignOrBal: [] as Row[], // 其他缺 +/- 或 、餘額
  };

  for (const r of rows) {
    if (hasLeadingPhoneBeforeSlash(r.title)) {
      cat.leadingPhone.push(r);
      continue;
    }
    if (hasTrailingNameAfterPhone(r.title)) {
      cat.trailingName.push(r);
      continue;
    }
    if (!memberTailOk(r.title, r.client_phone)) {
      cat.noMember.push(r);
      continue;
    }
    const needSign = !hasSign(r.title, r.category);
    const needBal = !hasDunBalance(r.title);
    if (needSign || needBal) {
      if (hasLegacyUsedStored(r.title)) cat.legacyFmt.push(r);
      else cat.missingSignOrBal.push(r);
    }
  }

  const lines: string[] = [];
  const log = (s = '') => lines.push(s);
  const total =
    cat.leadingPhone.length +
    cat.trailingName.length +
    cat.noMember.length +
    cat.legacyFmt.length +
    cat.missingSignOrBal.length;

  log(`會員交易總數: ${rows.length}`);
  log(`不符規範合計: ${total}`);
  log(`  A1 A的電話未清除 (應移除A電話、補B電話): ${cat.leadingPhone.length}`);
  log(`  A2 電話後掛人名/反向合寫: ${cat.trailingName.length}`);
  log(`  B  無電話且未標(無電話): ${cat.noMember.length}`);
  log(`  C  舊式 x/y 未轉成 +/-、餘額: ${cat.legacyFmt.length}`);
  log(`  D  其他缺 +/- 或 、餘額: ${cat.missingSignOrBal.length}`);

  const dump = (name: string, list: Row[]) => {
    log(`\n===== ${name} (${list.length}) =====`);
    for (const r of list) log(`${r.occurred_on} [${r.category}] amt=${r.amount} | ${r.title}`);
  };

  dump('A1 A的電話未清除', cat.leadingPhone);
  dump('A2 電話後掛人名/反向合寫', cat.trailingName);
  dump('B 無電話且未標(無電話)', cat.noMember);
  dump('C 舊式 x/y 未轉成 +/-、餘額', cat.legacyFmt);
  dump('D 其他缺 +/- 或 、餘額', cat.missingSignOrBal);

  writeFileSync(resolve(process.cwd(), 'audit-title-format-report.txt'), lines.join('\n'), 'utf8');
  console.log(lines.slice(0, 7).join('\n'));
  console.log('\n報告寫入 audit-title-format-report.txt');
}

main().catch(console.error);
