import { NextResponse } from 'next/server';
import { parseStoreFromParamsAsync } from '@/lib/api-store';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(
  request: Request,
  context: { params: Promise<{ store: string }> },
) {
  const store = await parseStoreFromParamsAsync(context.params);
  if (store instanceof NextResponse) return store;

  const lineUserId = request.headers.get('x-line-user-id');
  if (!lineUserId) {
    return NextResponse.json({ error: 'missing x-line-user-id' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('clients')
    .select('id, store_id, phone, line_user_id, name, is_vip, initial_balance, balance, is_active, created_at, updated_at')
    .eq('store_id', store)
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ client: data });
}
