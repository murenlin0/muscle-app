import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { NOTION_STORE1_DAILY_DB_ID, queryNotionDatabaseAll } from '../lib/notion-api';
import { stripAllSpaces } from '../lib/phone';

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
  const { data } = await sb
    .from('daily_transactions')
    .select('occurred_on, title, amount, category, payment_methods')
    .eq('store_id', 'store1')
    .ilike('title', '%送500%')
    .order('occurred_on', { ascending: true });

  console.log('=== DB 含「送500」共', data?.length, '筆 ===\n');
  for (const r of data ?? []) {
    const t = stripAllSpaces(r.title);
    const m = t.match(/\+(\d+)送500(?:-(\d+))?、(\d+)VIP/i);
    const note = m
      ? `儲值${m[1]} 用${m[2] ?? '0'} 餘額${m[3]} (儲值+500=${Number(m[1]) + 500})`
      : '';
    console.log(`${r.occurred_on} ${r.category} $${r.amount} [${(r.payment_methods ?? []).join(',')}]`);
    console.log(`  ${r.title}`);
    if (note) console.log(`  → ${note}`);
    console.log();
  }

  const notion = await queryNotionDatabaseAll(NOTION_STORE1_DAILY_DB_ID);
  const n = notion.filter((r) => r.title.includes('送500'));
  console.log('=== Notion 含「送500」共', n.length, '筆 ===\n');
  for (const r of n) {
    const t = stripAllSpaces(r.title);
    const m = t.match(/\+(\d+)送500(?:-(\d+))?、(\d+)VIP/i);
    console.log(`${r.dateStart?.slice(0, 10)} ${r.serviceType} $${r.amount} [${(r.paymentMethods ?? []).join(',')}]`);
    console.log(`  ${r.title}`);
    if (m) {
      const topup = Number(m[1]);
      const bal = Number(m[3]);
      console.log(`  → 餘額${bal} vs 儲值+送點=${topup + 500}${bal === topup + 500 ? ' ✓剛好+500' : ''}`);
    }
    console.log();
  }
}

main().catch(console.error);
