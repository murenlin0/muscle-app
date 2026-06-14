/**
 * 建立 integration_settings 並寫入 Google token（需 SUPABASE_DB_PASSWORD）
 * 用法：npx tsx scripts/setup-production-google.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF = 'gdbvbrpnhzfahjeprtpa';

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

async function applySql(password: string) {
  const regions = [
    'ap-northeast-1',
    'ap-southeast-1',
    'us-east-1',
    'eu-west-1',
  ];
  const sql = readFileSync(
    join(process.cwd(), 'supabase', '09_integration_settings.sql'),
    'utf8',
  );

  let lastError: unknown;
  for (const region of regions) {
    const url = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
    const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      await client.query(sql);
      await client.end();
      console.log(`OK: integration_settings（region ${region}）`);
      return;
    } catch (e) {
      lastError = e;
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  throw lastError;
}

async function saveTokens(local: Record<string, string>) {
  const url = local.NEXT_PUBLIC_SUPABASE_URL;
  const key = local.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('缺少 Supabase URL / service role key');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const refresh = local.GOOGLE_REFRESH_TOKEN;
  const calendarId = local.GOOGLE_CALENDAR_ID ?? 'muscle.com.tw@gmail.com';
  if (!refresh) throw new Error('缺少 GOOGLE_REFRESH_TOKEN');

  const rows = [
    { key: 'google_refresh_token', value: refresh },
    { key: 'google_calendar_id', value: calendarId },
  ];
  const { error } = await supabase.from('integration_settings').upsert(
    rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
    { onConflict: 'key' },
  );
  if (error) throw new Error(error.message);
  console.log('OK: token 已寫入 integration_settings');
}

async function main() {
  const local = parseEnvFile('.env.local');
  const password = local.SUPABASE_DB_PASSWORD ?? process.env.SUPABASE_DB_PASSWORD;
  if (!password) {
    console.error(
      '請在 .env.local 加入一行：SUPABASE_DB_PASSWORD=你的資料庫密碼',
    );
    console.error('（Supabase Dashboard → Project Settings → Database → Database password）');
    process.exit(1);
  }

  await applySql(password);
  await saveTokens(local);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
