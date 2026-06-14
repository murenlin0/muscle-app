import { NextResponse } from 'next/server';
import {
  getGoogleOAuthConfig,
  isGoogleCalendarConfigured,
  listGoogleCalendars,
  refreshGoogleAccessToken,
} from '@/lib/google-oauth';
import { getPortalSession, canViewReports } from '@/lib/portal-session';

export async function GET(request: Request) {
  const session = await getPortalSession();
  if (!session || !canViewReports(session)) {
    return NextResponse.json({ error: '請先登入後台' }, { status: 401 });
  }

  const config = getGoogleOAuthConfig(request);
  const configured = isGoogleCalendarConfigured();

  if (!configured) {
    return NextResponse.json({
      configured: false,
      hasClientCredentials: Boolean(config),
      calendarId: process.env.GOOGLE_CALENDAR_ID ?? null,
      redirectUri: config?.redirectUri ?? null,
    });
  }

  try {
    const accessToken = await refreshGoogleAccessToken();
    const calendars = await listGoogleCalendars(accessToken);
    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() ?? '';
    const target = calendars.find((c) => c.id === calendarId);

    return NextResponse.json({
      configured: true,
      calendarId,
      calendarFound: Boolean(target),
      calendarSummary: target?.summary ?? null,
      writableCalendars: calendars.length,
    });
  } catch (e) {
    return NextResponse.json({
      configured: true,
      error: e instanceof Error ? e.message : '連線測試失敗',
    });
  }
}
