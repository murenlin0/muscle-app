import {
  syncCalendarCheckouts,
  syncCalendarDeletedAppointments,
  type CalendarDeletionSyncResult,
  type CalendarSyncResult,
} from '@/lib/calendar-checkout-sync';

export interface CalendarSyncRunResult {
  lookbackHours: number;
  deletions: CalendarDeletionSyncResult;
  checkouts: CalendarSyncResult;
}

/** 日曆刪除同步 + 結帳同步（手動按鈕與 Cron 共用） */
export async function runCalendarSync(lookbackHours = 72): Promise<CalendarSyncRunResult> {
  const bounded = Math.min(Math.max(lookbackHours, 1), 720);
  const deletions = await syncCalendarDeletedAppointments(bounded);
  const checkouts = await syncCalendarCheckouts(bounded);
  return { lookbackHours: bounded, deletions, checkouts };
}
