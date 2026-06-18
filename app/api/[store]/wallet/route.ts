import { NextResponse } from 'next/server';
import { parseStoreFromParamsAsync } from '@/lib/api-store';
import { syncClientCalendarDeletions } from '@/lib/calendar-checkout-sync';
import { clientMemberBalance } from '@/lib/ledger-title-balance';
import { listClientTransactions } from '@/lib/reports-server';
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

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, store_id, phone, line_user_id, name, is_vip, initial_balance, balance, is_active, created_at, updated_at')
    .eq('store_id', store)
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  if (clientError) {
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }

  if (!client) {
    return NextResponse.json({ error: '尚未綁定電話' }, { status: 404 });
  }

  let transactions;
  try {
    transactions = await listClientTransactions(store, client.phone);
  } catch (e) {
    const message = e instanceof Error ? e.message : '無法載入消費紀錄';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const memberRows = transactions
    .filter((row) => ['會員儲值', '會員使用', '會員補差額'].includes(row.category))
    .map((row) => ({
      id: row.id,
      occurred_on: row.occurredOn,
      title: row.title,
      amount: row.amount,
      category: row.category,
      client_name: row.clientName,
      client_phone: row.clientPhone,
    }));

  const computedBalance = clientMemberBalance(memberRows, client.phone);
  const balance = computedBalance ?? client.balance;

  try {
    await syncClientCalendarDeletions(client.id);
  } catch {
    // 日曆查詢失敗不阻擋 wallet 載入
  }

  const { data: appointments, error: apptError } = await supabase
    .from('appointments')
    .select(`
      id,
      service_label,
      service_duration_minutes,
      starts_at,
      ends_at,
      note,
      staff:staff_id(display_name)
    `)
    .eq('client_id', client.id)
    .eq('status', 'pending_checkout')
    .order('starts_at', { ascending: true });

  if (apptError) {
    return NextResponse.json({ error: apptError.message }, { status: 500 });
  }

  return NextResponse.json({
    client: { ...client, balance },
    transactions,
    appointments: appointments ?? [],
  });
}
