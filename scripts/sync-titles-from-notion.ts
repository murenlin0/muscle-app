/**
 * 從 Notion 還原標題到 DB（僅更新 title，不動金額／帳戶／類型）
 *
 * 使用方式：
 *   1. 請先在 Notion 手動還原被改過的頁面標題
 *   2. npx tsx scripts/sync-titles-from-notion.ts --dry-run   （預覽）
 *   3. npx tsx scripts/sync-titles-from-notion.ts             （寫入 DB）
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';

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
  const storeId = 'store1';

  console.log('載入 Notion…');
  const notionRows = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const notionByPage = new Map(notionRows.map((r) => [r.pageId, r.title.trim()]));

  const sb = getSupabaseAdmin();
  const all: { id: string; notion_page_id: string; title: string; occurred_on: string }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('id, notion_page_id, title, occurred_on')
      .eq('store_id', storeId)
      .not('notion_page_id', 'is', null)
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }

  const pending: {
    id: string;
    pageId: string;
    date: string;
    dbTitle: string;
    notionTitle: string;
  }[] = [];

  for (const row of all) {
    const pageId = row.notion_page_id.split('#')[0];
    const notionTitle = notionByPage.get(pageId);
    if (!notionTitle) continue;

    const dbTitle = row.title.trim();
    if (dbTitle === notionTitle) continue;

    pending.push({
      id: row.id,
      pageId,
      date: row.occurred_on,
      dbTitle,
      notionTitle,
    });
  }

  console.log(`\nDB 列 ${all.length}，Notion 頁 ${notionRows.length}`);
  console.log(`${dryRun ? '將更新' : '已更新'} ${pending.length} 筆標題\n`);

  const preview = pending.slice(0, 15);
  for (const p of preview) {
    console.log(`${p.date}`);
    console.log(`  DB    ${p.dbTitle.slice(0, 72)}`);
    console.log(`  Notion ${p.notionTitle.slice(0, 72)}\n`);
  }
  if (pending.length > preview.length) {
    console.log(`…另有 ${pending.length - preview.length} 筆\n`);
  }

  if (dryRun || pending.length === 0) return;

  let ok = 0;
  for (const p of pending) {
    const { error } = await sb
      .from('daily_transactions')
      .update({
        title: p.notionTitle,
        updated_at: new Date().toISOString(),
      })
      .eq('id', p.id)
      .eq('store_id', storeId);
    if (error) throw new Error(error.message);
    ok += 1;
  }
  console.log(`完成：${ok} 筆 DB 標題已改為 Notion 現況（金額未動）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
