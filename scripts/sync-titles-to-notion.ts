/**
 * 反向同步：把 DB 已修正的會員標題寫回 Notion（名稱電話 欄位）
 *   npx tsx scripts/sync-titles-to-notion.ts            # dry-run，列出差異
 *   npx tsx scripts/sync-titles-to-notion.ts --apply    # 實際寫回 Notion
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
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
  const apply = process.argv.includes('--apply');
  const sb = getSupabaseAdmin();

  console.log('載入 Notion…');
  const notionRows = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const notionByPage = new Map(notionRows.map((r) => [r.pageId, r.title.trim()]));

  const all: { id: string; notion_page_id: string | null; title: string; occurred_on: string; category: string }[] = [];
  let o = 0;
  for (;;) {
    const { data, error } = await sb
      .from('daily_transactions')
      .select('id, notion_page_id, title, occurred_on, category')
      .eq('store_id', 'store1')
      .in('category', ['會員使用', '會員儲值', '會員補差額'])
      .not('notion_page_id', 'is', null)
      .range(o, o + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }

  // 以 Notion pageId 聚合（合寫列共用同一頁，標題應一致）
  const byPage = new Map<string, { title: string; occurred_on: string; ids: string[]; conflict: boolean }>();
  for (const row of all) {
    const pageId = row.notion_page_id?.split('#')[0];
    if (!pageId) continue;
    const dbTitle = row.title.trim();
    const existing = byPage.get(pageId);
    if (!existing) {
      byPage.set(pageId, { title: dbTitle, occurred_on: row.occurred_on, ids: [row.id], conflict: false });
    } else {
      existing.ids.push(row.id);
      if (existing.title !== dbTitle) existing.conflict = true;
    }
  }

  const toSync: { pageId: string; from: string; to: string; occurred_on: string }[] = [];
  const conflicts: { pageId: string; occurred_on: string; ids: string[] }[] = [];
  let skippedNoPage = 0;
  let skippedSame = 0;

  for (const [pageId, info] of byPage) {
    const notionTitle = notionByPage.get(pageId);
    if (notionTitle === undefined) {
      skippedNoPage += 1;
      continue;
    }
    if (info.conflict) {
      conflicts.push({ pageId, occurred_on: info.occurred_on, ids: info.ids });
      continue;
    }
    if (notionTitle === info.title) {
      skippedSame += 1;
      continue;
    }
    toSync.push({ pageId, from: notionTitle, to: info.title, occurred_on: info.occurred_on });
  }

  toSync.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));

  const lines: string[] = [];
  lines.push(`會員列(含notion頁): ${all.length}，Notion 頁: ${byPage.size}`);
  lines.push(`需同步: ${toSync.length}，已一致: ${skippedSame}，Notion查無此頁: ${skippedNoPage}，DB同頁標題衝突: ${conflicts.length}`);
  lines.push('');
  for (const s of toSync) {
    lines.push(`${s.occurred_on}`);
    lines.push(`  Notion舊: ${s.from}`);
    lines.push(`  DB  新: ${s.to}`);
  }
  if (conflicts.length) {
    lines.push('\n--- 同頁多列標題不一致(需檢查) ---');
    for (const c of conflicts) lines.push(`${c.occurred_on} page=${c.pageId} ids=${c.ids.join(',')}`);
  }
  writeFileSync(resolve(process.cwd(), 'sync-to-notion-report.txt'), lines.join('\n'), 'utf8');

  console.log(lines[0]);
  console.log(lines[1]);
  console.log('報告寫入 sync-to-notion-report.txt');

  if (!apply) {
    console.log('(dry-run，加 --apply 寫回 Notion)');
    return;
  }

  let done = 0;
  for (const s of toSync) {
    try {
      await updateNotionPageProperties(s.pageId, buildNotionTitleUpdate(s.to));
      done += 1;
      if (done % 20 === 0) console.log(`  synced ${done}/${toSync.length}`);
    } catch (e) {
      console.error(`  失敗 ${s.pageId}:`, (e as Error).message);
    }
  }
  console.log(`已同步 Notion ${done}/${toSync.length} 頁`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
