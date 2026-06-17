import { after } from 'next/server';
import { NextResponse } from 'next/server';
import { runCalendarSync } from '@/lib/calendar-sync-runner';
import { verifyCalendarWebhookToken } from '@/lib/google-calendar-watch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Google Calendar Push Notification
 * 師傅改色結帳或刪除事件 → 即時同步（不需等 Cron）
 */
export async function POST(request: Request) {
  if (!verifyCalendarWebhookToken(request)) {
    return NextResponse.json({ error: '未授權' }, { status: 401 });
  }

  const resourceState = request.headers.get('x-goog-resource-state') ?? '';

  // Google 註冊 channel 時的握手
  if (resourceState === 'sync') {
    return new NextResponse(null, { status: 200 });
  }

  // exists = 事件新增/更新（含改色結帳）；not_exists = 事件刪除
  if (resourceState === 'exists' || resourceState === 'not_exists') {
    const lookbackHours = Number(process.env.CALENDAR_SYNC_LOOKBACK_HOURS ?? 2);
    after(async () => {
      try {
        await runCalendarSync(lookbackHours);
      } catch (e) {
        console.error('[calendar-webhook] sync failed', e);
      }
    });
  }

  return new NextResponse(null, { status: 200 });
}
