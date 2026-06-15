/**
 * Phase 2: 刪除舊 store 帳號，新增 錦（密碼 ZXCzxc0000，民有店 store1）
 * 
 * 前提：portal_account_stores 表已建立（執行 supabase/16_portal_account_stores.sql）
 * 若表未建立也可執行，只是 storeIds 功能等建表後才完整運作。
 */
import { createClient } from '@supabase/supabase-js';
import { scryptSync } from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SALT = process.env.PORTAL_PASSWORD_SALT ?? 'muscle-portal-change-me';

function hashPortalPassword(pw: string): string {
  return scryptSync(pw.trim(), SALT, 32).toString('hex');
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  // 1. 列出並刪除所有舊 store 帳號
  const { data: old } = await sb
    .from('portal_accounts')
    .select('id, display_name')
    .eq('role', 'store');
  
  if (old && old.length > 0) {
    const ids = (old as { id: string; display_name: string }[]).map((r) => r.id);
    const { error: delErr } = await sb.from('portal_accounts').delete().in('id', ids);
    if (delErr) throw new Error(`刪除舊帳號失敗: ${delErr.message}`);
    console.log(`已刪除舊帳號: ${(old as { display_name: string }[]).map((r) => r.display_name).join(', ')}`);
  } else {
    console.log('沒有舊 store 帳號');
  }

  // 2. 找或建立 staff 記錄
  const { data: existingStaff } = await sb
    .from('staff')
    .select('id')
    .eq('display_name', '錦')
    .eq('store_id', 'store1')
    .maybeSingle();

  let staffId: string;
  if (existingStaff) {
    staffId = (existingStaff as { id: string }).id;
    console.log(`使用現有師傅 錦 (id=${staffId})`);
    await sb.from('staff').update({ is_active: true }).eq('id', staffId);
  } else {
    const { data: newStaff, error: staffErr } = await sb
      .from('staff')
      .insert({
        store_id: 'store1',
        display_name: '錦',
        login_pin: '000000',
        pin_hash: scryptSync('000000', process.env.STAFF_PIN_SALT ?? 'muscle-pin-change-me', 32).toString('hex'),
        is_active: true,
      })
      .select('id')
      .single();
    if (staffErr) throw new Error(`建立 staff 失敗: ${staffErr.message}`);
    staffId = (newStaff as { id: string }).id;
    console.log(`新增師傅 錦 (id=${staffId})`);
  }

  // 3. 建立 portal_accounts（含 store_id 為向下相容）
  const pw = 'ZXCzxc0000';
  const { data: newAccount, error: accErr } = await sb
    .from('portal_accounts')
    .insert({
      role: 'store',
      store_id: 'store1',
      display_name: '錦',
      staff_id: staffId,
      password_plain: pw,
      password_hash: hashPortalPassword(pw),
      is_active: true,
    })
    .select('id')
    .single();
  if (accErr) throw new Error(`建立 portal_accounts 失敗: ${accErr.message}`);
  const accountId = (newAccount as { id: string }).id;
  console.log(`新增帳號 錦 (id=${accountId})`);

  // 4. 嘗試寫入 portal_account_stores（若表已建立則成功）
  const { error: storeErr } = await sb
    .from('portal_account_stores')
    .insert({ account_id: accountId, store_id: 'store1' });
  if (storeErr) {
    console.warn(`portal_account_stores 尚未建立，請執行 supabase/16_portal_account_stores.sql 後重跑此腳本`);
    console.warn(`錦 已可登入（靠 portal_accounts.store_id）`);
  } else {
    console.log('已指派 store1 給 錦（portal_account_stores）');
  }

  console.log('\n=== 完成 ===');
  console.log('帳號：錦');
  console.log('密碼：ZXCzxc0000');
  console.log('分店：民有店 (store1)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
