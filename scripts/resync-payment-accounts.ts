/**
 * 從 Notion 還原 DB 的「更動的帳戶」(payment_methods)，並計算每帳戶淨額。
 *   npx tsx scripts/resync-payment-accounts.ts          # dry-run
 *   npx tsx scripts/resync-payment-accounts.ts --apply  # 寫回 DB
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { normalizeLedgerAccounts } from '../lib/ledger-accounts';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

type DbRow = {
  id: string;
  notion_page_id: string | null;
  category: string;
  amount: number;
  payment_methods: string[] | null;
};

function basePageId(pid: string | null): string | null {
  if (!pid) return null;
  return pid.split('#')[0].split(':')[0];
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const sb = getSupabaseAdmin();

  console.log('載入 Notion…');
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const notionPmByPage = new Map(notion.map((r) => [r.pageId, r.paymentMethods]));

  const rows: DbRow[] = [];
  let o = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, notion_page_id, category, amount, payment_methods')
      .eq('store_id', 'store1')
      .range(o, o + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as DbRow[]));
    if (data.length < 1000) break;
    o += 1000;
  }

  const updates: { id: string; from: string; to: string; newPm: string[] }[] = [];
  for (const r of rows) {
    const pid = basePageId(r.notion_page_id);
    if (!pid) continue;
    const notionPm = notionPmByPage.get(pid);
    if (!notionPm) continue;

    const newPm = normalizeLedgerAccounts(notionPm, r.category);
    const cur = r.payment_methods ?? [];
    const same = cur.length === newPm.length && cur.every((v, i) => v === newPm[i]);
    if (!same) {
      updates.push({ id: r.id, from: cur.join('+') || '(空)', to: newPm.join('+') || '(空)', newPm });
    }
  }

  // 套用後的每帳戶淨額（以 raw amount 加總，略過會員使用）
  const balByAccount = new Map<string, { net: number; count: number }>();
  const updMap = new Map(updates.map((u) => [u.id, u.newPm]));
  for (const r of rows) {
    if (r.category === '會員使用') continue;
    const pm = updMap.get(r.id) ?? r.payment_methods ?? [];
    for (const acc of pm) {
      const e = balByAccount.get(acc) ?? { net: 0, count: 0 };
      e.net += Math.round(r.amount ?? 0);
      e.count += 1;
      balByAccount.set(acc, e);
    }
  }

  const changeByDir = new Map<string, number>();
  for (const u of updates) changeByDir.set(`${u.from} → ${u.to}`, (changeByDir.get(`${u.from} → ${u.to}`) ?? 0) + 1);

  const lines: string[] = [];
  const log = (s = '') => lines.push(s);
  log(`DB 列: ${rows.length}，需更新帳戶: ${updates.length}`);
  log('\n=== 帳戶異動方向 ===');
  for (const [k, c] of [...changeByDir.entries()].sort((a, b) => b[1] - a[1])) log(`  ${k}: ${c} 筆`);
  log('\n=== 套用後每帳戶淨額（流水加總）===');
  for (const [acc, e] of [...balByAccount.entries()].sort((a, b) => Math.abs(b[1].net) - Math.abs(a[1].net))) {
    log(`  ${acc}: $${e.net.toLocaleString()}（${e.count} 筆）${['仁中信', '街口', 'Line'].includes(acc) && e.net !== 0 ? '  ⚠️非0' : ''}`);
  }

  writeFileSync(resolve(process.cwd(), 'resync-payment-accounts-report.txt'), lines.join('\n'), 'utf8');
  console.log(lines.join('\n'));
  console.log('\n報告寫入 resync-payment-accounts-report.txt');

  if (!apply) {
    console.log('(dry-run，加 --apply 寫回)');
    return;
  }

  let done = 0;
  for (const u of updates) {
    const { error } = await sb.from('daily_transactions').update({ payment_methods: u.newPm }).eq('id', u.id);
    if (error) console.error(u.id, error.message);
    else done += 1;
    if (done % 100 === 0) console.log(`  updated ${done}/${updates.length}`);
  }
  console.log(`\nupdated ${done}/${updates.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
