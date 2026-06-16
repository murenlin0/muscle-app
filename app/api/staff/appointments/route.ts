import { NextResponse } from 'next/server';
import { requireStaffSession } from '@/lib/portal-api';
import { formatStoreDateIso, STORE_TIMEZONE } from '@/lib/store-timezone';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await requireStaffSession();
  if (session instanceof NextResponse) return session;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date'); // YYYY-MM-DD，預設今天（台北）

  const supabase = getSupabaseAdmin();

  const { data: staff } = await supabase
    .from('staff')
    .select('id, store_id, display_name')
    .eq('id', session.staffId)
    .maybeSingle();

  if (!staff) {
    return NextResponse.json({ error: '找不到師傅資料' }, { status: 404 });
  }

  const queryDate = dateParam ?? formatStoreDateIso(new Date());
  const dayStart = new Date(`${queryDate}T00:00:00+08:00`);
  const dayEnd = new Date(`${queryDate}T23:59:59.999+08:00`);

  // 顯示：此師傅負責的預約，或由此師傅建立的預約（訊息內師傅名稱可能不同）
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
    .or(`staff_id.eq.${session.staffId},created_by_staff_id.eq.${session.staffId}`)
    .gte('starts_at', dayStart.toISOString())
    .lte('starts_at', dayEnd.toISOString())
    .order('starts_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    appointments: appointments ?? [],
    date: queryDate,
    storeId: staff.store_id,
    timezone: STORE_TIMEZONE,
  });
}
