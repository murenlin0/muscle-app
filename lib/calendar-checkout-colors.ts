import type { TransactionCategory } from '@/lib/transaction-category';

export const CALENDAR_COLOR_PENDING = '8';

export type CheckoutPayment = {
  methods: string[];
  defaultCategory: TransactionCategory;
};

/**
 * Google Calendar colorId → 付款方式
 * 5 Banana、6 Tangerine 皆視為現金（不同黃色）
 * 7 Peacock、9 Blueberry → 富邦
 * 3 Grape → 會員使用
 */
const CHECKOUT_BY_COLOR: Record<string, CheckoutPayment> = {
  '5': { methods: ['現金'], defaultCategory: '一般消費' },
  '6': { methods: ['現金'], defaultCategory: '一般消費' },
  '7': { methods: ['富邦'], defaultCategory: '一般消費' },
  '9': { methods: ['富邦'], defaultCategory: '一般消費' },
  '3': { methods: [], defaultCategory: '會員使用' },
};

export function getCheckoutPaymentFromColor(
  colorId: string | undefined,
): CheckoutPayment | null {
  return CHECKOUT_BY_COLOR[colorId ?? ''] ?? null;
}

export function isCalendarCheckoutColor(colorId: string | undefined): boolean {
  return getCheckoutPaymentFromColor(colorId) !== null;
}

/** 已結帳色（非灰、非預設空白） */
export function isCheckoutCalendarEvent(
  colorId: string | undefined,
  status?: string,
): boolean {
  if (status === 'cancelled') return false;
  const color = colorId ?? '';
  if (color === '' || color === CALENDAR_COLOR_PENDING) return false;
  return isCalendarCheckoutColor(colorId);
}

/** @deprecated 使用 getCheckoutPaymentFromColor；保留相容別名 */
export const COLOR_TO_PAYMENT = CHECKOUT_BY_COLOR;
