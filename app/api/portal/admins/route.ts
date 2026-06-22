import { NextResponse } from 'next/server';
import { hashPortalPassword } from '@/lib/portal-password';
import { requirePortalAccountManagement } from '@/lib/portal-api';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getStore, isStoreSlug } from '@/lib/stores';

export async function GET() {
  const session = await requirePortalAccountManagement();
  if (session instanceof NextResponse) return session;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('portal_accounts')
    .select('id, role, store_id, display_name, is_active')
    .eq('role', 'store')
    .order('display_name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ accounts: data ?? [] });
}

export async function POST(request: Request) {
  const session = await requirePortalAccountManagement();
  if (session instanceof NextResponse) return session;

  let body: { storeId?: string; displayName?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.storeId || !body.displayName?.trim() || !body.password) {
    return NextResponse.json({ error: '請填寫分店、名稱與密碼' }, { status: 400 });
  }

  if (!isStoreSlug(body.storeId) || !getStore(body.storeId)) {
    return NextResponse.json({ error: '無效分店' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('portal_accounts')
    .insert({
      role: 'store',
      store_id: body.storeId,
      display_name: body.displayName.trim(),
      password_hash: hashPortalPassword(body.password),
      password_plain: body.password,
      is_active: true,
    })
    .select('id, display_name, store_id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.id) {
    await supabase.from('portal_account_stores').upsert(
      { account_id: data.id, store_id: body.storeId },
      { onConflict: 'account_id,store_id' },
    );
  }

  return NextResponse.json({ account: data });
}
