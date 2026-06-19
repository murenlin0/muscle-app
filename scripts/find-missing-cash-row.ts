/**
 * 找出文一店現金差 1 筆 / $1,110
 * npx vercel env run --environment=production -- npx tsx scripts/find-missing-cash-row.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { fetchAllPages } from '../lib/supabase-paginate';
import { sumLedgerAccountBalances } from '../lib/ledger-balances';
import {
  getNotionDailyDbId,
  getNotionKeyDiagnostics,
  queryNotionDatabaseAll,
} from '../lib/notion-api';
import { mapNotionRowToTransaction } from '../lib/notion-daily-import';

function loadEnv(name: string, override = false): void {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (!override && process.env[k]?.trim()) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (v) process.env[k] = v;
  }
}

type Row = {
  id: string;
  notion_page_id: string | null;
  occurred_on: string;
  title: string;
  amount: number;
  category: string;
  payment_methods: string[] | null;
  service_type: string | null;
};

function isAiCash(r: Row): boolean {
  const pm = r.payment_methods ?? [];
  return pm.includes('現金') && r.category !== '會員使用' && !pm.includes('會員使用');
}

async function main() {
  loadEnv('.env.local');
  loadEnv('.env.production.tmp', true);

  const from = '2026-05-01';
  const to = '2026-06-20';
  const store = 'store2';
  const GAP = 1110;

  const sb = getSupabaseAdmin();
  const rows = await fetchAllPages<Row>(async (offset, pageSize) =>
    sb
      .from('daily_transactions')
      .select(
        'id, notion_page_id, occurred_on, title, amount, category, payment_methods, service_type',
      )
      .eq('store_id', store)
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .range(offset, offset + pageSize - 1),
  );

  const cash = rows.filter(isAiCash);
  const cashSum = sumLedgerAccountBalances(cash).cashOnHand;
  console.log(`\n=== store2 現金 ${from}~${to} ===`);
  console.log(`DB AI 現金: ${cash.length} 筆, $${cashSum}`);
  console.log(`Notion 預期: 149 筆, $41,672 (差 ${149 - cash.length} 筆, $${41672 - cashSum})\n`);

  const cashBases = new Set(
    cash.map((r) => r.notion_page_id?.split('#')[0]).filter(Boolean) as string[],
  );
  console.log(`Notion 差額 vs 現 DB: $${41672 - cashSum}\n`);

  // 1) amount = 1110 or 1100
  const amt1110 = rows.filter(
    (r) =>
      r.amount === GAP ||
      r.amount === -GAP ||
      r.amount === 1100 ||
      r.amount === -1100,
  );
  console.log(`【amount ±${GAP}】${amt1110.length} 筆:`);
  for (const r of amt1110) {
    const tag = isAiCash(r) ? 'AI現金' : '非AI現金';
    console.log(`  [${tag}] ${r.occurred_on} $${r.amount} cat=${r.category} pm=${JSON.stringify(r.payment_methods)}`);
    console.log(`    page=${r.notion_page_id}`);
    console.log(`    ${r.title}`);
  }

  // 2) title 含 1110
  const title1110 = rows.filter((r) => /1110|1,?110/.test(r.title));
  console.log(`\n【title 含 1110】${title1110.length} 筆:`);
  for (const r of title1110) {
    const tag = isAiCash(r) ? 'AI現金' : '非AI現金';
    console.log(`  [${tag}] ${r.occurred_on} $${r.amount} cat=${r.category} pm=${JSON.stringify(r.payment_methods)}`);
    console.log(`    page=${r.notion_page_id} | ${r.title.slice(0, 70)}`);
  }

  // 3) pm 含現金但 AI 排除
  const pmCashExcluded = rows.filter((r) => {
    const pm = r.payment_methods ?? [];
    return pm.includes('現金') && !isAiCash(r);
  });
  console.log(`\n【pm含現金但AI排除】${pmCashExcluded.length} 筆:`);
  for (const r of pmCashExcluded) {
    console.log(`  ${r.occurred_on} $${r.amount} cat=${r.category} page=${r.notion_page_id?.slice(0, 8)}`);
    console.log(`    ${r.title.slice(0, 70)}`);
  }

  // 4) pm 空 + 金額 1110 或標題現金
  const emptyPm = rows.filter((r) => !(r.payment_methods ?? []).length);
  const emptySuspicious = emptyPm.filter(
    (r) =>
      Math.abs(r.amount) === GAP ||
      /1110|1,?110/.test(r.title) ||
      (/現金|現領|支援.*現/.test(r.title) &&
        r.category !== '會員使用' &&
        r.category !== '會員補差額'),
  );
  console.log(`\n【pm空且可疑】${emptySuspicious.length} 筆:`);
  for (const r of emptySuspicious) {
    console.log(`  ${r.occurred_on} $${r.amount} cat=${r.category} type=${r.service_type ?? '-'}`);
    console.log(`    page=${r.notion_page_id}`);
    console.log(`    ${r.title}`);
  }

  // 5) Notion API 比對
  const diag = getNotionKeyDiagnostics();
  if (!diag.configured) {
    console.log('\n【Notion API】金鑰未設定，跳過全量比對');

    const near = rows.filter((r) => r.amount >= 1105 && r.amount <= 1115);
    console.log(`\n【amount 1105~1115】${near.length} 筆:`);
    for (const r of near) {
      const tag = isAiCash(r) ? 'AI現金' : '非AI現金';
      console.log(`  [${tag}] ${r.occurred_on} $${r.amount} cat=${r.category} pm=${JSON.stringify(r.payment_methods)}`);
      console.log(`    page=${r.notion_page_id} | ${r.title}`);
    }

    const nonCashPm = rows.filter((r) => {
      const pm = r.payment_methods ?? [];
      return !isAiCash(r) && (pm.includes('現金') || (!pm.length && /現金/.test(r.title)));
    });
    console.log(`\n【可能 Notion 現金、DB 非 AI 現金】${nonCashPm.length} 筆:`);
    for (const r of nonCashPm) {
      console.log(`  ${r.occurred_on} $${r.amount} cat=${r.category} pm=${JSON.stringify(r.payment_methods)}`);
      console.log(`    page=${r.notion_page_id} | ${r.title.slice(0, 70)}`);
    }

    const all1110 = await sb
      .from('daily_transactions')
      .select('notion_page_id, occurred_on, title, amount, category, payment_methods')
      .eq('store_id', store)
      .eq('amount', GAP);
    console.log(`\n【全期 store2 amount=${GAP}】${all1110.data?.length ?? 0} 筆`);
    for (const r of all1110.data ?? []) {
      console.log(`  ${r.occurred_on} $${r.amount} cat=${r.category} pm=${JSON.stringify(r.payment_methods)}`);
      console.log(`    page=${r.notion_page_id} | ${r.title}`);
    }
    return;
  }

  const notionRows = await queryNotionDatabaseAll(getNotionDailyDbId(store));
  const scoped = notionRows.filter((r) => {
    const d = r.dateStart?.slice(0, 10) ?? '';
    return d >= from && d <= to;
  });

  const notionCash: { pageId: string; date: string; amount: number; title: string; cat: string; pm: string[] }[] = [];
  for (const r of scoped) {
    const tx = mapNotionRowToTransaction(r, store);
    const pm = tx.payment_methods ?? [];
    if (tx.category === '會員使用' || pm.includes('會員使用')) continue;
    if (!pm.includes('現金')) continue;
    notionCash.push({
      pageId: r.pageId,
      date: tx.occurred_on,
      amount: tx.amount,
      title: tx.title.slice(0, 80),
      cat: tx.category,
      pm,
    });
  }
  const notionSum = notionCash.reduce((s, r) => s + r.amount, 0);
  console.log(`\n【Notion API】現金 ${notionCash.length} 筆, $${notionSum}`);

  const dbBases = new Set(
    rows.map((r) => r.notion_page_id?.split('#')[0]).filter(Boolean) as string[],
  );

  const notionOnly = notionCash.filter((n) => !dbBases.has(n.pageId));
  const notionCashNotDbCash = notionCash.filter((n) => !cashBases.has(n.pageId));

  console.log(`\n【Notion 現金、DB 無 page】${notionOnly.length} 筆:`);
  for (const n of notionOnly) {
    console.log(`  ${n.date} $${n.amount} page=${n.pageId}`);
    console.log(`    ${n.title}`);
  }

  console.log(`\n【Notion 算現金、DB 非 AI 現金】${notionCashNotDbCash.length} 筆:`);
  for (const n of notionCashNotDbCash) {
    const db = rows.find((r) => r.notion_page_id?.split('#')[0] === n.pageId);
    console.log(`  Notion: ${n.date} $${n.amount} | ${n.title}`);
    if (db) {
      console.log(
        `  DB:     ${db.occurred_on} $${db.amount} cat=${db.category} pm=${JSON.stringify(db.payment_methods)}`,
      );
    }
  }

  const notion1110 = notionCash.filter((n) => n.amount === GAP || n.amount === -GAP);
  console.log(`\n【Notion 現金 amount=±${GAP}】${notion1110.length} 筆:`);
  for (const n of notion1110) {
    console.log(`  ${n.date} $${n.amount} inDbCash=${cashBases.has(n.pageId)} page=${n.pageId}`);
    console.log(`    ${n.title}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
