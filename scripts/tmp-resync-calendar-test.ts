/**
 * 刪除測試用日曆同步流水帳，重設 appointment 並重新同步
 * npx tsx scripts/tmp-resync-calendar-test.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  repairCalendarCheckout,
  syncCalendarCheckouts,
} from '../lib/calendar-checkout-sync';
import { getSupabaseAdmin } from '../lib/supabase';

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // 使用已設定的 process.env
  }
}

async function main() {
  loadEnv();
  const sb = getSupabaseAdmin();
  const phone = '0978542704';
  const occurredOn = '2026-06-18';

  console.log('重設預約並刪除舊流水帳…');
  const repair = await repairCalendarCheckout({
    storeId: 'store1',
    occurredOn,
    phone,
  });
  console.log(`  刪除 ${repair.deletedTx} 筆流水帳、重設 ${repair.resetAppts} 筆預約`);

  console.log('\n重新同步日曆結帳…');
  const result = await syncCalendarCheckouts(720);
  console.log(JSON.stringify(result, null, 2));

  const { data: after } = await sb
    .from('daily_transactions')
    .select('title, amount, category, payment_methods, client_name')
    .eq('store_id', 'store1')
    .eq('occurred_on', occurredOn)
    .or(`client_phone.eq.${phone},title.ilike.%${phone}%`)
    .order('category');

  console.log(`\n同步後流水帳 ${after?.length ?? 0} 筆：`);
  for (const r of after ?? []) {
    console.log(
      `  [${r.category}] $${r.amount} ${r.payment_methods?.join(',') ?? ''} ${r.client_name ?? ''}`,
    );
    console.log(`    ${r.title}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
