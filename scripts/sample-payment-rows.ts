/** 取樣 仁中信/街口/Line 的 Notion 與 DB 實際列 */
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
  const sb = getSupabaseAdmin();
  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);

  const db: any[] = [];
  let o = 0;
  for (;;) {
    const { data } = await sb
      .from('daily_transactions')
      .select('notion_page_id, occurred_on, title, amount, category, payment_methods')
      .eq('store_id', 'store1')
      .range(o, o + 999);
    if (!data?.length) break;
    db.push(...data);
    if (data.length < 1000) break;
    o += 1000;
  }
  const dbByPage = new Map<string, any[]>();
  for (const r of db) {
    const pid = r.notion_page_id?.split('#')[0]?.split(':')[0];
    if (!pid) continue;
    const arr = dbByPage.get(pid) ?? [];
    arr.push(r);
    dbByPage.set(pid, arr);
  }

  for (const target of ['仁中信', '街口', 'Line']) {
    const rows = notion.filter((r) => r.paymentMethods.some((p) => p === target || p.toLowerCase() === target.toLowerCase()));
    console.log(`\n========== ${target}（Notion ${rows.length} 筆，示範前 6）==========`);
    for (const r of rows.slice(0, 6)) {
      console.log(`\n[Notion] ${r.dateStart} 金額數字=${r.amount} 付款=${r.paymentMethods.join(',')} 類型=${r.serviceType}`);
      console.log(`         標題: ${r.title}`);
      const dbr = dbByPage.get(r.pageId) ?? [];
      for (const d of dbr) {
        console.log(`  [DB]   ${d.occurred_on} 金額=${d.amount} 帳戶=${(d.payment_methods ?? []).join(',') || '(空)'} 類型=${d.category}`);
      }
    }
  }
}

main().catch(console.error);
