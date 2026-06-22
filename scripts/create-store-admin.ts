/**
 * 建立店長（一般管理員）portal 帳號
 * 用法：npx tsx scripts/create-store-admin.ts <顯示名稱> <storeId> <密碼>
 * 例：npx tsx scripts/create-store-admin.ts 弘哥 store2 hank36987412
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { hashPortalPassword } from '../lib/portal-password';
import { getStore, isStoreSlug, type StoreSlug } from '../lib/stores';
import { linkPortalAccountToStaff } from '../lib/team-server';

function loadEnv() {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1]!.trim()]) {
      process.env[m[1]!.trim()] = m[2]!.trim().replace(/^["']|["']$/g, '');
    }
  }
}

async function main() {
  loadEnv();
  const displayName = process.argv[2]?.trim();
  const storeId = process.argv[3]?.trim();
  const password = process.argv[4]?.trim();

  if (!displayName || !storeId || !password) {
    console.error('用法：npx tsx scripts/create-store-admin.ts <顯示名稱> <storeId> <密碼>');
    process.exit(1);
  }
  if (!isStoreSlug(storeId) || !getStore(storeId)) {
    throw new Error(`無效分店：${storeId}`);
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: existing } = await sb
    .from('portal_accounts')
    .select('id, display_name')
    .eq('role', 'store')
    .eq('display_name', displayName)
    .maybeSingle();

  let accountId: string;
  if (existing) {
    accountId = existing.id as string;
    const { error: updErr } = await sb
      .from('portal_accounts')
      .update({
        store_id: storeId,
        password_hash: hashPortalPassword(password),
        password_plain: password,
        is_active: true,
      })
      .eq('id', accountId);
    if (updErr) throw new Error(updErr.message);
    console.log(`更新既有帳號：${displayName} (${accountId})`);
  } else {
    const { data: created, error: insErr } = await sb
      .from('portal_accounts')
      .insert({
        role: 'store',
        store_id: storeId,
        display_name: displayName,
        password_hash: hashPortalPassword(password),
        password_plain: password,
        is_active: true,
      })
      .select('id')
      .single();
    if (insErr) throw new Error(insErr.message);
    accountId = (created as { id: string }).id;
    console.log(`新增帳號：${displayName} (${accountId})`);
  }

  await sb.from('portal_account_stores').delete().eq('account_id', accountId);
  const { error: linkErr } = await sb
    .from('portal_account_stores')
    .insert({ account_id: accountId, store_id: storeId });
  if (linkErr) {
    console.warn(`portal_account_stores 寫入略過：${linkErr.message}`);
  }

  await linkPortalAccountToStaff(accountId, displayName, storeId as StoreSlug);
  console.log('已連結師傅紀錄（人員與權限頁可見）');

  console.log(`分店：${getStore(storeId)?.name} (${storeId})`);
  console.log('密碼已設定（請妥善保管）');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
