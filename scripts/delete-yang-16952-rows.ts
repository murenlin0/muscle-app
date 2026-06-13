/**
 * 刪除 09113016952（電話多打 2）相關列：Notion 封存 + DB 刪除
 * npx tsx scripts/delete-yang-16952-rows.ts          # dry-run
 * npx tsx scripts/delete-yang-16952-rows.ts --apply
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { archiveNotionPage } from '../lib/notion-api';

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

  const { data } = await sb
    .from('daily_transactions')
    .select('id, notion_page_id, occurred_on, title, amount, category')
    .eq('store_id', 'store1')
    .ilike('title', '%09113016952%');

  console.log(`找到 ${data?.length ?? 0} 筆含 09113016952`);
  for (const r of data ?? []) {
    console.log(`${apply ? '刪除' : '[dry]'} ${r.occurred_on} [${r.category}] $${r.amount} page=${r.notion_page_id}`);
    console.log(`  ${r.title}`);
    if (!apply) continue;
    if (r.notion_page_id) await archiveNotionPage(r.notion_page_id);
    const { error } = await sb.from('daily_transactions').delete().eq('id', r.id);
    if (error) console.error('  DB 失敗:', error.message);
    else console.log('  ✓ Notion+DB 已刪');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
