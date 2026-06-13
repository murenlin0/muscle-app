/**
 * 批次修正：
 *  1) B：黃韻蓉 0912599791 退款列標題補 "-2100、0"
 *  2) James Gea(無電話) 補 2024-03-01 期初儲值 +3950
 *  3) 黃繼璞 相關列統一改為 VIP黃繼璞0910349856（去掉李佑威0981527973），並補齊 name/phone
 *
 *   npx tsx scripts/apply-fixes-batch.ts          # dry-run
 *   npx tsx scripts/apply-fixes-batch.ts --apply
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import {
  createNotionDailyPage,
  updateNotionPageProperties,
  buildNotionTitleUpdate,
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
  const tag = apply ? '套用' : '[dry]';

  // ---------- 1) 黃韻蓉退款 ----------
  console.log('===== 1) 黃韻蓉退款列 =====');
  {
    const pageId = '24607d21-c964-803f-ac9f-f2dc383dcc6c';
    const newTitle = 'Line退款-2100、0VIP黃韻蓉0912599791';
    console.log(`${tag} 更新 page=${pageId}\n   -> ${newTitle}`);
    if (apply) {
      await updateNotionPageProperties(pageId, buildNotionTitleUpdate(newTitle));
      const { error } = await sb
        .from('daily_transactions')
        .update({ title: newTitle, client_name: '黃韻蓉', client_phone: '0912599791' })
        .eq('store_id', 'store1')
        .eq('notion_page_id', pageId);
      console.log(error ? `   DB失敗: ${error.message}` : '   ✓ Notion+DB');
    }
  }

  // ---------- 2) James Gea 期初儲值 ----------
  console.log('\n===== 2) James Gea(無電話) 期初儲值 =====');
  {
    const OPENING_DATE = '2024-03-01';
    const amount = 3950;
    const title = `+${amount}、${amount}VIPJames Gea(無電話)`;
    console.log(`${tag} 建立 ${OPENING_DATE} 會員儲值 仁 | ${title}`);
    if (apply) {
      const { data: exist } = await sb
        .from('daily_transactions')
        .select('id')
        .eq('store_id', 'store1')
        .eq('occurred_on', OPENING_DATE)
        .eq('category', '會員儲值')
        .ilike('title', '%James Gea(無電話)%');
      if (exist?.length) {
        console.log('   已存在，略過');
      } else {
        const newPage = await createNotionDailyPage({
          title,
          date: OPENING_DATE,
          amount,
          serviceType: '儲值',
          staffName: '仁',
        });
        const { error } = await sb.from('daily_transactions').insert({
          store_id: 'store1',
          notion_page_id: newPage,
          occurred_on: OPENING_DATE,
          title,
          amount,
          service_type: '儲值',
          category: '會員儲值',
          payment_methods: [],
          staff_name: '仁',
          is_designated: false,
          member_note: null,
          client_name: 'James Gea',
          client_phone: null,
          is_vip: true,
        });
        console.log(error ? `   DB失敗: ${error.message}` : `   ✓ Notion+DB (page ${newPage})`);
      }
    }
  }

  // ---------- 3) 黃繼璞 統一 ----------
  console.log('\n===== 3) 黃繼璞 統一為 VIP黃繼璞0910349856 =====');
  {
    const { data: rows } = await sb
      .from('daily_transactions')
      .select('id, notion_page_id, occurred_on, title, category, client_name, client_phone')
      .eq('store_id', 'store1')
      .or('title.ilike.%黃繼璞%,title.ilike.%0981527973%');

    for (const r of rows ?? []) {
      // 標題：去掉 "李佑威 0981527973"（含其前的 / 或空白），其餘保留
      let newTitle = r.title
        .replace(/\s*\/?\s*李佑威\s*0981527973/g, '')
        .replace(/0981527973/g, '');
      // 確保會員段為 VIP黃繼璞0910349856（補電話 / 補 VIP 視原格式）
      newTitle = newTitle.trim();

      const titleChanged = newTitle !== r.title;
      const needName = r.client_name !== '黃繼璞' || r.client_phone !== '0910349856';
      if (!titleChanged && !needName) continue;

      console.log(`${tag} ${r.occurred_on} [${r.category}] page=${r.notion_page_id}`);
      if (titleChanged) console.log(`   標題: ${r.title}\n      -> ${newTitle}`);
      if (needName) console.log(`   name/phone -> 黃繼璞 / 0910349856`);

      if (apply) {
        if (titleChanged && r.notion_page_id) {
          await updateNotionPageProperties(r.notion_page_id, buildNotionTitleUpdate(newTitle));
        }
        const { error } = await sb
          .from('daily_transactions')
          .update({ title: newTitle, client_name: '黃繼璞', client_phone: '0910349856' })
          .eq('id', r.id);
        console.log(error ? `   DB失敗: ${error.message}` : '   ✓');
      }
    }
  }

  console.log(`\n完成（${apply ? '已套用' : 'dry-run，加 --apply 才會寫入'}）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
