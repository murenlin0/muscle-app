import { hashPortalPassword } from '@/lib/portal-password';
import { hashStaffPin } from '@/lib/staff-pin';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getStore, type StoreSlug } from '@/lib/stores';

export type TeamPermission = 'staff' | 'store_admin';

export interface TeamMember {
  staffId: string;
  displayName: string;
  storeId: StoreSlug;
  storeName: string;
  isActive: boolean;
  permissions: TeamPermission[];
  staffPin: string | null;
  adminPassword: string | null;
  portalAccountId: string | null;
}

export async function listTeamMembers(storeFilter?: StoreSlug): Promise<TeamMember[]> {
  const supabase = getSupabaseAdmin();

  let staffQuery = supabase
    .from('staff')
    .select('id, display_name, store_id, is_active, login_pin, pin_hash')
    .order('display_name');

  if (storeFilter) {
    staffQuery = staffQuery.eq('store_id', storeFilter);
  }

  const { data: staffRows, error: staffError } = await staffQuery;
  if (staffError) throw new Error(staffError.message);

  const { data: portalRows, error: portalError } = await supabase
    .from('portal_accounts')
    .select('id, staff_id, store_id, role, password_plain, is_active')
    .eq('role', 'store');

  if (portalError) throw new Error(portalError.message);

  const portalByStaffId = new Map(
    (portalRows ?? []).filter((p) => p.staff_id).map((p) => [p.staff_id as string, p]),
  );

  return (staffRows ?? []).map((row) => {
    const storeId = row.store_id as StoreSlug;
    const portal = portalByStaffId.get(row.id);
    const permissions: TeamPermission[] = ['staff'];
    if (portal?.is_active) permissions.push('store_admin');

    return {
      staffId: row.id,
      displayName: row.display_name,
      storeId,
      storeName: getStore(storeId)?.name ?? storeId,
      isActive: row.is_active,
      permissions,
      staffPin: row.login_pin ?? '',
      adminPassword: portal?.password_plain ?? null,
      portalAccountId: portal?.id ?? null,
    };
  });
}

export interface UpdateTeamMemberInput {
  displayName?: string;
  isActive?: boolean;
  staffPin?: string;
  adminPassword?: string;
  permissions?: TeamPermission[];
}

export async function updateTeamMember(
  staffId: string,
  input: UpdateTeamMemberInput,
  actorStoreId?: StoreSlug,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, store_id, display_name, is_active')
    .eq('id', staffId)
    .maybeSingle();

  if (staffError) throw new Error(staffError.message);
  if (!staff) throw new Error('找不到師傅');
  if (actorStoreId && staff.store_id !== actorStoreId) {
    throw new Error('無權修改其他分店人員');
  }

  const staffUpdate: Record<string, unknown> = {};
  if (input.displayName?.trim()) staffUpdate.display_name = input.displayName.trim();
  if (typeof input.isActive === 'boolean') staffUpdate.is_active = input.isActive;
  if (input.staffPin?.trim()) {
    const pin = input.staffPin.trim();
    staffUpdate.login_pin = pin;
    staffUpdate.pin_hash = hashStaffPin(pin);
  }

  if (Object.keys(staffUpdate).length > 0) {
    const { error } = await supabase.from('staff').update(staffUpdate).eq('id', staffId);
    if (error) throw new Error(error.message);
  }

  const wantsStoreAdmin = input.permissions?.includes('store_admin') ?? false;

  const { data: existingPortal } = await supabase
    .from('portal_accounts')
    .select('id, is_active')
    .eq('staff_id', staffId)
    .eq('role', 'store')
    .maybeSingle();

  if (wantsStoreAdmin) {
    const password = input.adminPassword?.trim();
    if (!existingPortal && !password) {
      throw new Error('啟用店長權限請設定管理密碼');
    }

    const portalPayload: Record<string, unknown> = {
      role: 'store',
      store_id: staff.store_id,
      display_name: input.displayName?.trim() || staff.display_name,
      staff_id: staffId,
      is_active: input.isActive ?? staff.is_active,
    };

    if (password) {
      portalPayload.password_plain = password;
      portalPayload.password_hash = hashPortalPassword(password);
    }

    if (existingPortal) {
      const { error } = await supabase
        .from('portal_accounts')
        .update(portalPayload)
        .eq('id', existingPortal.id);
      if (error) throw new Error(error.message);
    } else if (password) {
      const { error } = await supabase.from('portal_accounts').insert(portalPayload);
      if (error) throw new Error(error.message);
    }
  } else if (existingPortal) {
    const { error } = await supabase
      .from('portal_accounts')
      .update({ is_active: false })
      .eq('id', existingPortal.id);
    if (error) throw new Error(error.message);
  }
}

export async function createTeamMember(
  storeId: StoreSlug,
  input: {
    displayName: string;
    staffPin: string;
    adminPassword?: string;
    permissions: TeamPermission[];
  },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const pin = input.staffPin.trim();

  const { data: created, error } = await supabase
    .from('staff')
    .insert({
      store_id: storeId,
      display_name: input.displayName.trim(),
      login_pin: pin,
      pin_hash: hashStaffPin(pin),
      is_active: true,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  if (input.permissions.includes('store_admin')) {
    const password = input.adminPassword?.trim();
    if (!password) throw new Error('店長權限需要管理密碼');

    const { error: portalError } = await supabase.from('portal_accounts').insert({
      role: 'store',
      store_id: storeId,
      display_name: input.displayName.trim(),
      staff_id: created.id,
      password_plain: password,
      password_hash: hashPortalPassword(password),
      is_active: true,
    });
    if (portalError) throw new Error(portalError.message);
  }
}
