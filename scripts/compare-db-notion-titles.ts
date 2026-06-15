/** 比對 DB 與 Notion 標題是否一致 */
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
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const byPage = new Map(notion.map((r) => [r.pageId, r.title.trim()]));

  const sb = getSupabaseAdmin();
  const all: { notion_page_id: string; title: string }[] = [];
  let o = 0;
  while (true) {
    const { data } = await sb
      .from('daily_transactions')
      .select('notion_page_id, title')
      .eq('store_id', 'store1')
      .not('notion_page_id', 'is', null)
      .range(o, o + 999);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }

  let same = 0;
  let diff = 0;
  const samples: string[] = [];
  for (const row of all) {
    const pageId = row.notion_page_id?.split('#')[0];
    if (!pageId) continue;
    const nTitle = byPage.get(pageId);
    if (!nTitle) continue;
    if (row.title.trim() === nTitle) same += 1;
    else {
      diff += 1;
      if (samples.length < 5) {
        samples.push(`DB: ${row.title.slice(0, 50)}\nNotion: ${nTitle.slice(0, 50)}`);
      }
    }
  }
  console.log(`DB/Notion 標題一致 ${same}、不一致 ${diff}`);
  for (const s of samples) console.log('\n' + s);
}

main().catch(console.error);
