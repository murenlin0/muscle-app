import { parseCompoundVipTitle } from '@/lib/ledger-title-fix';
import { parseBalanceAfter顿号 } from '@/lib/ledger-title-balance';
import { patchCalendarEventSummary } from '@/lib/google-calendar';
import { parseNotionNamePhone, stripAllSpaces } from '@/lib/phone';
import type { TransactionCategory } from '@/lib/transaction-category';

export function calendarTitleHasBalance(title: string): boolean {
  return parseCompoundVipTitle(title) !== null || parseBalanceAfter顿号(stripAllSpaces(title)) !== null;
}

function vipSuffixFromTitle(
  title: string,
  clientName: string | null,
  clientPhone: string | null,
): string {
  if (clientName && clientPhone) {
    const vip = clientName.startsWith('VIP') ? clientName : `VIP${clientName}`;
    return `${vip}${clientPhone}`;
  }
  const parsed = parseNotionNamePhone(title);
  if (parsed) {
    const vip = parsed.isVip ? `VIP${parsed.name}` : parsed.name;
    return `${vip}${parsed.phone}`;
  }
  const m = stripAllSpaces(title).match(/VIP.+$/i);
  return m?.[0] ?? '';
}

/** 合寫結帳標題：仁60分+4000-1000、4000VIP林芸0958714258 */
export function buildCompoundCalendarSummary(
  originalTitle: string,
  topup: number,
  usage: number,
  balanceAfterUsage: number,
  clientName: string | null,
  clientPhone: string | null,
): string {
  const t = stripAllSpaces(originalTitle);
  const head = t.match(/^(.+?\d+分)/)?.[1] ?? '';
  const vip = vipSuffixFromTitle(originalTitle, clientName, clientPhone);
  return `${head}+${topup}-${usage}、${balanceAfterUsage}${vip}`;
}

/** 單筆會員使用：仁60分-1000、4000VIP… */
export function buildMemberUsageCalendarSummary(
  originalTitle: string,
  usage: number,
  balanceAfter: number,
  clientName: string | null,
  clientPhone: string | null,
): string {
  const t = stripAllSpaces(originalTitle);
  const head = t.match(/^(.+?\d+分)/)?.[1] ?? t.replace(/-\d+.*$/, '');
  const vip = vipSuffixFromTitle(originalTitle, clientName, clientPhone);
  return `${head}-${usage}、${balanceAfter}${vip}`;
}

export function resolveCalendarTitlePatch(
  originalTitle: string,
  input: {
    topup?: number;
    usage: number;
    balanceAfterUsage: number;
    clientName: string | null;
    clientPhone: string | null;
  },
): string | null {
  if (calendarTitleHasBalance(originalTitle)) return null;

  if (input.topup && input.topup > 0) {
    return buildCompoundCalendarSummary(
      originalTitle,
      input.topup,
      input.usage,
      input.balanceAfterUsage,
      input.clientName,
      input.clientPhone,
    );
  }

  return buildMemberUsageCalendarSummary(
    originalTitle,
    input.usage,
    input.balanceAfterUsage,
    input.clientName,
    input.clientPhone,
  );
}

/** 流水帳標題缺頓號餘額時補上（與日曆回寫格式一致） */
export function applyTitleBalanceIfMissing(
  title: string,
  category: TransactionCategory,
  amount: number,
  balanceAfter: number,
  clientName: string | null,
  clientPhone: string | null,
): string {
  if (parseBalanceAfter顿号(stripAllSpaces(title)) !== null) return title;
  if (!['會員儲值', '會員使用', '會員補差額'].includes(category)) return title;

  const t = stripAllSpaces(title);
  const vipSuffix =
    clientName && clientPhone
      ? `VIP${clientName}${clientPhone}`
      : t.match(/VIP.+$/)?.[0] ?? '';

  const head = t.match(/^(.+?\d+分)/)?.[1] ?? t.match(/^(.+?)(?=\+|-|\d)/)?.[1] ?? '';

  if (category === '會員使用') {
    return `${head}-${amount}、${balanceAfter}${vipSuffix}`;
  }
  if (category === '會員儲值') {
    return head
      ? `${head}+${amount}、${balanceAfter}${vipSuffix}`
      : `+${amount}、${balanceAfter}${vipSuffix}`;
  }
  return title;
}

/** 原日曆標題缺、餘額時回寫 Google Calendar */
export async function patchGoogleCalendarTitleIfNeeded(
  eventId: string,
  originalTitle: string,
  input: {
    topup?: number;
    usage: number;
    balanceAfterUsage: number;
    clientName: string | null;
    clientPhone: string | null;
  },
): Promise<string | null> {
  const patched = resolveCalendarTitlePatch(originalTitle, input);
  if (!patched) return null;
  if (patched === stripAllSpaces(originalTitle)) return null;
  try {
    await patchCalendarEventSummary(eventId, patched);
    return patched;
  } catch {
    return null;
  }
}
