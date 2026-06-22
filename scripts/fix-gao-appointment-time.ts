/**
 * 修正高志朋預約時間 6/21 19:15 → 6/22 19:00（DB + Google 日曆）
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { parseStoreDateTime } from '../lib/store-timezone';
import { patchCalendarEventTimes } from '../lib/google-calendar';

const APPT_ID = '97127165-5a17-4917-a423-6826dd8ae726';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1]!.trim()] = m[2]!.trim().replace(/^["']|["']$/g, '');
}
delete process.env.GOOGLE_REFRESH_TOKEN;

async function main() {
  const startsAt = parseStoreDateTime(2026, 6, 22, 19, 0);
  const endsAt = parseStoreDateTime(2026, 6, 22, 20, 30);

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: row, error } = await sb
    .from('appointments')
    .select('id, calendar_event_id, calendar_title, starts_at')
    .eq('id', APPT_ID)
    .maybeSingle();
  if (error || !row) throw new Error(error?.message ?? '找不到預約');

  console.log('原時間:', row.starts_at);

  if (row.calendar_event_id) {
    await patchCalendarEventTimes(row.calendar_event_id as string, startsAt, endsAt);
    console.log('✓ 日曆已改為 6/22 19:00');
  }

  const { error: updErr } = await sb
    .from('appointments')
    .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
    .eq('id', APPT_ID);
  if (updErr) throw new Error(updErr.message);
  console.log('✓ 資料庫已更新');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
