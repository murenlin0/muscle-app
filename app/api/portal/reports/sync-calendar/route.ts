import { NextResponse } from 'next/server';
import { syncCalendarBackfill } from '@/lib/calendar-backfill-sync';
import { runCalendarSync } from '@/lib/calendar-sync-runner';
import { repairCalendarCheckout } from '@/lib/calendar-checkout-sync';
import { requireSuperAdmin } from '@/lib/portal-api';
import type { StoreSlug } from '@/lib/stores';

export async function POST(request: Request) {
  const session = await requireSuperAdmin();
  if (session instanceof NextResponse) return session;

  let body: {
    lookbackHours?: number;
    fromDate?: string;
    toDate?: string;
    storeId?: StoreSlug;
    dryRun?: boolean;
    repair?: { storeId?: StoreSlug; occurredOn?: string; phone?: string };
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const lookbackHours =
    typeof body.lookbackHours === 'number' ? body.lookbackHours : 72;

  try {
    let repairResult = null as Awaited<
      ReturnType<typeof repairCalendarCheckout>
    > | null;

    if (body.repair?.occurredOn && body.repair?.phone) {
      if (!body.repair.storeId) {
        return NextResponse.json({ error: 'repair 請提供 storeId' }, { status: 400 });
      }
      repairResult = await repairCalendarCheckout({
        storeId: body.repair.storeId,
        occurredOn: body.repair.occurredOn,
        phone: body.repair.phone,
      });
    }

    if (body.fromDate) {
      const backfill = await syncCalendarBackfill({
        fromDate: body.fromDate,
        toDate: body.toDate,
        storeId: body.storeId ?? 'store1',
        dryRun: body.dryRun ?? false,
      });
      return NextResponse.json({ ok: true, repair: repairResult, backfill });
    }

    const sync = await runCalendarSync(lookbackHours);
    return NextResponse.json({
      ok: true,
      repair: repairResult,
      deletions: sync.deletions,
      processed: sync.checkouts.processed,
      skipped: sync.checkouts.skipped,
      errors: [
        ...sync.deletions.errors,
        ...sync.pendingStaff.errors,
        ...sync.checkouts.errors,
        ...sync.reportStaff.errors,
      ],
      titles: sync.checkouts.titles,
      lookbackHours: sync.lookbackHours,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '同步失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
