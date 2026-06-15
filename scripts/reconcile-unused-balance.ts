/**
 * 對帳：Notion「會員餘額」公式加總 vs App「餘額未使用」
 * npx tsx scripts/reconcile-unused-balance.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { sumUnusedBalancesFromTitles } from '../lib/ledger-title-balance';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const PLUS = new Set(['儲值', 'VIP 結清', 'VIP 活動']);
const MINUS = new Set(['VIP 30分', 'VIP 60分', 'VIP 90分', 'VIP 120分', 'VIP 150分', 'VIP 180分']);

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  // 1) Notion 公式重現（逐 消費類型 分解）
  console.log('載入 Notion…');
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const byType = new Map<string, { signedSum: number; rawSum: number; count: number }>();
  let notionFormula = 0;
  for (const r of notion) {
    const t = r.serviceType?.trim() ?? '(空)';
    let signed = 0;
    if (PLUS.has(t)) signed = Math.round(r.amount);
    else if (MINUS.has(t)) signed = -Math.round(r.amount);
    else continue;
    notionFormula += signed;
    const e = byType.get(t) ?? { signedSum: 0, rawSum: 0, count: 0 };
    e.signedSum += signed;
    e.rawSum += Math.round(r.amount);
    e.count += 1;
    byType.set(t, e);
  }

  // 2) DB 端 category 對應加總
  const dbRows: { occurred_on: string; title: string; amount: number; category: string; client_name: string | null; client_phone: string | null; id: string }[] = [];
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
    dbRows.push(...(data as any));
    if (data.length < 1000) break;
    o += 1000;
  }
  let topup = 0, use = 0, gap = 0;
  for (const r of dbRows) {
    const a = Math.round(r.amount ?? 0);
    if (r.category === '會員儲值') topup += a;
    else if (r.category === '會員使用') use += a;
    else if (r.category === '會員補差額') gap += a;
  }
  const dbFormula = topup - use + gap;

  // 3) App 餘額未使用（只取含頓號的列）
  const dunRows = dbRows.filter((r) => r.title.includes('、'));
  const appUnused = sumUnusedBalancesFromTitles(dunRows);

  const lines: string[] = [];
  const log = (s = '') => { lines.push(s); console.log(s); };

  log('=== Notion 會員餘額 公式（逐類型）===');
  for (const [t, e] of [...byType.entries()].sort((a, b) => Math.abs(b[1].signedSum) - Math.abs(a[1].signedSum))) {
    log(`  ${t}: signed $${e.signedSum.toLocaleString()}  (raw $${e.rawSum.toLocaleString()}, ${e.count} 筆)`);
  }
  log(`  ▶ Notion 公式總計: $${notionFormula.toLocaleString()}`);

  log('\n=== DB 對應加總 ===');
  log(`  會員儲值(+): $${topup.toLocaleString()}`);
  log(`  會員使用(-): $${use.toLocaleString()}`);
  log(`  會員補差額(+): $${gap.toLocaleString()}`);
  log(`  ▶ DB 公式淨額: $${dbFormula.toLocaleString()}`);

  log('\n=== App 餘額未使用 ===');
  log(`  含頓號列: ${dunRows.length} / 會員列 ${dbRows.length}`);
  log(`  ▶ 餘額未使用: $${appUnused.toLocaleString()}`);

  log('\n=== 差異 ===');
  log(`  Notion公式 - 餘額未使用 = $${(notionFormula - appUnused).toLocaleString()}`);

  writeFileSync(resolve(process.cwd(), 'reconcile-unused-balance-report.txt'), lines.join('\n'), 'utf8');
}

main().catch(console.error);
