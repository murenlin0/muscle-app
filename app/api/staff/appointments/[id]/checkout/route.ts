import { NextResponse } from 'next/server';
import { requireStaffSession } from '@/lib/portal-api';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isStoreSlug, type StoreSlug } from '@/lib/stores';
import { STORE_TIMEZONE } from '@/lib/store-timezone';

type CheckoutClient = {
  id: string;
  name: string;
  phone: string;
  balance: number;
  is_vip: boolean;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession();
  if (session instanceof NextResponse) return session;

  const { id } = await context.params;

  let body: {
    paymentMethod: 'cash' | 'transfer' | 'member';
    useMember: boolean;
    topUpAmount?: number;
    startsAt?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!['cash', 'transfer', 'member'].includes(body.paymentMethod)) {
    return NextResponse.json({ error: '請選擇付款方式' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .select(`
      id, store_id, status, service_label, service_duration_minutes,
      starts_at, ends_at, note, calendar_title, calendar_event_id,
      staff_id, client_id
    `)
    .eq('id', id)
    .maybeSingle();

  if (apptErr) return NextResponse.json({ error: apptErr.message }, { status: 500 });
  if (!appt) return NextResponse.json({ error: '找不到預約' }, { status: 404 });
  if (appt.status !== 'pending_checkout') {
    return NextResponse.json({ error: '預約已結帳或已取消' }, { status: 409 });
  }

  const storeId = appt.store_id as StoreSlug;
  if (!isStoreSlug(storeId)) {
    return NextResponse.json({ error: '無效分店' }, { status: 400 });
  }

  const { data: staffRow } = await supabase
    .from('staff')
    .select('store_id')
    .eq('id', session.staffId)
    .maybeSingle();
  if (!staffRow || staffRow.store_id !== storeId) {
    return NextResponse.json({ error: '無權結帳此預約' }, { status: 403 });
  }

  let client: CheckoutClient | null = null;
  if (appt.client_id) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('id, name, phone, balance, is_vip')
      .eq('id', appt.client_id)
      .maybeSingle();
    client = clientRow;
  }

  let staffName: string | null = null;
  if (appt.staff_id) {
    const { data: staffInfo } = await supabase
      .from('staff')
      .select('display_name')
      .eq('id', appt.staff_id)
      .maybeSingle();
    staffName = staffInfo?.display_name ?? null;
  }

  const newStartsAt = body.startsAt ? new Date(body.startsAt) : new Date(appt.starts_at);
  const newEndsAt = new Date(newStartsAt.getTime() + appt.service_duration_minutes * 60_000);

  const occurredOn = new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(newStartsAt);

  const paymentMethods: string[] =
    body.paymentMethod === 'cash'
      ? ['現金']
      : body.paymentMethod === 'transfer'
        ? ['富邦']
        : ['會員使用'];

  const category =
    body.paymentMethod === 'member' || body.useMember ? '會員使用' : '一般消費';

  const title = `${client?.name ?? ''}${client?.phone ? ` ${client.phone}` : ''} ${appt.service_label}`;

  const { data: dt, error: dtErr } = await supabase
    .from('daily_transactions')
    .insert({
      store_id: storeId,
      occurred_on: occurredOn,
      title,
      amount: 0,
      category,
      payment_methods: paymentMethods,
      staff_name: staffName,
      client_name: client?.name ?? null,
      client_phone: client?.phone ?? null,
      is_vip: client?.is_vip ?? false,
      source: 'manual',
    })
    .select('id')
    .single();

  if (dtErr) return NextResponse.json({ error: dtErr.message }, { status: 500 });

  if (client && (body.paymentMethod === 'member' || body.useMember)) {
    if (body.topUpAmount && body.topUpAmount > 0) {
      const { error: topUpErr } = await supabase.from('ledger_records').insert({
        client_id: client.id,
        type: 'top_up',
        amount: body.topUpAmount,
        payment_method: body.paymentMethod === 'transfer' ? 'transfer' : 'cash',
        source: 'manual',
        note: `師傅結帳儲值 ${appt.service_label}`,
        occurred_at: newStartsAt.toISOString(),
      });
      if (topUpErr) return NextResponse.json({ error: topUpErr.message }, { status: 500 });

      const { error: balUpErr } = await supabase
        .from('clients')
        .update({ balance: client.balance + body.topUpAmount })
        .eq('id', client.id);
      if (balUpErr) return NextResponse.json({ error: balUpErr.message }, { status: 500 });
    }
  }

  const { error: updateErr } = await supabase
    .from('appointments')
    .update({
      status: 'completed',
      starts_at: newStartsAt.toISOString(),
      ends_at: newEndsAt.toISOString(),
    })
    .eq('id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    transactionId: dt.id,
    newStatus: 'completed',
    paymentMethod: body.paymentMethod,
    newStartsAt: newStartsAt.toISOString(),
    newEndsAt: newEndsAt.toISOString(),
  });
}
