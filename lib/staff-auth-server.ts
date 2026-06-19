import { fetchNotionStaffSelectOptions } from '@/lib/notion-api';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getStore, type StoreSlug } from '@/lib/stores';

export interface StaffRosterEntry {
  id: string;
  display_name: string;
  store_id: StoreSlug;
  store_name: string;
}

export async function findStaffForLogin(staffId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('staff')
    .select('id, store_id, display_name, pin_hash, is_active')
    .eq('id', staffId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function listActiveStaffForRoster(): Promise<StaffRosterEntry[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('staff')
    .select('id, display_name, store_id')
    .eq('is_active', true)
    .order('display_name');

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    display_name: row.display_name,
    store_id: row.store_id as StoreSlug,
    store_name: getStore(row.store_id)?.name ?? row.store_id,
  }));
}

/** 流水帳「人員」下拉：合併 staff 表、已同步流水帳、Notion 師傅選項 */
export async function listLedgerStaffNames(storeId: StoreSlug): Promise<string[]> {
  const supabase = getSupabaseAdmin();

  const [{ data: staffRows, error: staffErr }, { data: txRows, error: txErr }] =
    await Promise.all([
      supabase
        .from('staff')
        .select('display_name')
        .eq('store_id', storeId)
        .eq('is_active', true),
      supabase
        .from('daily_transactions')
        .select('staff_name')
        .eq('store_id', storeId)
        .not('staff_name', 'is', null),
    ]);

  if (staffErr) throw new Error(staffErr.message);
  if (txErr) throw new Error(txErr.message);

  let notionNames: string[] = [];
  try {
    notionNames = await fetchNotionStaffSelectOptions(storeId);
  } catch {
    // Notion 未設定或連線失敗時略過，仍回傳 DB 內名單
  }

  const names = new Set<string>();
  for (const row of staffRows ?? []) {
    const n = row.display_name?.trim();
    if (n) names.add(n);
  }
  for (const row of txRows ?? []) {
    const n = (row.staff_name as string | null)?.trim();
    if (n) names.add(n);
  }
  for (const n of notionNames) {
    if (n.trim()) names.add(n.trim());
  }

  return [...names].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

export async function findStaffByName(storeId: StoreSlug, displayName: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('staff')
    .select('id, display_name')
    .eq('store_id', storeId)
    .eq('display_name', displayName)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function upsertClientForBooking(
  storeId: StoreSlug,
  phone: string,
  name: string,
) {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('store_id', storeId)
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('clients')
      .update({ name, is_active: true })
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({
      store_id: storeId,
      phone,
      name,
      initial_balance: 0,
      balance: 0,
      is_active: true,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}
