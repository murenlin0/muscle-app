import { readFileSync } from 'fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m && !process.env[m[1]!.trim()]) {
    process.env[m[1]!.trim()] = m[2]!.trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  const { refreshGoogleAccessToken } = await import('../lib/google-oauth');
  const { getGoogleRefreshToken, getGoogleCalendarId, getIntegrationSetting } = await import(
    '../lib/integration-settings'
  );

  const refresh = await getGoogleRefreshToken();
  const calendarId = await getGoogleCalendarId();
  const dbRefresh = await getIntegrationSetting('google_refresh_token');

  console.log('has env refresh:', Boolean(process.env.GOOGLE_REFRESH_TOKEN?.trim()));
  console.log('has db refresh:', Boolean(dbRefresh));
  console.log('resolved refresh:', Boolean(refresh));
  console.log('calendarId:', calendarId ?? '(none)');

  try {
    const access = await refreshGoogleAccessToken();
    console.log('refresh OK, access token length:', access.length);
  } catch (e) {
    console.log('refresh FAIL:', e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
