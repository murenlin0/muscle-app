import { randomUUID } from 'crypto';
import { getAppBaseUrl } from '@/lib/app-base-url';
import {
  getGoogleCalendarId,
  getGoogleRefreshToken,
  getIntegrationSetting,
  setIntegrationSetting,
} from '@/lib/integration-settings';
import { refreshGoogleAccessToken } from '@/lib/google-oauth';

const WATCH_SETTING_KEY = 'google_calendar_watch';

export interface CalendarWatchState {
  channelId: string;
  resourceId: string;
  expiration: number;
  token: string;
  webhookUrl: string;
}

function watchToken(): string {
  return (
    process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    'muscle-calendar-watch-dev'
  );
}

export async function getCalendarWatchState(): Promise<CalendarWatchState | null> {
  const raw = await getIntegrationSetting(WATCH_SETTING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CalendarWatchState;
  } catch {
    return null;
  }
}

async function stopWatchChannel(state: CalendarWatchState): Promise<void> {
  const refresh = await getGoogleRefreshToken();
  if (!refresh) return;

  const accessToken = await refreshGoogleAccessToken(refresh);
  await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: state.channelId,
      resourceId: state.resourceId,
    }),
  }).catch(() => undefined);
}

/** 向 Google 註冊 events.watch，日曆變更時即時 webhook */
export async function ensureCalendarWatch(): Promise<CalendarWatchState> {
  const calendarId = await getGoogleCalendarId();
  if (!calendarId) throw new Error('缺少 GOOGLE_CALENDAR_ID');

  const refresh = await getGoogleRefreshToken();
  if (!refresh) throw new Error('尚未完成 Google OAuth 授權');

  const existing = await getCalendarWatchState();
  const renewBeforeMs = 24 * 3600 * 1000;
  if (existing && existing.expiration > Date.now() + renewBeforeMs) {
    return existing;
  }

  if (existing) {
    await stopWatchChannel(existing);
  }

  const accessToken = await refreshGoogleAccessToken(refresh);
  const webhookUrl = `${getAppBaseUrl()}/api/google/calendar-webhook`;
  const channelId = randomUUID();
  const token = watchToken();

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        token,
        params: { ttl: '604800' },
      }),
    },
  );

  const data = (await res.json()) as {
    id?: string;
    resourceId?: string;
    expiration?: string;
    error?: { message?: string };
  };

  if (!res.ok || !data.id || !data.resourceId || !data.expiration) {
    throw new Error(data.error?.message ?? '無法註冊 Google 日曆 webhook');
  }

  const state: CalendarWatchState = {
    channelId: data.id,
    resourceId: data.resourceId,
    expiration: Number(data.expiration),
    token,
    webhookUrl,
  };

  await setIntegrationSetting(WATCH_SETTING_KEY, JSON.stringify(state));
  return state;
}

export function verifyCalendarWebhookToken(request: Request): boolean {
  const expected = watchToken();
  const got = request.headers.get('x-goog-channel-token');
  return got === expected;
}
