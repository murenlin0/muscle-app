import { NextResponse } from 'next/server';
import { parseStoreFromParamsAsync } from '@/lib/api-store';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(
  _request: Request,
  context: { params: Promise<{ store: string }> },
) {
  const store = await parseStoreFromParamsAsync(context.params);
  if (store instanceof NextResponse) return store;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('services')
    .select('id, store_id, name, duration_minutes, price_cash, price_member, sort_order, is_active')
    .eq('store_id', store)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ services: data ?? [] });
}
