import { NextResponse } from 'next/server';
import { parseStoreFromParamsAsync } from '@/lib/api-store';
import { formatClientTitleSegment, parseNamePhone } from '@/lib/phone';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(
  request: Request,
  context: { params: Promise<{ store: string }> },
) {
  const store = await parseStoreFromParamsAsync(context.params);
  if (store instanceof NextResponse) return store;

  const lineUserId = request.headers.get('x-line-user-id');
  if (!lineUserId) {
    return NextResponse.json({ error: 'missing x-line-user-id' }, { status: 400 });
  }

  let body: { name?: string; phone?: string };
  try {
    body = (await request.json()) as { name?: string; phone?: string };
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const name = body.name?.trim();
  const phoneRaw = body.phone?.trim();
  if (!name || !phoneRaw) {
    return NextResponse.json({ error: '請填寫本名與電話' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseNamePhone(formatClientTitleSegment(name, phoneRaw));
  } catch {
    return NextResponse.json({ error: '電話格式須為 09 開頭 10 碼' }, { status: 400 });
  }

  if (!parsed) {
    return NextResponse.json({ error: '姓名或電話格式不正確' }, { status: 400 });
  }

  const { phone, name: cleanName } = parsed;
  const supabase = getSupabaseAdmin();

  const { data: byPhone } = await supabase
    .from('clients')
    .select('id, line_user_id')
    .eq('store_id', store)
    .eq('phone', phone)
    .maybeSingle();

  if (byPhone?.line_user_id && byPhone.line_user_id !== lineUserId) {
    return NextResponse.json(
      { error: '此電話已綁定其他 LINE 帳號，請洽店內協助' },
      { status: 409 },
    );
  }

  const { data: byLine } = await supabase
    .from('clients')
    .select('id')
    .eq('store_id', store)
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  const payload = {
    store_id: store,
    phone,
    name: cleanName,
    line_user_id: lineUserId,
    is_active: true,
  };

  const selectCols =
    'id, store_id, phone, line_user_id, name, is_vip, initial_balance, balance, is_active, created_at, updated_at';

  /** 電話已存在 → 連到同一筆會員（保留餘額與 ledger_records） */
  if (byPhone) {
    if (byLine && byLine.id !== byPhone.id) {
      await supabase
        .from('clients')
        .update({ line_user_id: null })
        .eq('id', byLine.id);
    }

    const { data, error } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', byPhone.id)
      .select(selectCols)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ client: data, action: 'linked' as const });
  }

  /** 電話不存在 → 更新既有 LINE 列或新建 */
  const { data, error } = byLine
    ? await supabase
        .from('clients')
        .update(payload)
        .eq('id', byLine.id)
        .select(selectCols)
        .single()
    : await supabase
        .from('clients')
        .insert({ ...payload, initial_balance: 0, balance: 0 })
        .select(selectCols)
        .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    client: data,
    action: byLine ? ('updated' as const) : ('created' as const),
  });
}
