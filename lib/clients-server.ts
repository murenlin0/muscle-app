import { getSupabaseAdmin } from '@/lib/supabase';
import type { StoreSlug } from '@/lib/stores';

export interface ClientListItem {
  id: string;
  name: string;
  phone: string;
  balance: number;
  isVip: boolean;
  isActive: boolean;
}

export async function listClients(storeId: StoreSlug): Promise<ClientListItem[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, phone, balance, is_vip, is_active')
    .eq('store_id', storeId)
    .order('name');

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    balance: row.balance as number,
    isVip: Boolean(row.is_vip),
    isActive: Boolean(row.is_active),
  }));
}
