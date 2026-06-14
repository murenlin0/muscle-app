/**
 * 將 .env.local 的 Google 設定推到 Vercel（muscle-app-mivu / muscle.com.tw）
 * 用法：npx tsx scripts/push-google-vercel-env.ts
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function addVercelEnv(name: string, value: string) {
  console.log(`→ ${name} (production)`);
  execFileSync(
    'npx',
    ['vercel', 'env', 'add', name, 'production', '--value', value, '--force', '--yes', '--non-interactive'],
    { stdio: 'inherit', cwd: process.cwd(), shell: true },
  );
}

const local = parseEnvFile('.env.local');
const values: Record<string, string> = {
  GOOGLE_CLIENT_ID: local.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: local.GOOGLE_CLIENT_SECRET ?? '',
  GOOGLE_OAUTH_SETUP_KEY: local.GOOGLE_OAUTH_SETUP_KEY ?? '',
  GOOGLE_CALENDAR_ID: local.GOOGLE_CALENDAR_ID ?? 'muscle.com.tw@gmail.com',
  GOOGLE_REFRESH_TOKEN: local.GOOGLE_REFRESH_TOKEN ?? '',
  GOOGLE_REDIRECT_URI: 'https://muscle.com.tw/api/google/callback',
};

for (const [key, value] of Object.entries(values)) {
  if (!value) {
    console.warn(`略過 ${key}（.env.local 無值）`);
    continue;
  }
  addVercelEnv(key, value);
}

console.log('完成。請到 Vercel 觸發重新部署（或 push main）。');
