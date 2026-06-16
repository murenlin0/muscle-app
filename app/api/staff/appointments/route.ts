import { NextResponse } from 'next/server';
import { requireStaffSession } from '@/lib/portal-api';
import { formatStoreDateIso, STORE_TIMEZONE } from '@/lib/store-timezone';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isStoreSlug } from '@/lib/stores';

export const dynamic = 'force-dynamic';

type AppointmentRow = {
  id: string;
  store_id: string;
  service_label: string;
  service_duration_minutes: number;
  starts_at: string;
  ends_at: string;
  status: string;
  note: string | null;
  calendar_title: string | null;
  staff_id: string | null;
  client_id: string | null;
};

export async function GET(request: Request) {
  const session = await requireStaffSession();
  if (session instanceof NextResponse) return session;

  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');

  const supabase = getSupabaseAdmin();

  const { data: staff, error: staffErr } = await supabase
    .from('staff')
    .select('id, store_id, display_name')
    .eq('id', session.staffId)
    .maybeSingle();

  if (staffErr) {
    return NextResponse.json({ error: staffErr.message }, { status: 500 });
  }
  if (!staff) {
    return NextResponse.json({ error: '找不到師傅資料' }, { status: 404 });
  }

  const storeId = staff.store_id as string;
  if (!isStoreSlug(storeId)) {
    return NextResponse.json({ error: '無效分店' }, { status: 400 });
  }

  const queryDate = dateParam ?? formatStoreDateIso(new Date());
  const dayStart = new Date(`${queryDate}T00:00:00+08:00`);
  const dayEnd = new Date(`${queryDate}T23:59:59.999+08:00`);

  // 不用 embed join（staff 有兩個 FK 會導致 PostgREST 失敗）
  const { data: rows, error } = await supabase
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
      staff_id,
      client_id
    `)
    .eq('store_id', storeId)
    .gte('starts_at', dayStart.toISOString())
    .lte('starts_at', dayEnd.toISOString())
    .order('starts_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const appointments = (rows ?? []) as AppointmentRow[];
  const staffIds = [...new Set(appointments.map((a) => a.staff_id).filter(Boolean))] as string[];
  const clientIds = [...new Set(appointments.map((a) => a.client_id).filter(Boolean))] as string[];

  const staffMap = new Map<string, { id: string; display_name: string }>();
  const clientMap = new Map<
    string,
    { id: string; name: string; phone: string; balance: number; is_vip: boolean }
  >();

  if (staffIds.length > 0) {
    const { data: staffRows } = await supabase
      .from('staff')
      .select('id, display_name')
      .in('id', staffIds);
    for (const row of staffRows ?? []) {
      staffMap.set(row.id, row);
    }
  }

  if (clientIds.length > 0) {
    const { data: clientRows } = await supabase
      .from('clients')
      .select('id, name, phone, balance, is_vip')
      .in('id', clientIds);
    for (const row of clientRows ?? []) {
      clientMap.set(row.id, row);
    }
  }

  const enriched = appointments.map((appt) => ({
    id: appt.id,
    store_id: appt.store_id,
    service_label: appt.service_label,
    service_duration_minutes: appt.service_duration_minutes,
    starts_at: appt.starts_at,
    ends_at: appt.ends_at,
    status: appt.status,
    note: appt.note,
    calendar_title: appt.calendar_title,
    staff: appt.staff_id ? staffMap.get(appt.staff_id) ?? null : null,
    client: appt.client_id ? clientMap.get(appt.client_id) ?? null : null,
  }));

  return NextResponse.json({
    appointments: enriched,
    date: queryDate,
    storeId,
    timezone: STORE_TIMEZONE,
  });
}
