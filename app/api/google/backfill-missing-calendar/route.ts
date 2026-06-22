import { NextResponse } from 'next/server';
import { assertGoogleSetupKey } from '@/lib/google-oauth';
import { createPendingCheckoutEvent } from '@/lib/google-calendar';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getPortalSession, canViewReports } from '@/lib/portal-session';

/** 補建缺 Google 日曆事件的 pending_checkout 預約（需 setup key 或後台登入） */
export async function POST(request: Request) {
  const keyErr = assertGoogleSetupKey(request);
  const session = await getPortalSession();
  const adminOk = session && canViewReports(session);
  if (keyErr && !adminOk) {
    return NextResponse.json({ error: keyErr }, { status: 403 });
  }

  let body: { ids?: string[]; dryRun?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const dryRun = body.dryRun === true;
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('appointments')
    .select(
      'id, calendar_title, starts_at, ends_at, note, raw_message, calendar_event_id, status',
    )
    .is('calendar_event_id', null)
    .eq('status', 'pending_checkout')
    .order('created_at', { ascending: false })
    .limit(20);

  if (body.ids?.length) {
    query = supabase
      .from('appointments')
      .select(
        'id, calendar_title, starts_at, ends_at, note, raw_message, calendar_event_id, status',
      )
      .in('id', body.ids);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!rows?.length) {
    return NextResponse.json({ ok: true, message: '沒有需要補建的預約', results: [] });
  }

  const results: Array<{
    id: string;
    calendar_title: string;
    calendar_event_id?: string;
    htmlLink?: string | null;
    error?: string;
    dryRun?: boolean;
  }> = [];

  for (const row of rows) {
    if (row.calendar_event_id) continue;

    const item = {
      id: row.id as string,
      calendar_title: row.calendar_title as string,
    };

    if (dryRun) {
      results.push({ ...item, dryRun: true });
      continue;
    }

    try {
      const event = await createPendingCheckoutEvent({
        title: row.calendar_title as string,
        startsAt: new Date(row.starts_at as string),
        endsAt: new Date(row.ends_at as string),
        note: (row.note as string | null) ?? undefined,
        description: (row.raw_message as string | null) ?? undefined,
      });

      const { error: updErr } = await supabase
        .from('appointments')
        .update({
          calendar_event_id: event.id,
          calendar_event_etag: event.etag,
        })
        .eq('id', row.id);

      if (updErr) throw new Error(updErr.message);

      results.push({
        ...item,
        calendar_event_id: event.id,
        htmlLink: event.htmlLink,
      });
    } catch (e) {
      results.push({
        ...item,
        error: e instanceof Error ? e.message : '建立失敗',
      });
    }
  }

  const failed = results.filter((r) => r.error);
  return NextResponse.json({
    ok: failed.length === 0,
    dryRun,
    count: results.length,
    results,
  });
}
