/**
 * 為 A 類（使用 Notion 前已有儲值但未記錄）客人，補一筆 2024-03-01 期初儲值。
 * 在 Notion 建頁，並同步寫入 DB。付款方式留空，不影響現金/富邦資產。
 *   npx tsx scripts/add-opening-deposits.ts          # dry-run
 *   npx tsx scripts/add-opening-deposits.ts --apply  # 建立
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getSupabaseAdmin } from '../lib/supabase';
import { createNotionDailyPage } from '../lib/notion-api';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const OPENING_DATE = '2024-03-01';

// 5 位可自動處理（單一電話、非合寫）
const DEPOSITS: { name: string; phone: string; amount: number }[] = [
  { name: '曾憲鈺', phone: '0938340304', amount: 1000 },
  // { name: '陳宥唯', phone: '0910678327', amount: 3000 }, // 已併入陳宥奇 0928294900
  { name: '葉恩銓', phone: '0920234127', amount: 1400 },
  { name: '陳信瑋', phone: '0933377145', amount: 3000 },
  { name: '林昆慶', phone: '0921138140', amount: 2500 },
];

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const sb = getSupabaseAdmin();

  for (const d of DEPOSITS) {
    const title = `+${d.amount}、${d.amount}VIP${d.name}${d.phone}`;
    console.log(`${apply ? '建立' : '[dry]'} ${OPENING_DATE} 會員儲值 仁 | ${title}`);
    if (!apply) continue;

    // 防重複：同電話、同日、同類型已存在則略過
    const { data: exist } = await sb
      .from('daily_transactions')
      .select('id')
      .eq('store_id', 'store1')
      .eq('occurred_on', OPENING_DATE)
      .eq('category', '會員儲值')
      .eq('client_phone', d.phone);
    if (exist?.length) {
      console.log('  已存在，略過');
      continue;
    }

    const pageId = await createNotionDailyPage({
      title,
      date: OPENING_DATE,
      amount: d.amount,
      serviceType: '儲值',
      staffName: '仁',
    });

    const { error } = await sb.from('daily_transactions').insert({
      store_id: 'store1',
      notion_page_id: pageId,
      occurred_on: OPENING_DATE,
      title,
      amount: d.amount,
      service_type: '儲值',
      category: '會員儲值',
      payment_methods: [],
      staff_name: '仁',
      is_designated: false,
      member_note: null,
      client_name: d.name,
      client_phone: d.phone,
      is_vip: true,
    });
    if (error) console.error('  DB 寫入失敗:', error.message);
    else console.log(`  ✓ Notion+DB 建立 (page ${pageId})`);
  }

  const total = DEPOSITS.reduce((s, d) => s + d.amount, 0);
  console.log(`\n合計補入期初儲值: $${total.toLocaleString()}（${DEPOSITS.length} 筆）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
