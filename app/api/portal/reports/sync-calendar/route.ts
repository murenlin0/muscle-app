import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/portal-api';
import { syncCalendarCheckouts } from '@/lib/calendar-checkout-sync';

export async function POST(request: Request) {
  const session = await requireSuperAdmin();
  if (session instanceof NextResponse) return session;

  let body: { lookbackHours?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const lookbackHours = typeof body.lookbackHours === 'number'
    ? Math.min(Math.max(body.lookbackHours, 1), 720)
    : 72;

  try {
    const result = await syncCalendarCheckouts(lookbackHours);
    return NextResponse.json({ ok: true, lookbackHours, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : '同步失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
