import { NextResponse } from 'next/server';
import { assertGoogleSetupKey } from '@/lib/google-oauth';
import {
  repairCalendarCheckout,
  syncCalendarCheckouts,
} from '@/lib/calendar-checkout-sync';

/** 一次性修復 6/18 測試預約（需 GOOGLE_OAUTH_SETUP_KEY） */
export async function GET(request: Request) {
  const keyErr = assertGoogleSetupKey(request);
  if (keyErr) {
    return NextResponse.json({ error: keyErr }, { status: 403 });
  }

  try {
    const repair = await repairCalendarCheckout({
      storeId: 'store1',
      occurredOn: '2026-06-18',
      phone: '0978542704',
    });
    const sync = await syncCalendarCheckouts(720);
    return NextResponse.json({ ok: true, repair, sync });
  } catch (e) {
    const message = e instanceof Error ? e.message : '修復失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
