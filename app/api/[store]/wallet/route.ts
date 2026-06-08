import { NextResponse } from 'next/server';
import { parseStoreFromParamsAsync } from '@/lib/api-store';
import { ledgerTypeLabel, signedLedgerAmount } from '@/lib/phone';
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

  const { data: ledger, error: ledgerError } = await supabase
    .from('ledger_records')
    .select('id, client_id, type, amount, payment_method, source, occurred_at, note, created_at')
    .eq('client_id', client.id)
    .order('occurred_at', { ascending: false })
    .limit(50);

  if (ledgerError) {
    return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }

  const enriched = (ledger ?? []).map((row) => ({
    ...row,
    type_label: ledgerTypeLabel(row.type),
    signed_amount: signedLedgerAmount(row.type, row.amount),
  }));

  return NextResponse.json({ client, ledger: enriched });
}
