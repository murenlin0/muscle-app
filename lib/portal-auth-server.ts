import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyPortalPassword } from '@/lib/portal-password';
import {
  verifyBootstrapStorePassword,
  verifyBootstrapSuperPassword,
  type PortalSession,
} from '@/lib/portal-session';
import { verifyStaffPin } from '@/lib/staff-pin';
import { findStaffForLogin, listActiveStaffForRoster } from '@/lib/staff-auth-server';
import { getStore, type StoreSlug } from '@/lib/stores';

export { listActiveStaffForRoster };

export async function loginStaff(staffId: string, pin: string): Promise<PortalSession> {
  const staff = await findStaffForLogin(staffId);
  if (!staff || !staff.is_active) {
    throw new Error('師傅不存在或已停用');
  }
  if (!verifyStaffPin(pin, staff.pin_hash)) {
    throw new Error('PIN 錯誤');
  }
  return {
    role: 'staff',
    staffId: staff.id,
    staffName: staff.display_name,
  };
}

/** 總管理／店長同一入口，依密碼判斷角色 */
export async function loginAdmin(password: string): Promise<PortalSession> {
  const supabase = getSupabaseAdmin();

  const { data: superAccounts, error: superError } = await supabase
    .from('portal_accounts')
    .select('display_name, password_hash')
    .eq('role', 'super')
    .eq('is_active', true);

  if (!superError) {
    for (const account of superAccounts ?? []) {
      if (verifyPortalPassword(password, account.password_hash)) {
        return { role: 'super', displayName: account.display_name };
      }
    }
  }

  if (verifyBootstrapSuperPassword(password)) {
    return { role: 'super', displayName: '總管理員' };
  }

  const { data: storeAccounts, error: storeError } = await supabase
    .from('portal_accounts')
    .select('display_name, password_hash, store_id')
    .eq('role', 'store')
    .eq('is_active', true);

  if (!storeError) {
    for (const account of storeAccounts ?? []) {
      if (verifyPortalPassword(password, account.password_hash)) {
        return {
          role: 'store',
          storeId: account.store_id as StoreSlug,
          displayName: account.display_name,
        };
      }
    }
  }

  if (verifyBootstrapStorePassword(password)) {
    const store = getStore('store1');
    return {
      role: 'store',
      storeId: 'store1',
      displayName: store ? `${store.name} 管理員` : '店長',
    };
  }

  throw new Error('管理密碼錯誤');
}
