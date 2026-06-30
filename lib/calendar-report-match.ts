/** 日曆事件 vs 報表列：標題/電話/gcal 比對（不依賴 Notion） */

export type ReportRowForMatch = {
  title: string;
  amount: number;
  member_note: string | null;
};

export function normReportTitle(s: string): string {
  return s.replace(/\s+/g, '').replace(/⚠️/g, '').trim();
}

export function phoneFromTitle(t: string): string | null {
  return t.match(/09\d{8}/)?.[0] ?? null;
}

function amountsFromTitle(t: string): number[] {
  const nums = [...t.matchAll(/\d{3,5}/g)].map((m) => Number(m[0]));
  return nums.filter((n) => n >= 100 && n <= 50000);
}

/** 日曆事件是否已在當日報表有對應列 */
export function calendarEventMatchesReportRows(
  eventId: string,
  calTitle: string,
  dayRows: ReportRowForMatch[],
): boolean {
  const gcalKey = `gcal:${eventId}`;
  for (const r of dayRows) {
    if (r.member_note?.startsWith(gcalKey)) return true;
  }

  const nCal = normReportTitle(calTitle);
  for (const r of dayRows) {
    if (normReportTitle(r.title) === nCal) return true;
  }

  const phone = phoneFromTitle(calTitle);
  if (!phone) return false;

  const phoneRows = dayRows.filter((r) => r.title.includes(phone));
  if (phoneRows.length === 1) return true;

  const calAmounts = amountsFromTitle(calTitle);
  for (const r of phoneRows) {
    if (calAmounts.includes(Math.abs(r.amount))) return true;
  }

  if (phoneRows.length >= 2 && calTitle.includes('+') && calTitle.includes('-')) {
    return true;
  }

  return false;
}
