/**
 * 稽核：會員相關異常格式 + Notion vs DB 富邦差額
 * npx tsx scripts/audit-member-fubon.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { primaryLedgerAccount } from '../lib/ledger-accounts';
import { normalizeLedgerAmount } from '../lib/ledger-amount';
import { isMultiStaffCompoundTitle } from '../lib/multi-staff-split';
import { mapNotionRowToTransaction } from '../lib/notion-daily-import';
import type { TransactionCategory } from '../lib/transaction-category';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

type Tx = {
  id: string;
  notion_page_id: string | null;
  occurred_on: string;
  title: string;
  amount: number;
  category: string;
  payment_methods: string[];
  staff_name: string | null;
  client_name: string | null;
  client_phone: string | null;
};

const MEMBER_CATS = new Set(['會員儲值', '會員使用', '會員補差額']);
const BANK_ALIASES = new Set(['富邦', 'Line', '街口', '仁中信', '轉帳', 'line']);

function notionBankSum(amount: number, pm: string[]): number {
  if (pm.some((p) => BANK_ALIASES.has(p) || BANK_ALIASES.has(p.toLowerCase()))) return amount;
  return 0;
}

function notionCashSum(amount: number, pm: string[]): number {
  return pm.includes('現金') ? amount : 0;
}

function dbBankSum(cat: TransactionCategory, amount: number, pm: string[]): number {
  const acc = primaryLedgerAccount(pm, cat);
  if (acc !== '富邦') return 0;
  return normalizeLedgerAmount(cat, amount);
}

function dbCashSum(cat: TransactionCategory, amount: number, pm: string[]): number {
  const acc = primaryLedgerAccount(pm, cat);
  if (acc !== '現金') return 0;
  return normalizeLedgerAmount(cat, amount);
}

async function fetchAllDb(): Promise<Tx[]> {
  const sb = getSupabaseAdmin();
  const all: Tx[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select(
        'id, notion_page_id, occurred_on, title, amount, category, payment_methods, staff_name, client_name, client_phone',
      )
      .eq('store_id', 'store1')
      .order('occurred_on', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as Tx[]));
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

function auditMemberFormats(rows: Tx[]) {
  const issues: { kind: string; count: number; samples: string[] }[] = [];
  const add = (kind: string, row: Tx, extra = '') => {
    let bucket = issues.find((i) => i.kind === kind);
    if (!bucket) {
      bucket = { kind, count: 0, samples: [] };
      issues.push(bucket);
    }
    bucket.count += 1;
    if (bucket.samples.length < 5) {
      bucket.samples.push(
        `${row.occurred_on} | ${row.category} | $${row.amount} | ${row.title.slice(0, 60)}${extra}`,
      );
    }
  };

  const byNotionBase = new Map<string, Tx[]>();
  const byTitleDate = new Map<string, Tx[]>();

  for (const r of rows) {
    const cat = r.category;

    if (isMultiStaffCompoundTitle(r.title)) {
      add('多人合寫未拆分', r);
    }

    if (MEMBER_CATS.has(cat)) {
      if (/[、.,·].+[、.,·]/.test(r.title.replace(/\d+分/g, '')) && /\+?\d+送?\d*-/.test(r.title)) {
        if (isMultiStaffCompoundTitle(r.title)) {
          /* already flagged */
        } else if (/[、.](湘|仁|杰恩|錦)/.test(r.title) && r.title.includes('VIP')) {
          add('疑似多人合寫但未匹配', r);
        }
      }

      if (cat === '會員使用' && r.payment_methods.length > 0) {
        add('會員使用卻有帳戶', r, ` [${r.payment_methods.join(',')}]`);
      }

      if (cat === '會員儲值' && r.payment_methods.length === 0) {
        add('會員儲值無帳戶', r);
      }

      if (cat === '會員儲值' && r.amount <= 0) {
        add('會員儲值金額非正', r);
      }

      if (cat === '會員使用' && r.amount < 0) {
        add('會員使用金額為負', r);
      }

      if (r.title.includes('送') && cat === '會員儲值' && !/送\d+/.test(r.title.replace(/\s/g, ''))) {
        add('儲值標題送點格式異常', r);
      }
    }

    if (r.notion_page_id) {
      const base = r.notion_page_id.split('#')[0];
      const list = byNotionBase.get(base) ?? [];
      list.push(r);
      byNotionBase.set(base, list);
    }

    const tdKey = `${r.occurred_on}|${r.title.replace(/\s/g, '')}`;
    const tdList = byTitleDate.get(tdKey) ?? [];
    tdList.push(r);
    byTitleDate.set(tdKey, tdList);
  }

  for (const [base, list] of byNotionBase) {
    if (list.length > 3) {
      const sample = list[0];
      add('同一 Notion 列拆超過 3 筆', sample, ` (${list.length} rows, base=${base.slice(0, 8)}…)`);
    }
  }

  for (const [, list] of byTitleDate) {
    if (list.length > 1 && MEMBER_CATS.has(list[0].category)) {
      add('同日同標題重複', list[0], ` (×${list.length})`);
    }
  }

  const legacyTransfer = rows.filter((r) => r.category === '轉移');
  if (legacyTransfer.length) {
    add('仍有舊類型「轉移」', legacyTransfer[0], ` (共 ${legacyTransfer.length} 筆)`);
  }

  return issues.sort((a, b) => b.count - a.count);
}

async function main() {
  loadEnv();
  const dbRows = await fetchAllDb();
  const from = '2024-03-16';
  const scoped = dbRows.filter((r) => r.occurred_on >= from);

  let dbCash = 0;
  let dbBank = 0;
  let notionStyleCash = 0;
  let notionStyleBank = 0;

  for (const r of scoped) {
    const cat = r.category as TransactionCategory;
    dbCash += dbCashSum(cat, r.amount, r.payment_methods ?? []);
    dbBank += dbBankSum(cat, r.amount, r.payment_methods ?? []);
    notionStyleCash += notionCashSum(r.amount, r.payment_methods ?? []);
    notionStyleBank += notionBankSum(r.amount, r.payment_methods ?? []);
  }

  console.log('=== DB 餘額 (from 2024-03-16) ===');
  console.log(`rows: ${scoped.length}`);
  console.log(`現金 (app算法): ${dbCash}`);
  console.log(`富邦 (app算法): ${dbBank}`);
  console.log(`現金 (Notion raw加總): ${notionStyleCash}`);
  console.log(`富邦 (Notion raw加總): ${notionStyleBank}`);
  console.log(`目標 Notion: 現金 16398, 富邦 119947`);
  console.log(`差額 富邦: ${dbBank - 119947} (app) / ${notionStyleBank - 119947} (raw)`);

  console.log('\n=== 會員相關格式異常 ===');
  const issues = auditMemberFormats(scoped);
  if (!issues.length) console.log('(無)');
  for (const i of issues) {
    console.log(`\n[${i.kind}] ×${i.count}`);
    for (const s of i.samples) console.log(`  · ${s}`);
  }

  // Notion API comparison
  if (!process.env.NOTION_API_KEY) {
    console.log('\n(略過 Notion API：無 NOTION_API_KEY)');
    return;
  }

  console.log('\n=== Notion API 比對 ===');
  const notionRows = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const notionScoped = notionRows.filter((r) => {
    const d = r.dateStart?.slice(0, 10) ?? r.lastEdited?.slice(0, 10) ?? '';
    return d >= from;
  });

  let nCash = 0;
  let nBank = 0;
  for (const r of notionScoped) {
    nCash += notionCashSum(r.amount, r.paymentMethods ?? []);
    nBank += notionBankSum(r.amount, r.paymentMethods ?? []);
  }
  console.log(`Notion 列數 (from ${from}): ${notionScoped.length}`);
  console.log(`Notion 現金: ${nCash}, 富邦: ${nBank}`);

  // Map notion → expected DB rows (with expand)
  const mapped: { pageId: string; title: string; amount: number; category: string; pm: string[]; bank: number }[] = [];
  for (const r of notionScoped) {
    const tx = mapNotionRowToTransaction(r, 'store1');
    // simulate expand without DB
    if (isMultiStaffCompoundTitle(tx.title)) {
      const { splitMultiStaffTransaction } = await import('../lib/multi-staff-split');
      const split = splitMultiStaffTransaction(tx);
      if (split) {
        for (const s of split) {
          mapped.push({
            pageId: `${r.pageId}#${s.staff_name}`,
            title: s.title,
            amount: s.amount,
            category: s.category,
            pm: s.payment_methods,
            bank: dbBankSum(s.category as TransactionCategory, s.amount, s.payment_methods),
          });
        }
        continue;
      }
    }
    mapped.push({
      pageId: r.pageId,
      title: tx.title,
      amount: tx.amount,
      category: tx.category,
      pm: tx.payment_methods,
      bank: dbBankSum(tx.category as TransactionCategory, tx.amount, tx.payment_methods),
    });
  }

  let mappedBank = mapped.reduce((s, m) => s + m.bank, 0);
  console.log(`匯入邏輯展開後列數: ${mapped.length}, 富邦(app): ${mappedBank}`);
  console.log(`DB vs 匯入邏輯 富邦差: ${dbBank - mappedBank}`);

  // notion_page_id in DB
  const dbByNotion = new Map<string, Tx[]>();
  for (const r of scoped) {
    if (!r.notion_page_id) continue;
    const base = r.notion_page_id.split('#')[0];
    const list = dbByNotion.get(base) ?? [];
    list.push(r);
    dbByNotion.set(base, list);
  }

  const notionById = new Map(notionScoped.map((r) => [r.pageId, r]));

  let missingInDb = 0;
  let extraInDb = 0;
  let bankDiffFromNotion = 0;
  const bigDiffs: string[] = [];

  for (const r of notionScoped) {
    const dbList = dbByNotion.get(r.pageId) ?? [];
    if (!dbList.length) {
      missingInDb += 1;
      const tx = mapNotionRowToTransaction(r, 'store1');
      bankDiffFromNotion -= dbBankSum(
        tx.category as TransactionCategory,
        tx.amount,
        tx.payment_methods,
      );
      if (bigDiffs.length < 8) {
        bigDiffs.push(`缺列 ${r.dateStart?.slice(0, 10)} $${r.amount} ${r.title.slice(0, 50)}`);
      }
    }
  }

  for (const [pageId, list] of dbByNotion) {
    if (!notionById.has(pageId) && !pageId.includes('#')) {
      extraInDb += list.length;
      for (const r of list) {
        bankDiffFromNotion += dbBankSum(
          r.category as TransactionCategory,
          r.amount,
          r.payment_methods ?? [],
        );
      }
      if (bigDiffs.length < 12) {
        const r = list[0];
        bigDiffs.push(`DB多餘 ${r.occurred_on} $${r.amount} ${r.title.slice(0, 50)} (×${list.length})`);
      }
    }
  }

  // Per-notion-page bank diff
  const pageBankDiffs: { pageId: string; diff: number; note: string }[] = [];
  for (const r of notionScoped) {
    const tx = mapNotionRowToTransaction(r, 'store1');
    let expectedBank = dbBankSum(
      tx.category as TransactionCategory,
      tx.amount,
      tx.payment_methods,
    );

    if (isMultiStaffCompoundTitle(tx.title)) {
      const { splitMultiStaffTransaction } = await import('../lib/multi-staff-split');
      const split = splitMultiStaffTransaction(tx);
      if (split) {
        expectedBank = split.reduce(
          (s, x) => s + dbBankSum(x.category as TransactionCategory, x.amount, x.payment_methods),
          0,
        );
      }
    }

    const dbList = dbByNotion.get(r.pageId) ?? [];
    const actualBank = dbList.reduce(
      (s, row) =>
        s + dbBankSum(row.category as TransactionCategory, row.amount, row.payment_methods ?? []),
      0,
    );
    const diff = actualBank - expectedBank;
    if (Math.abs(diff) > 0.5) {
      pageBankDiffs.push({
        pageId: r.pageId,
        diff,
        note: `${r.dateStart?.slice(0, 10)} ${r.title.slice(0, 45)} notion$${r.amount} db$${dbList.reduce((a, x) => a + x.amount, 0)}`,
      });
    }
  }

  pageBankDiffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  console.log(`\nNotion 列在 DB 找不到: ${missingInDb}`);
  console.log(`DB 有但 Notion 無的 base page: ${extraInDb} 列`);
  console.log(`\n富邦差異最大的 Notion 列 (前 20):`);
  let sumPageDiff = 0;
  for (const p of pageBankDiffs.slice(0, 20)) {
    sumPageDiff += p.diff;
    console.log(`  Δ${p.diff} | ${p.note}`);
  }
  console.log(`前20頁差額合計: ${sumPageDiff}`);
  console.log(`全部頁面差額合計: ${pageBankDiffs.reduce((s, p) => s + p.diff, 0)}`);

  // Category breakdown of 富邦 diff
  console.log('\n=== 富邦 by category (DB app算法) ===');
  const byCat = new Map<string, number>();
  for (const r of scoped) {
    const b = dbBankSum(r.category as TransactionCategory, r.amount, r.payment_methods ?? []);
    if (b === 0) continue;
    byCat.set(r.category, (byCat.get(r.category) ?? 0) + b);
  }
  for (const [k, v] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
