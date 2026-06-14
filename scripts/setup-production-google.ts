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

async function connectPg(password: string): Promise<{ client: pg.Client; label: string }> {
  const regions = [
    'ap-southeast-1',
    'ap-northeast-1',
    'ap-northeast-2',
    'us-east-1',
    'eu-west-1',
  ];

  let lastError: unknown;
  for (const region of regions) {
    for (const aws of ['aws-1', 'aws-0'] as const) {
      for (const port of [5432, 6543] as const) {
        const url = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password)}@${aws}-${region}.pooler.supabase.com:${port}/postgres`;
        const client = new pg.Client({
          connectionString: url,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 10_000,
        });
        try {
          await client.connect();
          return { client, label: `${aws}-${region}:${port}` };
        } catch (e) {
          lastError = e;
          try {
            await client.end();
          } catch {
            /* ignore */
          }
        }
      }
    }
  }
  throw lastError;
}

async function applySql(client: pg.Client) {
  const sql = readFileSync(
    join(process.cwd(), 'supabase', '09_integration_settings.sql'),
    'utf8',
  );
  await client.query(sql);
}

async function saveTokensPg(
  client: pg.Client,
  local: Record<string, string>,
) {
  const refresh = local.GOOGLE_REFRESH_TOKEN;
  const calendarId = local.GOOGLE_CALENDAR_ID ?? 'muscle.com.tw@gmail.com';
  if (!refresh) throw new Error('缺少 GOOGLE_REFRESH_TOKEN');

  await client.query("NOTIFY pgrst, 'reload schema'");
  await client.query(
    `insert into integration_settings (key, value, updated_at)
     values ('google_refresh_token', $1, now()), ('google_calendar_id', $2, now())
     on conflict (key) do update
       set value = excluded.value, updated_at = excluded.updated_at`,
    [refresh, calendarId],
  );
  console.log('OK: token 已寫入 integration_settings');
}

async function verifyTokens(local: Record<string, string>) {
  const url = local.NEXT_PUBLIC_SUPABASE_URL;
  const key = local.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('integration_settings')
      .select('key')
      .order('key');
    if (!error) {
      console.log('OK: REST 可讀', data?.map((r) => r.key).join(', '));
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
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

  const { client, label } = await connectPg(password);
  try {
    await applySql(client);
    console.log(`OK: integration_settings 表（${label}）`);
    await saveTokensPg(client, local);
  } finally {
    await client.end();
  }
  await verifyTokens(local);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
