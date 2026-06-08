import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyPortalPassword } from '@/lib/portal-password';
import {
  verifyBootstrapStorePassword,
  verifyBootstrapSuperPassword,
  type PortalSession,
} from '@/lib/portal-session';
import { verifyStaffPin } from '@/lib/staff-pin';
import { findStaffForLogin, listActiveStaffForRoster } from '@/lib/staff-auth-server';
import { getStore, isStoreSlug, type StoreSlug } from '@/lib/stores';

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

export async function loginStoreAdmin(
  storeId: string,
  password: string,
): Promise<PortalSession> {
  if (!isStoreSlug(storeId) || !getStore(storeId)) {
    throw new Error('無效分店');
  }

  const supabase = getSupabaseAdmin();
  const { data: accounts, error: accountsError } = await supabase
    .from('portal_accounts')
    .select('display_name, password_hash, is_active')
    .eq('role', 'store')
    .eq('store_id', storeId)
    .eq('is_active', true);

  if (!accountsError) {
  for (const account of accounts ?? []) {
    if (verifyPortalPassword(password, account.password_hash)) {
      return {
        role: 'store',
        storeId,
        displayName: account.display_name,
      };
    }
  }
  }

  if (verifyBootstrapStorePassword(password)) {
    const store = getStore(storeId)!;
    return {
      role: 'store',
      storeId,
      displayName: `${store.name} 管理員`,
    };
  }

  throw new Error('店長密碼錯誤');
}

export async function loginSuperAdmin(password: string): Promise<PortalSession> {
  const supabase = getSupabaseAdmin();
  const { data: accounts, error: accountsError } = await supabase
    .from('portal_accounts')
    .select('display_name, password_hash, is_active')
    .eq('role', 'super')
    .eq('is_active', true);

  if (!accountsError) {
    for (const account of accounts ?? []) {
      if (verifyPortalPassword(password, account.password_hash)) {
        return { role: 'super', displayName: account.display_name };
      }
    }
  }

  if (verifyBootstrapSuperPassword(password)) {
    return { role: 'super', displayName: '總管理員' };
  }

  throw new Error('總管理密碼錯誤');
}
