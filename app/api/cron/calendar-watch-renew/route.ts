import { NextResponse } from 'next/server';
import { ensureCalendarWatch } from '@/lib/google-calendar-watch';

export const dynamic = 'force-dynamic';

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

/** 每日續訂 Google 日曆 webhook（channel 最多 7 天） */
export async function GET(request: Request) {
  const denied = assertCronAuthorized(request);
  if (denied) return denied;

  try {
    const watch = await ensureCalendarWatch();
    return NextResponse.json({
      ok: true,
      channelId: watch.channelId,
      expiration: new Date(watch.expiration).toISOString(),
      webhookUrl: watch.webhookUrl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '續訂失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
