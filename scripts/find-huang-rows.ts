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
  const { data: db } = await sb
    .from('daily_transactions')
    .select('*')
    .eq('store_id', 'store1')
    .ilike('title', '%黃昶凱%');

  console.log('=== DB ===');
  for (const r of db ?? []) {
    console.log(JSON.stringify({
      id: r.id,
      notion_page_id: r.notion_page_id,
      occurred_on: r.occurred_on,
      title: r.title,
      amount: r.amount,
      category: r.category,
      payment_methods: r.payment_methods,
      staff_name: r.staff_name,
    }));
  }

  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const hits = notion.filter((r) => r.title.includes('黃昶凱') || r.title.includes('0967156608'));
  console.log('\n=== Notion ===');
  for (const r of hits) {
    console.log(JSON.stringify({
      pageId: r.pageId,
      dateStart: r.dateStart,
      title: r.title,
      amount: r.amount,
      serviceType: r.serviceType,
      paymentMethods: r.paymentMethods,
      staffName: r.staffName,
    }));
  }
}

main().catch(console.error);
