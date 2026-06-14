/**
 * 套用 supabase/09_integration_settings.sql
 * 需要 .env.local 有 SUPABASE_DB_PASSWORD（Supabase Dashboard → Database → Database password）
 *
 * 用法：npx tsx scripts/apply-integration-settings.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

async function main() {
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const url = process.env.DATABASE_URL?.trim();
  const projectRef = 'gdbvbrpnhzfahjeprtpa';

  const connectionString =
    url ||
    (password
      ? `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`
      : null);

  if (!connectionString) {
    console.error(
      '請在 .env.local 加入 SUPABASE_DB_PASSWORD 或 DATABASE_URL，再重跑此腳本。',
    );
    process.exit(1);
  }

  const sql = readFileSync(
    join(process.cwd(), 'supabase', '09_integration_settings.sql'),
    'utf8',
  );

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('OK: integration_settings 表已建立');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
