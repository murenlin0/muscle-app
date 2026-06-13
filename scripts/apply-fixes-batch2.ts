/**
 * 批次修正 2：翁先生Richard Weng 3/7 兩列 + 游承蓉補列與標題
 *   npx tsx scripts/apply-fixes-batch2.ts          # dry-run
 *   npx tsx scripts/apply-fixes-batch2.ts --apply
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

  const titleEdits: { page: string; to: string }[] = [
    // 翁先生 3/7 使用列
    { page: '1af07d21-c964-8004-b785-ee827a136239', to: '錦-1900、0VIP翁先生Richard Weng(無電話)' },
    // 翁先生 3/7 結清列
    { page: '1af07d21-c964-8014-8b47-c0b48ed5abee', to: '錦+1100、1900VIP翁先生Richard Weng(無電話)' },
    // 游承蓉 12/31 結清列
    { page: '2da07d21-c964-8050-9953-c1fe91931d60', to: '錦+500、1500VIP游承蓉0976519617' },
    // 游承蓉 12/31 使用列
    { page: '2da07d21-c964-80ec-820c-e2eaebaeb70e', to: '錦90分-1500、0VIP游承蓉0976519617' },
  ];

  console.log('===== 標題修正 =====');
  for (const e of titleEdits) {
    console.log(`${tag} page=${e.page}\n   -> ${e.to}`);
    if (apply) {
      await updateNotionPageProperties(e.page, buildNotionTitleUpdate(e.to));
      const { error } = await sb
        .from('daily_transactions')
        .update({ title: e.to })
        .eq('store_id', 'store1')
        .eq('notion_page_id', e.page);
      console.log(error ? `   DB失敗: ${error.message}` : '   ✓ Notion+DB');
    }
  }

  console.log('\n===== 游承蓉 新增 2025-11-19 -1000 使用 =====');
  {
    const date = '2025-11-19';
    const title = '仁60分-1000、1000VIP游承蓉0976519617';
    const amount = 1000;
    console.log(`${tag} ${date} 會員使用/VIP 60分 仁 | ${title}`);
    if (apply) {
      const { data: exist } = await sb
        .from('daily_transactions')
        .select('id')
        .eq('store_id', 'store1')
        .eq('occurred_on', date)
        .eq('client_phone', '0976519617')
        .eq('category', '會員使用');
      if (exist?.length) {
        console.log('   已存在，略過');
      } else {
        const page = await createNotionDailyPage({
          title,
          date,
          amount,
          serviceType: 'VIP 60分',
          staffName: '仁',
          paymentMethods: ['會員使用'],
        });
        const { error } = await sb.from('daily_transactions').insert({
          store_id: 'store1',
          notion_page_id: page,
          occurred_on: date,
          title,
          amount,
          service_type: 'VIP 60分',
          category: '會員使用',
          payment_methods: [],
          staff_name: '仁',
          is_designated: false,
          member_note: null,
          client_name: '游承蓉',
          client_phone: '0976519617',
          is_vip: true,
        });
        console.log(error ? `   DB失敗: ${error.message}` : `   ✓ Notion+DB (page ${page})`);
      }
    }
  }

  console.log(`\n完成（${apply ? '已套用' : 'dry-run'}）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
