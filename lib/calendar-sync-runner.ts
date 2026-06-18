import {
  syncCalendarCheckouts,
  syncCalendarCompletedStaffRenames,
  syncCalendarDeletedAppointments,
  syncCalendarPendingStaffChanges,
  type CalendarDeletionSyncResult,
  type CalendarReportStaffSyncResult,
  type CalendarStaffSyncResult,
  type CalendarSyncResult,
} from '@/lib/calendar-checkout-sync';

export interface CalendarSyncRunResult {
  lookbackHours: number;
  deletions: CalendarDeletionSyncResult;
  pendingStaff: CalendarStaffSyncResult;
  checkouts: CalendarSyncResult;
  reportStaff: CalendarReportStaffSyncResult;
}

/** 日曆刪除同步 + 待結帳改師傅 + 結帳同步 + 結帳後報表改師傅（手動按鈕與 Cron 共用） */
export async function runCalendarSync(lookbackHours = 72): Promise<CalendarSyncRunResult> {
  const bounded = Math.min(Math.max(lookbackHours, 1), 720);
  const deletions = await syncCalendarDeletedAppointments(bounded);
  const pendingStaff = await syncCalendarPendingStaffChanges(bounded);
  const checkouts = await syncCalendarCheckouts(bounded);
  const reportStaff = await syncCalendarCompletedStaffRenames(bounded);
  return { lookbackHours: bounded, deletions, pendingStaff, checkouts, reportStaff };
}
