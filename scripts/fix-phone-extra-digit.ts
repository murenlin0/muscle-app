/**
 * 修正標題裡電話多打一位（09xxxxxxxx + 多1 digit）。
 *   npx tsx scripts/fix-phone-extra-digit.ts          # dry-run
 *   npx tsx scripts/fix-phone-extra-digit.ts --apply  # 寫回
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { normalizePhone } from '../lib/phone';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

/** 標題中 11 位 09 開頭 → 修正為 10 位台灣手機 */
function fixTitlePhoneExtraDigit(title: string): { fixed: string; changed: boolean; from?: string; to?: string } {
  let fixed = title;
  let changed = false;
  let from: string | undefined;
  let to: string | undefined;

  // 找 09 + 9 個數字（共 11 位），且前 10 位是合法手機
  const re = /09\d{9}/g;
  let m: RegExpExecArray | null;
  const replacements: { start: number; end: number; bad: string; good: string }[] = [];

  while ((m = re.exec(title)) !== null) {
    const bad = m[0];
    const good = bad.slice(0, 10);
    if (normalizePhone(good) !== good) continue;
    // 確認第 11 位確實是多餘的（不是更長號碼的一部分被截斷）
    const nextChar = title[m.index + 11];
    if (nextChar !== undefined && /\d/.test(nextChar)) continue;
    replacements.push({ start: m.index, end: m.index + 11, bad, good });
  }

  if (!replacements.length) return { fixed: title, changed: false };

  // 由後往前替換，避免 index 偏移
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) {
    fixed = fixed.slice(0, r.start) + r.good + fixed.slice(r.end);
    changed = true;
    from = r.bad;
    to = r.good;
  }

  return { fixed, changed, from, to };
}

function fixClientPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (/^09\d{9}$/.test(phone) && normalizePhone(phone.slice(0, 10)) === phone.slice(0, 10)) {
    return phone.slice(0, 10);
  }
  return phone;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const sb = getSupabaseAdmin();

  const rows: {
    id: string;
    occurred_on: string;
    title: string;
    client_phone: string | null;
    category: string;
  }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, client_phone, category')
      .eq('store_id', 'store1')
      .order('occurred_on')
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }

  const fixes: {
    id: string;
    date: string;
    oldTitle: string;
    newTitle: string;
    oldPhone: string | null;
    newPhone: string | null;
    sample: string;
  }[] = [];

  for (const row of rows) {
    const { fixed, changed } = fixTitlePhoneExtraDigit(row.title);
    const newPhone = fixClientPhone(row.client_phone);
    const phoneChanged = newPhone !== row.client_phone;

    if (!changed && !phoneChanged) continue;

    fixes.push({
      id: row.id,
      date: row.occurred_on,
      oldTitle: row.title,
      newTitle: changed ? fixed : row.title,
      oldPhone: row.client_phone,
      newPhone: phoneChanged ? newPhone : row.client_phone,
      sample: changed ? `${row.title} → ${fixed}` : `phone ${row.client_phone} → ${newPhone}`,
    });
  }

  const lines = [
    `掃描 ${rows.length} 筆，需修正 ${fixes.length} 筆`,
    '',
    ...fixes.map(
      (f) =>
        `${f.date} [${f.id.slice(0, 8)}]\n  標題: ${f.oldTitle}\n  → ${f.newTitle}${
          f.oldPhone !== f.newPhone ? `\n  電話欄: ${f.oldPhone ?? '—'} → ${f.newPhone ?? '—'}` : ''
        }`,
    ),
  ];
  writeFileSync('fix-phone-extra-digit-report.txt', lines.join('\n'), 'utf8');

  console.log(`掃描 ${rows.length} 筆，需修正 ${fixes.length} 筆`);
  for (const f of fixes.slice(0, 15)) {
    console.log(`${f.date}: ${f.oldTitle}`);
    console.log(`  → ${f.newTitle}`);
  }
  if (fixes.length > 15) console.log(`...其餘 ${fixes.length - 15} 筆見 fix-phone-extra-digit-report.txt`);

  if (!apply) {
    console.log('\n(dry-run，加 --apply 寫回)');
    return;
  }

  let done = 0;
  for (const f of fixes) {
    const patch: { title?: string; client_phone?: string | null } = {};
    if (f.newTitle !== f.oldTitle) patch.title = f.newTitle;
    if (f.newPhone !== f.oldPhone) patch.client_phone = f.newPhone;

    const { error } = await sb.from('daily_transactions').update(patch).eq('id', f.id);
    if (error) {
      console.error(`failed ${f.id}: ${error.message}`);
      continue;
    }
    done += 1;
    if (done % 50 === 0) console.log(`updated ${done}/${fixes.length}`);
  }
  console.log(`updated ${done}/${fixes.length} rows`);
}

main().catch(console.error);
