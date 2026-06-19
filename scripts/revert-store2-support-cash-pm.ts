/**
 * 還原 store2 被 backfill-store2-support-cash-pm 誤補的 payment_methods。
 * 條件：支援現金標題 + DB 僅 ['現金'] + Notion「使用位置」空白。
 *
 * 預覽：npx tsx scripts/revert-store2-support-cash-pm.ts
 * 執行：npx tsx scripts/revert-store2-support-cash-pm.ts --apply
 *
 * 正式 DB（擇一）：
 *   npx vercel env run --environment=production -- npx tsx scripts/revert-store2-support-cash-pm.ts
 *   npx vercel env run --environment=production -- npx tsx scripts/revert-store2-support-cash-pm.ts --apply
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { fetchAllPages } from '../lib/supabase-paginate';
import { readNotionTokenFromEnv } from '../lib/notion-api';

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

const SUPPORT_CASH_TITLE = /支援.*現金|現金領|支援領現|現領工資/;
const NOTION_VERSION = '2022-06-28';

function selectName(prop: { select?: { name: string } | null } | undefined): string | null {
  return prop?.select?.name ?? null;
}

async function fetchNotionLocation(pageId: string, token: string): Promise<string | null> {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
    },
  });
  if (!res.ok) throw new Error(`Notion GET ${pageId}: ${res.status} ${await res.text()}`);
  const page = (await res.json()) as { properties?: Record<string, unknown> };
  const loc = page.properties?.['使用位置'] as
    | { select?: { name: string } | null }
    | undefined;
  return selectName(loc);
}

async function main() {
  loadEnv('.env.local');
  loadEnv('.env.production.tmp', true);

  const apply = process.argv.includes('--apply');
  const pageIdArg = process.argv.find((a, i) => process.argv[i - 1] === '--page-id');
  const notionToken = readNotionTokenFromEnv();

  const sb = getSupabaseAdmin();
  const rows = await fetchAllPages<{
    id: string;
    notion_page_id: string | null;
    occurred_on: string;
    title: string;
    amount: number;
    payment_methods: string[] | null;
  }>(async (offset, pageSize) =>
    sb
      .from('daily_transactions')
      .select('id, notion_page_id, occurred_on, title, amount, payment_methods')
      .eq('store_id', 'store2')
      .gte('occurred_on', '2026-05-01')
      .lte('occurred_on', '2026-06-20')
      .range(offset, offset + pageSize - 1),
  );

  let toRevert: typeof rows = [];

  if (pageIdArg) {
    const row = rows.find((r) => r.notion_page_id?.split('#')[0] === pageIdArg);
    if (!row) {
      console.error(`找不到 notion_page_id=${pageIdArg}`);
      process.exit(1);
    }
    if (
      JSON.stringify(row.payment_methods ?? []) !== JSON.stringify(['現金']) ||
      !SUPPORT_CASH_TITLE.test(row.title ?? '')
    ) {
      console.error('此列不符合還原條件（需 pm=["現金"] 且為支援現金標題）');
      process.exit(1);
    }
    toRevert = [row];
    console.log('【指定 page-id 模式】略過 Notion 比對（請自行確認使用位置為空）');
  } else {
    if (!notionToken) {
      console.error(
        '缺少 NOTION_API_KEY。請設定後再執行，或使用 --page-id <notion_page_id> 還原已確認的單筆。',
      );
      process.exit(1);
    }

    const candidates = rows.filter(
      (r) =>
        (r.payment_methods ?? []).length === 1 &&
        (r.payment_methods ?? [])[0] === '現金' &&
        SUPPORT_CASH_TITLE.test(r.title ?? ''),
    );

    for (const r of candidates) {
      const pageId = r.notion_page_id?.split('#')[0];
      if (!pageId) continue;
      const loc = await fetchNotionLocation(pageId, notionToken);
      if (!loc) toRevert.push(r);
    }
  }

  console.log(`\n${apply ? '【套用】' : '【預覽】'} 待還原 payment_methods → []：${toRevert.length} 筆\n`);
  for (const r of toRevert) {
    console.log(
      `  ${r.occurred_on} $${r.amount} page=${r.notion_page_id} id=${r.id}`,
    );
    console.log(`    ${r.title}`);
    if (apply) {
      const { error } = await sb
        .from('daily_transactions')
        .update({ payment_methods: [] })
        .eq('id', r.id);
      if (error) throw error;
    }
  }

  if (!apply && toRevert.length) {
    console.log('\n確認後加上 --apply 執行還原。');
  } else if (apply) {
    console.log('\n還原完成。');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
