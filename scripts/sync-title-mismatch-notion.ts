/**
 * 將 DB 已修正的合寫標題同步回 Notion（先前 fix-title-mismatch-db 僅改 DB）
 * npx tsx scripts/sync-title-mismatch-notion.ts [--dry-run]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import {
  isCompoundVipTitle,
  titleMatchesRowAttributes,
} from '../lib/ledger-title-fix';
import {
  buildNotionTitleUpdate,
  NOTION_STORE1_DAILY_DB_ID,
  queryNotionDatabaseAll,
  updateNotionPageProperties,
} from '../lib/notion-api';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const sb = getSupabaseAdmin();

  console.log('載入 Notion…');
  const notionRows = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const notionByPage = new Map(notionRows.map((r) => [r.pageId, r]));

  const all: {
    id: string;
    notion_page_id: string | null;
    title: string;
    amount: number;
    category: string;
    payment_methods: string[];
    staff_name: string | null;
    client_name: string | null;
    client_phone: string | null;
  }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select(
        'id, notion_page_id, title, amount, category, payment_methods, staff_name, client_name, client_phone',
      )
      .eq('store_id', 'store1')
      .in('category', ['會員使用', '會員儲值', '會員補差額'])
      .not('notion_page_id', 'is', null)
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }

  let synced = 0;
  let skippedNoPage = 0;
  let skippedOk = 0;
  let skippedBadDb = 0;

  for (const row of all) {
    const pageId = row.notion_page_id?.split('#')[0];
    if (!pageId) continue;

    const notion = notionByPage.get(pageId);
    if (!notion) {
      skippedNoPage += 1;
      continue;
    }

    const dbTitle = row.title.trim();
    const notionTitle = notion.title.trim();
    if (dbTitle === notionTitle) {
      skippedOk += 1;
      continue;
    }

    if (!isCompoundVipTitle(dbTitle) && !isCompoundVipTitle(notionTitle)) {
      skippedOk += 1;
      continue;
    }

    if (!titleMatchesRowAttributes(row)) {
      skippedBadDb += 1;
      console.warn(`略過 DB 標題仍不符屬性: ${row.id} ${dbTitle.slice(0, 50)}`);
      continue;
    }

    if (!dryRun) {
      await updateNotionPageProperties(pageId, buildNotionTitleUpdate(dbTitle));
    }
    synced += 1;
    if (synced <= 5) {
      console.log(`  ${notionTitle.slice(0, 45)} → ${dbTitle.slice(0, 45)}`);
    }
  }

  console.log(
    `${dryRun ? '將同步' : '已同步'} Notion ${synced} 頁；` +
      `已一致 ${skippedOk}、無 Notion 頁 ${skippedNoPage}、DB 未修正略過 ${skippedBadDb}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
