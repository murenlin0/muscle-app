/**
 * 將 貴董、約翰 統一為 錦（Notion + DB）
 * npx tsx scripts/fix-staff-aliases-jin.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import {
  buildNotionStaffUpdate,
  buildNotionTitleUpdate,
  NOTION_STORE1_DAILY_DB_ID,
  queryNotionDatabaseAll,
  updateNotionPageProperties,
} from '../lib/notion-api';
import {
  normalizeStaffName,
  normalizeStaffPrefixInTitle,
  STAFF_NAME_ALIASES,
} from '../lib/notion-title-normalize';

function normalizeStaffTitleOnly(title: string): string {
  return normalizeStaffPrefixInTitle(title.trim());
}

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const ALIAS_SET = new Set(Object.keys(STAFF_NAME_ALIASES));
const CANONICAL = '錦';

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const dryRun = process.argv.includes('--dry-run');

  let notionTitle = 0;
  let notionStaff = 0;

  console.log('掃描 Notion…');
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  for (const row of notion) {
    const newTitle = normalizeStaffTitleOnly(row.title);
    const newStaff = normalizeStaffName(row.staffName);
    const props: Record<string, unknown> = {};

    if (newTitle !== row.title.trim()) {
      Object.assign(props, buildNotionTitleUpdate(newTitle));
      notionTitle += 1;
    }
    if (newStaff && row.staffName && newStaff !== row.staffName.trim()) {
      Object.assign(props, buildNotionStaffUpdate(newStaff));
      notionStaff += 1;
    }

    if (Object.keys(props).length && !dryRun) {
      await updateNotionPageProperties(row.pageId, props);
    }
  }
  console.log(`Notion 標題 ${notionTitle} 筆、師傅欄 ${notionStaff} 筆${dryRun ? ' (dry-run)' : ' 已更新'}`);

  const { data: dbRows } = await sb
    .from('daily_transactions')
    .select('id, title, staff_name')
    .eq('store_id', 'store1');

  let dbTitle = 0;
  let dbStaff = 0;
  for (const row of dbRows ?? []) {
    const newTitle = normalizeStaffTitleOnly(row.title);
    const newStaff = normalizeStaffName(row.staff_name) ?? row.staff_name;
    const titleChanged = newTitle !== row.title.trim();
    const staffChanged = Boolean(newStaff && row.staff_name && newStaff !== row.staff_name.trim());

    if (!titleChanged && !staffChanged) continue;
    if (titleChanged) dbTitle += 1;
    if (staffChanged) dbStaff += 1;

    if (!dryRun) {
      const { error } = await sb
        .from('daily_transactions')
        .update({
          ...(titleChanged ? { title: newTitle } : {}),
          ...(staffChanged ? { staff_name: newStaff } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (error) throw new Error(error.message);
    }
  }
  console.log(`DB 標題 ${dbTitle} 筆、師傅欄 ${dbStaff} 筆${dryRun ? ' (dry-run)' : ' 已更新'}`);

  const { data: staffRows } = await sb.from('staff').select('id, name').in('name', [...ALIAS_SET]);
  if (staffRows?.length) {
    console.log(`staff 表別名列: ${staffRows.map((s) => s.name).join(', ')}`);
    if (!dryRun) {
      for (const s of staffRows) {
        if (s.name === CANONICAL) continue;
        const { data: existing } = await sb.from('staff').select('id').eq('name', CANONICAL).maybeSingle();
        if (existing) {
          await sb.from('daily_transactions').update({ staff_name: CANONICAL }).eq('staff_name', s.name);
          await sb.from('staff').delete().eq('id', s.id);
          console.log(`  合併刪除 staff「${s.name}」→ 錦`);
        } else {
          await sb.from('staff').update({ name: CANONICAL }).eq('id', s.id);
          console.log(`  staff「${s.name}」→ 錦`);
        }
      }
    }
  } else {
    console.log('staff 表無 貴董/約翰 列');
  }

  const remainTitle = (dbRows ?? []).filter((r) => normalizeStaffTitleOnly(r.title) !== r.title.trim()).length;
  const remainStaff = (dbRows ?? []).filter(
    (r) => r.staff_name && ALIAS_SET.has(r.staff_name.trim()),
  ).length;
  if (!dryRun) {
    console.log(`\n殘留 DB 舊標題 ${remainTitle}、舊師傅欄 ${remainStaff}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
