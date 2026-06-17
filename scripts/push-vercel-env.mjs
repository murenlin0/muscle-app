import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

function parseEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const env = parseEnv('.env.local');
const keys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_LIFF_ID_STORE1',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'GOOGLE_CALENDAR_ID',
  'GOOGLE_OAUTH_SETUP_KEY',
  'CRON_SECRET',
  'CALENDAR_SYNC_LOOKBACK_HOURS',
  'APP_BASE_URL',
];

for (const key of keys) {
  const val =
    key === 'GOOGLE_REDIRECT_URI'
      ? 'https://muscle.com.tw/api/google/callback'
      : env[key];
  if (!val) {
    console.log(`skip ${key}`);
    continue;
  }
  console.log(`set ${key}`);
  execFileSync(
    'npx',
    ['vercel', 'env', 'add', key, 'production', '--value', val, '--force', '--yes'],
    { stdio: 'inherit', shell: true },
  );
}

execFileSync(
  'npx',
  [
    'vercel',
    'env',
    'add',
    'GOOGLE_REDIRECT_URI',
    'production',
    '--value',
    'https://muscle.com.tw/api/google/callback',
    '--force',
    '--yes',
  ],
  { stdio: 'inherit', shell: true },
);

console.log('env done');
