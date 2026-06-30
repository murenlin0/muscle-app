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

/** 標題是否含結帳金額（+儲值-使用、會員扣款、現金金額） */
export function calendarTitleHasCheckoutAmounts(title: string): boolean {
  const t = normReportTitle(title);
  if (/\+\d+-\d+/.test(t)) return true;
  if (/\d+分-\d{3,}/.test(t)) return true;
  if (/\d+分(\d{3,5})(?!\+|-)/.test(t)) return true;
  return false;
}

export function minutesFromCalendarTitle(title: string): string | null {
  return title.match(/(\d+)分/)?.[1] ?? null;
}

/**
 * 日曆標題僅改師傅（有電話與分鐘、無結帳金額），報表同日已有該客戶列。
 * 此類事件應更新 staff_name，不應補匯新列。
 */
export function calendarEventIsStaffRenameOnly(
  calTitle: string,
  dayRows: ReportRowForMatch[],
): boolean {
  if (calendarTitleHasCheckoutAmounts(calTitle)) return false;
  const phone = phoneFromTitle(calTitle);
  if (!phone) return false;
  const phoneRows = dayRows.filter((r) => r.title.includes(phone));
  return phoneRows.length >= 1;
}

/** 標題已含電話＋結帳金額，可視為已結帳（即使日曆未改顏色） */
export function inferCheckoutPaymentFromTitle(title: string): {
  methods: string[];
  defaultCategory: '一般消費' | '會員使用';
} | null {
  const t = normReportTitle(title);
  if (!phoneFromTitle(title)) return null;

  if (/\+\d+-\d+/.test(t) || /\d+分-\d{3,}/.test(t)) {
    return { methods: [], defaultCategory: '會員使用' };
  }
  if (/\d+分\d{3,5}(?!\+|-)/.test(t)) {
    return { methods: ['現金'], defaultCategory: '一般消費' };
  }
  return null;
}

/** 日曆事件是否應視為已結帳（有結帳色，或標題已寫完金額+電話且非灰=待結帳） */
export function isCalendarCheckoutEvent(
  colorId: string | undefined,
  title: string,
  checkoutColors: Record<string, unknown>,
): boolean {
  const color = colorId ?? '';
  if (color === '8') return false;
  if (color in checkoutColors) return true;
  if (color === '' && inferCheckoutPaymentFromTitle(title)) return true;
  return false;
}
