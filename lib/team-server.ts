import { hashPortalPassword } from '@/lib/portal-password';
import { hashStaffPin } from '@/lib/staff-pin';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getStore, type StoreSlug } from '@/lib/stores';

export type AccessLevel = 'none' | 'staff' | 'store_admin';

export interface TeamMember {
  staffId: string;
  displayName: string;
  storeId: StoreSlug;
  storeName: string;
  accessLevel: AccessLevel;
  staffPin: string;
  adminPassword: string | null;
  portalAccountId: string | null;
}

export function accessLevelLabel(level: AccessLevel): string {
  if (level === 'none') return '無權限';
  if (level === 'staff') return '師傅';
  return '店長';
}

function deriveAccessLevel(isActive: boolean, hasStoreAdmin: boolean): AccessLevel {
  if (!isActive) return 'none';
  if (hasStoreAdmin) return 'store_admin';
  return 'staff';
}

export async function listTeamMembers(storeFilter?: StoreSlug): Promise<TeamMember[]> {
  const supabase = getSupabaseAdmin();

  let staffQuery = supabase
    .from('staff')
    .select('id, display_name, store_id, is_active, login_pin')
    .order('display_name');

  if (storeFilter) {
    staffQuery = staffQuery.eq('store_id', storeFilter);
  }

  const { data: staffRows, error: staffError } = await staffQuery;
  if (staffError) throw new Error(staffError.message);

  const { data: portalRows, error: portalError } = await supabase
    .from('portal_accounts')
    .select('id, staff_id, password_plain, is_active')
    .eq('role', 'store');

  if (portalError) throw new Error(portalError.message);

  const portalByStaffId = new Map(
    (portalRows ?? []).filter((p) => p.staff_id).map((p) => [p.staff_id as string, p]),
  );

  return (staffRows ?? []).map((row) => {
    const storeId = row.store_id as StoreSlug;
    const portal = portalByStaffId.get(row.id);
    const hasStoreAdmin = Boolean(portal?.is_active);

    return {
      staffId: row.id,
      displayName: row.display_name,
      storeId,
      storeName: getStore(storeId)?.name ?? storeId,
      accessLevel: deriveAccessLevel(row.is_active, hasStoreAdmin),
      staffPin: row.login_pin ?? '',
      adminPassword: portal?.password_plain ?? null,
      portalAccountId: portal?.id ?? null,
    };
  });
}

export interface UpdateTeamMemberInput {
  displayName?: string;
  staffPin?: string;
  adminPassword?: string;
  accessLevel: AccessLevel;
}

export async function updateTeamMember(
  staffId: string,
  input: UpdateTeamMemberInput,
  options: { actorStoreId?: StoreSlug; canAssignStoreAdmin: boolean },
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, store_id, display_name, is_active')
    .eq('id', staffId)
    .maybeSingle();

  if (staffError) throw new Error(staffError.message);
  if (!staff) throw new Error('找不到師傅');
  if (options.actorStoreId && staff.store_id !== options.actorStoreId) {
    throw new Error('無權修改其他分店人員');
  }

  const { data: existingPortal } = await supabase
    .from('portal_accounts')
    .select('id, is_active')
    .eq('staff_id', staffId)
    .eq('role', 'store')
    .maybeSingle();

  const currentLevel = deriveAccessLevel(staff.is_active, Boolean(existingPortal?.is_active));
  const nextLevel = input.accessLevel;

  if (!options.canAssignStoreAdmin) {
    if (currentLevel === 'store_admin' && nextLevel !== 'store_admin') {
      throw new Error(`無法變更「${staff.display_name}」的店長權限，請聯繫總管理`);
    }
    if (nextLevel === 'store_admin') {
      throw new Error('店長無法指派店長權限');
    }
  }

  const staffUpdate: Record<string, unknown> = {};
  if (input.displayName?.trim()) staffUpdate.display_name = input.displayName.trim();

  if (input.accessLevel === 'none') {
    staffUpdate.is_active = false;
  } else {
    staffUpdate.is_active = true;
  }

  if (input.staffPin?.trim()) {
    const pin = input.staffPin.trim();
    staffUpdate.login_pin = pin;
    staffUpdate.pin_hash = hashStaffPin(pin);
  }

  if (Object.keys(staffUpdate).length > 0) {
    const { error } = await supabase.from('staff').update(staffUpdate).eq('id', staffId);
    if (error) throw new Error(error.message);
  }

  const wantsStoreAdmin = input.accessLevel === 'store_admin';

  if (wantsStoreAdmin) {
    const password = input.adminPassword?.trim();
    if (!existingPortal && !password) {
      throw new Error(`「${staff.display_name}」設為店長須填管理密碼`);
    }

    const portalPayload: Record<string, unknown> = {
      role: 'store',
      store_id: staff.store_id,
      display_name: input.displayName?.trim() || staff.display_name,
      staff_id: staffId,
      is_active: true,
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

export async function batchUpdateTeamMembers(
  updates: Array<{ staffId: string } & UpdateTeamMemberInput>,
  options: { actorStoreId?: StoreSlug; canAssignStoreAdmin: boolean },
): Promise<void> {
  for (const item of updates) {
    const { staffId, ...input } = item;
    await updateTeamMember(staffId, input, options);
  }
}

export async function createTeamMember(
  storeId: StoreSlug,
  input: {
    displayName: string;
    staffPin: string;
    adminPassword?: string;
    accessLevel: AccessLevel;
  },
  options: { canAssignStoreAdmin: boolean },
): Promise<void> {
  if (!options.canAssignStoreAdmin && input.accessLevel === 'store_admin') {
    throw new Error('店長無法指派店長權限');
  }
  if (input.accessLevel === 'none') {
    throw new Error('新增人員請至少給予師傅權限');
  }

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

  if (input.accessLevel === 'store_admin') {
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
