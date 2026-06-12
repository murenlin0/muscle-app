import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { STAFF_NAME_ALIASES, normalizeStaffPrefixInTitle } from '../lib/notion-title-normalize';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const ALIASES = Object.keys(STAFF_NAME_ALIASES);

function needsFixTitle(title: string): boolean {
  return normalizeStaffPrefixInTitle(title) !== title.trim();
}

function needsFixStaff(name: string | null | undefined): boolean {
  if (!name) return false;
  return ALIASES.includes(name.trim());
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const { data: db } = await sb
    .from('daily_transactions')
    .select('id, notion_page_id, title, staff_name')
    .eq('store_id', 'store1');

  const dbTitle = (db ?? []).filter((r) => needsFixTitle(r.title));
  const dbStaff = (db ?? []).filter((r) => needsFixStaff(r.staff_name));
  console.log('DB 標題需改', dbTitle.length);
  console.log('DB 師傅欄需改', dbStaff.length);
  for (const r of dbTitle.slice(0, 8)) console.log('  title', r.title);

  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const nTitle = notion.filter((r) => needsFixTitle(r.title));
  const nStaff = notion.filter((r) => needsFixStaff(r.staffName));
  console.log('\nNotion 標題需改', nTitle.length);
  console.log('Notion 師傅欄需改', nStaff.length);
  for (const r of nTitle.slice(0, 8)) console.log('  title', r.title, 'staff', r.staffName);
}

main().catch(console.error);
