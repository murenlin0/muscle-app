import { NextResponse } from 'next/server';
import { requireStaffSession } from '@/lib/portal-api';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isStoreSlug } from '@/lib/stores';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await requireStaffSession();
  if (session instanceof NextResponse) return session;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date'); // YYYY-MM-DD, default today (Taipei)

  const supabase = getSupabaseAdmin();

  const { data: staff } = await supabase
    .from('staff')
    .select('id, store_id, display_name')
    .eq('id', session.staffId)
    .maybeSingle();

  if (!staff) {
    return NextResponse.json({ error: '找不到師傅資料' }, { status: 404 });
  }

  const storeId = staff.store_id as string;
  if (!isStoreSlug(storeId)) {
    return NextResponse.json({ error: '無效分店' }, { status: 400 });
  }

  // 以台北時間計算查詢日期範圍
  const taipei = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const today = dateParam ?? taipei.format(new Date());
  const dayStart = new Date(`${today}T00:00:00+08:00`);
  const dayEnd = new Date(`${today}T23:59:59+08:00`);

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      id,
      store_id,
      service_label,
      service_duration_minutes,
      starts_at,
      ends_at,
      status,
      note,
      calendar_title,
      staff:staff_id(id, display_name),
      client:client_id(id, name, phone, balance, is_vip)
    `)
    .eq('store_id', storeId)
    .gte('starts_at', dayStart.toISOString())
    .lte('starts_at', dayEnd.toISOString())
    .order('starts_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appointments: appointments ?? [], date: today, storeId });
}
