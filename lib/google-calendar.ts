import { getGoogleCalendarId, getGoogleRefreshToken } from '@/lib/integration-settings';
import { refreshGoogleAccessToken } from '@/lib/google-oauth';
import { formatStoreDateTimeForGoogle, STORE_TIMEZONE } from '@/lib/store-timezone';

/** Google Calendar 色碼：8 = 灰（待結帳） */
export const CALENDAR_COLOR_PENDING = '8';

export interface CreateCalendarEventInput {
  title: string;
  startsAt: Date;
  endsAt: Date;
  note?: string | null;
  description?: string | null;
}

export interface CreatedCalendarEvent {
  id: string;
  htmlLink: string | null;
  etag: string | null;
}

async function calendarAccessToken(): Promise<string> {
  const refresh = await getGoogleRefreshToken();
  if (!refresh) {
    throw new Error('尚未完成 Google OAuth（缺少 refresh token）');
  }
  return refreshGoogleAccessToken(refresh);
}

export async function createPendingCheckoutEvent(
  input: CreateCalendarEventInput,
): Promise<CreatedCalendarEvent> {
  const calendarId = await getGoogleCalendarId();
  if (!calendarId) {
    throw new Error('缺少 GOOGLE_CALENDAR_ID');
  }

  const accessToken = await calendarAccessToken();
  const description = [input.note, input.description].filter(Boolean).join('\n\n') || undefined;

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: input.title,
        description,
        start: {
          dateTime: formatStoreDateTimeForGoogle(input.startsAt),
          timeZone: STORE_TIMEZONE,
        },
        end: {
          dateTime: formatStoreDateTimeForGoogle(input.endsAt),
          timeZone: STORE_TIMEZONE,
        },
        colorId: CALENDAR_COLOR_PENDING,
      }),
    },
  );

  const data = (await res.json()) as {
    id?: string;
    htmlLink?: string;
    etag?: string;
    error?: { message?: string };
  };

  if (!res.ok || !data.id) {
    throw new Error(data.error?.message ?? '無法建立 Google 日曆事件');
  }

  return {
    id: data.id,
    htmlLink: data.htmlLink ?? null,
    etag: data.etag ?? null,
  };
}

/** PATCH 日曆事件標題（summary） */
export async function patchCalendarEventSummary(
  eventId: string,
  summary: string,
): Promise<void> {
  const calendarId = await getGoogleCalendarId();
  if (!calendarId) throw new Error('缺少 GOOGLE_CALENDAR_ID');

  const accessToken = await calendarAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ summary }),
    },
  );

  if (!res.ok) {
    const err = (await res.json()) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? '無法更新日曆事件標題');
  }
}

/** 查詢日曆事件是否仍存在（404 或 cancelled 視為已刪除） */
export async function getCalendarEventSummary(
  eventId: string,
): Promise<{ status: 'active' | 'cancelled' | 'missing'; summary: string | null }> {
  const calendarId = await getGoogleCalendarId();
  if (!calendarId) throw new Error('缺少 GOOGLE_CALENDAR_ID');

  const accessToken = await calendarAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (res.status === 404) return { status: 'missing', summary: null };

  const data = (await res.json()) as {
    status?: string;
    summary?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message ?? '無法查詢日曆事件');
  }
  if (data.status === 'cancelled') {
    return { status: 'cancelled', summary: data.summary ?? null };
  }
  return { status: 'active', summary: data.summary ?? null };
}

/** 查詢日曆事件是否仍存在（404 或 cancelled 視為已刪除） */
export async function getCalendarEventStatus(
  eventId: string,
): Promise<'active' | 'cancelled' | 'missing'> {
  const calendarId = await getGoogleCalendarId();
  if (!calendarId) throw new Error('缺少 GOOGLE_CALENDAR_ID');

  const accessToken = await calendarAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (res.status === 404) return 'missing';

  const data = (await res.json()) as { status?: string; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message ?? '無法查詢日曆事件');
  }
  if (data.status === 'cancelled') return 'cancelled';
  return 'active';
}
