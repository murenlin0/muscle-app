/**
 * 修正 2026-05-02 黃昶凱三筆同標題誤寫
 * npx tsx scripts/fix-huang-20260502-titles.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseNotionNamePhone } from '../lib/phone';
import { getSupabaseAdmin } from '../lib/supabase';
import { buildNotionTitleUpdate, updateNotionPageProperties } from '../lib/notion-api';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const OLD_TITLE = '湘120分現金3000富邦1000-1900、2100VIP黃昶凱0967156608';
const VIP = 'VIP黃昶凱0967156608';

const FIXES = [
  {
    notion_page_id: '35607d21-c964-80c5-8843-fe90a107bd45',
    newTitle: `湘120分-1900、2100${VIP}`,
    category: '會員使用',
    amount: 1900,
    payment_methods: [] as string[],
  },
  {
    notion_page_id: '35607d21-c964-803c-8bce-fb377b0593d3',
    newTitle: `湘120分現金儲值3000 +4000-1900、2100${VIP}`,
    category: '會員儲值',
    amount: 3000,
    payment_methods: ['現金'],
  },
  {
    notion_page_id: '35607d21-c964-8070-9384-ee09e6f93265',
    newTitle: `湘120分富邦儲值1000 +4000-1900、2100${VIP}`,
    category: '會員儲值',
    amount: 1000,
    payment_methods: ['富邦'],
  },
] as const;

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();

  for (const fix of FIXES) {
    const parsed = parseNotionNamePhone(fix.newTitle);
    console.log(`\n→ ${fix.newTitle}`);

    await updateNotionPageProperties(fix.notion_page_id, buildNotionTitleUpdate(fix.newTitle));
    console.log('  Notion OK', fix.notion_page_id.slice(0, 8));

    const { data, error } = await sb
      .from('daily_transactions')
      .update({
        title: fix.newTitle,
        category: fix.category,
        amount: fix.amount,
        payment_methods: fix.payment_methods,
        client_name: parsed?.name ?? '黃昶凱',
        client_phone: parsed?.phone ?? '0967156608',
        is_vip: true,
        updated_at: new Date().toISOString(),
      })
      .eq('notion_page_id', fix.notion_page_id)
      .eq('store_id', 'store1')
      .select('id, title, amount, category, payment_methods');

    if (error) throw new Error(error.message);
    if (!data?.length) {
      console.warn('  DB: 找不到列', fix.notion_page_id);
    } else {
      console.log('  DB OK', data[0].id.slice(0, 8), data[0].category, data[0].amount);
    }
  }

  const { data: remain } = await sb
    .from('daily_transactions')
    .select('id, title')
    .eq('store_id', 'store1')
    .eq('title', OLD_TITLE);
  console.log('\n殘留舊標題列數:', remain?.length ?? 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
