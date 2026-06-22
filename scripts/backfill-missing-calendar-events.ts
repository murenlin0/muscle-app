/**
 * 補建缺 Google 日曆事件的 appointments（師傅 UI 建立但 token 失效時）
 *
 * 預覽：npx tsx scripts/backfill-missing-calendar-events.ts --dry-run
 * 正式：npx tsx scripts/backfill-missing-calendar-events.ts
 * 指定：npx tsx scripts/backfill-missing-calendar-events.ts --id=uuid1,uuid2
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { createPendingCheckoutEvent } from '../lib/google-calendar';
import { getGoogleRefreshToken } from '../lib/integration-settings';
import { refreshGoogleAccessToken } from '../lib/google-oauth';

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* use process.env */
  }
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const idArg = process.argv.find((a) => a.startsWith('--id='))?.slice(5);
  const ids = idArg ? idArg.split(',').map((s) => s.trim()).filter(Boolean) : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('缺少 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

  console.log('測試 Google token…');
  const refresh = await getGoogleRefreshToken();
  await refreshGoogleAccessToken(refresh ?? undefined);
  console.log('✓ Google token 有效\n');

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let query = supabase
    .from('appointments')
    .select(
      'id, calendar_title, starts_at, ends_at, note, raw_message, status, created_at, calendar_event_id',
    )
    .is('calendar_event_id', null)
    .eq('status', 'pending_checkout')
    .order('created_at', { ascending: false })
    .limit(ids ? 50 : 10);

  if (ids?.length) {
    query = supabase
      .from('appointments')
      .select(
        'id, calendar_title, starts_at, ends_at, note, raw_message, status, created_at, calendar_event_id',
      )
      .in('id', ids);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  if (!rows?.length) {
    console.log('找不到缺 calendar_event_id 的 pending_checkout 預約');
    return;
  }

  console.log(`${dryRun ? '[預覽]' : '[正式]'} 共 ${rows.length} 筆待補建日曆：\n`);

  for (const row of rows) {
    const title = row.calendar_title as string;
    const startsAt = new Date(row.starts_at as string);
    const endsAt = new Date(row.ends_at as string);
    console.log(`· ${row.id}`);
    console.log(`  標題：${title}`);
    console.log(`  時間：${startsAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);
    console.log(`  建立：${row.created_at}`);

    if (dryRun) {
      console.log('  → 預覽模式，略過建立\n');
      continue;
    }

    const event = await createPendingCheckoutEvent({
      title,
      startsAt,
      endsAt,
      note: (row.note as string | null) ?? undefined,
      description: (row.raw_message as string | null) ?? undefined,
    });

    const { error: updErr } = await supabase
      .from('appointments')
      .update({
        calendar_event_id: event.id,
        calendar_event_etag: event.etag,
      })
      .eq('id', row.id);

    if (updErr) throw new Error(updErr.message);

    console.log(`  ✓ 日曆事件：${event.id}`);
    if (event.htmlLink) console.log(`  連結：${event.htmlLink}`);
    console.log('');
  }

  console.log('完成');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
