import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getSupabaseAdmin } from '@/lib/supabase';

const GOOGLE_REFRESH_KEY = 'google_refresh_token';
const GOOGLE_CALENDAR_KEY = 'google_calendar_id';

export async function getIntegrationSetting(key: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('integration_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) return null;
    return data?.value?.trim() || null;
  } catch {
    return null;
  }
}

export async function setIntegrationSetting(key: string, value: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('integration_settings').upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) throw new Error(error.message);
}

export async function getGoogleRefreshToken(): Promise<string | null> {
  const fromEnv = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return getIntegrationSetting(GOOGLE_REFRESH_KEY);
}

export async function getGoogleCalendarId(): Promise<string | null> {
  const fromEnv = process.env.GOOGLE_CALENDAR_ID?.trim();
  if (fromEnv) return fromEnv;
  return getIntegrationSetting(GOOGLE_CALENDAR_KEY);
}

export async function saveGoogleOAuthTokens(input: {
  refreshToken: string;
  calendarId: string;
}): Promise<void> {
  upsertLocalEnv({
    GOOGLE_REFRESH_TOKEN: input.refreshToken,
    GOOGLE_CALENDAR_ID: input.calendarId,
  });
  try {
    await setIntegrationSetting(GOOGLE_REFRESH_KEY, input.refreshToken);
    await setIntegrationSetting(GOOGLE_CALENDAR_KEY, input.calendarId);
  } catch {
    // 本機僅 .env.local 亦可運作；正式環境請執行 supabase/09_integration_settings.sql
  }
}

/** 本機 dev：自動寫入 .env.local，免手動複製 */
function upsertLocalEnv(updates: Record<string, string>): void {
  if (process.env.NODE_ENV === 'production') return;
  const envPath = join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;

  let text = readFileSync(envPath, 'utf8');
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^#?\\s*${key}=.*$`, 'm');
    if (pattern.test(text)) {
      text = text.replace(pattern, line);
    } else {
      text = `${text.trimEnd()}\n${line}\n`;
    }
  }
  writeFileSync(envPath, text, 'utf8');
}

export async function isGoogleCalendarReady(): Promise<boolean> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return false;
  const refresh = await getGoogleRefreshToken();
  const calendarId = await getGoogleCalendarId();
  return Boolean(refresh && calendarId);
}
