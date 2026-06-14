/** Google Calendar OAuth（個人 Gmail + 授權碼流程） */

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
}

export function getGoogleOAuthConfig(request: Request): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const fromEnv = process.env.GOOGLE_REDIRECT_URI?.trim();
  const redirectUri =
    fromEnv || `${new URL(request.url).origin}/api/google/callback`;

  return { clientId, clientSecret, redirectUri };
}

export function assertGoogleSetupKey(request: Request): string | null {
  const required = process.env.GOOGLE_OAUTH_SETUP_KEY?.trim();
  if (!required) {
    return '請在 .env.local 設定 GOOGLE_OAUTH_SETUP_KEY（自訂一組只有你知道的字串）';
  }
  const key = new URL(request.url).searchParams.get('key');
  if (key !== required) {
    return '缺少或錯誤的 key 參數';
  }
  return null;
}

export function buildGoogleAuthUrl(config: GoogleOAuthConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  config: GoogleOAuthConfig,
): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const data = (await res.json()) as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(data.error_description ?? data.error ?? '無法換取 token');
  }
  return data;
}

export async function listGoogleCalendars(
  accessToken: string,
): Promise<GoogleCalendarListEntry[]> {
  const res = await fetch(`${CALENDAR_LIST_URL}?minAccessRole=writer`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as {
    items?: GoogleCalendarListEntry[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data.error?.message ?? '無法讀取日曆列表');
  }
  return data.items ?? [];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
