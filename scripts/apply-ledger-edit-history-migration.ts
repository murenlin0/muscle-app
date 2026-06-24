/**
 * 套用 supabase/18_ledger_edit_history.sql
 * 需要 SUPABASE_DB_PASSWORD 或 DATABASE_URL
 *
 * 用法：npx tsx scripts/apply-ledger-edit-history-migration.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

const PROJECT_REF = 'gdbvbrpnhzfahjeprtpa';

function loadEnv() {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1]!.trim()]) {
      process.env[m[1]!.trim()] = m[2]!.trim().replace(/^["']|["']$/g, '');
    }
  }
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

async function main() {
  loadEnv();
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      const sql = readFileSync(
        join(process.cwd(), 'supabase', '18_ledger_edit_history.sql'),
        'utf8',
      );
      await client.query(sql);
      console.log('OK: daily_transaction_edits 表已建立（DATABASE_URL）');
    } finally {
      await client.end();
    }
    return;
  }

  if (!password) {
    console.error(
      '請在 .env.local 加入 SUPABASE_DB_PASSWORD 或 DATABASE_URL，再重跑此腳本。',
    );
    console.error('（Supabase Dashboard → Project Settings → Database → Database password）');
    process.exit(1);
  }

  const { client, label } = await connectPg(password);
  try {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', '18_ledger_edit_history.sql'),
      'utf8',
    );
    await client.query(sql);
    console.log(`OK: daily_transaction_edits 表已建立（${label}）`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
