import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/portal-api';
import {
  repairCalendarCheckout,
  syncCalendarCheckouts,
  syncCalendarDeletedAppointments,
} from '@/lib/calendar-checkout-sync';
import type { StoreSlug } from '@/lib/stores';

export async function POST(request: Request) {
  const session = await requireSuperAdmin();
  if (session instanceof NextResponse) return session;

  let body: {
    lookbackHours?: number;
    repair?: { storeId?: StoreSlug; occurredOn?: string; phone?: string };
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const lookbackHours =
    typeof body.lookbackHours === 'number'
      ? Math.min(Math.max(body.lookbackHours, 1), 720)
      : 72;

  try {
    let repairResult = null as Awaited<
      ReturnType<typeof repairCalendarCheckout>
    > | null;

    if (body.repair?.occurredOn && body.repair?.phone) {
      repairResult = await repairCalendarCheckout({
        storeId: body.repair.storeId ?? 'store1',
        occurredOn: body.repair.occurredOn,
        phone: body.repair.phone,
      });
    }

    const deletions = await syncCalendarDeletedAppointments(lookbackHours);
    const result = await syncCalendarCheckouts(lookbackHours);
    return NextResponse.json({
      ok: true,
      lookbackHours,
      repair: repairResult,
      deletions,
      ...result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '同步失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
