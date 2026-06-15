/**
 * 修正「電話+已用/儲值」黏在一起：0987515163500/4000 → 0987515163，並保留正確 +/-、餘額。
 * npx tsx scripts/fix-merged-phone-balance.ts [--apply]
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { parseNotionNamePhone, stripVipPrefix } from '../lib/phone';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

function parseMerged(title: string): { phone: string; used: number; stored: number; match: string } | null {
  const re = /(09\d{8})(\d{1,6})\/(\d{1,6})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(title)) !== null) {
    const phone = m[1]!;
    const used = Number(m[2]);
    const stored = Number(m[3]);
    if (!Number.isFinite(used) || !Number.isFinite(stored)) continue;
    return { phone, used, stored, match: m[0] };
  }
  return null;
}

function vipSuffix(name: string, phone: string): string {
  return `VIP${stripVipPrefix(name)}${phone}`;
}

function buildCorrectTitle(row: {
  title: string;
  amount: number;
  category: string;
  client_name: string | null;
  client_phone: string | null;
}): string | null {
  const merged = parseMerged(row.title);
  if (!merged) return null;

  const parsed = parseNotionNamePhone(row.title.replace(merged.match, merged.phone));
  const name =
    (row.client_name ? stripVipPrefix(row.client_name) : null) ??
    parsed?.name ??
    '客人';
  const phone = row.client_phone ?? merged.phone;
  const vip = vipSuffix(name, phone);
  const remain = merged.stored - merged.used;
  const amt = Math.abs(row.amount);

  // 標題已有正確 +/- 與 、餘額 → 只清掉黏在 VIP 後的 phone+used/stored
  const dunIdx = row.title.lastIndexOf('、');
  if (dunIdx >= 0) {
    const beforeDun = row.title.slice(0, dunIdx);
    const afterDun = row.title.slice(dunIdx + 1);
    const balM = afterDun.match(/^(-?\d+)/);
    if (balM) {
      const balance = balM[1];
      const signM = beforeDun.match(/(-\d+|\+\d+)\s*$/);
      const head = signM ? beforeDun.slice(0, -signM[0].length) : beforeDun;
      const sign =
        signM?.[0]?.trim() ??
        (row.category === '會員儲值' ? `+${amt}` : row.category === '會員使用' ? `-${amt}` : '');
      if (row.category === '會員儲值' || row.category === '會員使用' || row.category === '會員補差額') {
        return `${head}${sign}、${balance}${vip}`;
      }
    }
  }

  // 舊式純 2000/4000VIP 段（無頓號）
  const head = row.title.slice(0, row.title.indexOf(merged.match)).replace(/\s+$/, '');
  if (row.category === '會員儲值') {
    return `${head}+${amt}、${merged.stored}${vip}`;
  }
  if (row.category === '會員使用') {
    return `${head}-${amt}、${remain}${vip}`;
  }
  return row.title.replace(merged.match, phone);
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const sb = getSupabaseAdmin();

  const rows: {
    id: string;
    occurred_on: string;
    title: string;
    amount: number;
    category: string;
    client_name: string | null;
    client_phone: string | null;
  }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, occurred_on, title, amount, category, client_name, client_phone')
      .eq('store_id', 'store1')
      .like('title', '%/%')
      .order('occurred_on')
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
    offset += 1000;
  }

  const fixes: { id: string; date: string; old: string; neu: string }[] = [];
  for (const row of rows) {
    if (!parseMerged(row.title)) continue;
    const neu = buildCorrectTitle(row);
    if (!neu || neu === row.title) continue;
    fixes.push({ id: row.id, date: row.occurred_on, old: row.title, neu });
  }

  const lines = fixes.map((f) => `${f.date}\n  舊: ${f.old}\n  新: ${f.neu}\n`);
  writeFileSync('fix-merged-phone-balance-report.txt', `共 ${fixes.length} 筆\n\n${lines.join('\n')}`, 'utf8');

  console.log(`需修正 ${fixes.length} 筆`);
  for (const f of fixes) {
    console.log(`${f.date}\n  舊: ${f.old}\n  新: ${f.neu}\n`);
  }

  if (!apply) {
    console.log('(dry-run，加 --apply 寫回)');
    return;
  }

  for (const f of fixes) {
    const { error } = await sb.from('daily_transactions').update({ title: f.neu }).eq('id', f.id);
    if (error) console.error(f.id, error.message);
  }
  console.log(`updated ${fixes.length} rows`);
}

main().catch(console.error);
