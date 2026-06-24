/**
 * 套用 supabase/18_ledger_edit_history.sql
 * 需要 .env.local 有 SUPABASE_DB_PASSWORD 或 DATABASE_URL
 *
 * 用法：npx tsx scripts/apply-ledger-edit-history-migration.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

function loadEnv() {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1]!.trim()]) {
      process.env[m[1]!.trim()] = m[2]!.trim().replace(/^["']|["']$/g, '');
    }
  }
}

async function main() {
  loadEnv();
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
    join(process.cwd(), 'supabase', '18_ledger_edit_history.sql'),
    'utf8',
  );

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('OK: daily_transaction_edits 表已建立');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
