import { NextResponse } from 'next/server';
import { runCalendarSync } from '@/lib/calendar-sync-runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function assertCronAuthorized(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: '未設定 CRON_SECRET' }, { status: 500 });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '未授權' }, { status: 401 });
  }
  return null;
}

/** 外部排程或手動呼叫：同步日曆刪除與結帳（Hobby 無法用 Vercel Cron 每 5 分鐘） */
export async function GET(request: Request) {
  const denied = assertCronAuthorized(request);
  if (denied) return denied;

  const lookbackHours = Number(process.env.CALENDAR_SYNC_LOOKBACK_HOURS ?? 72);

  try {
    const { ensureCalendarWatch } = await import('@/lib/google-calendar-watch');
    await ensureCalendarWatch().catch((e) => {
      console.error('[cron/calendar-sync] watch ensure failed', e);
    });

    const result = await runCalendarSync(lookbackHours);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : '同步失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
