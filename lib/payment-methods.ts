/** 民有店每日紀錄 — 付款方式（對齊 Notion） */
export const PAYMENT_METHODS = [
  '現金',
  'Line',
  '富邦',
  '街口',
  '仁中信',
  '會員使用',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function parsePaymentMethodsInput(raw: string): string[] {
  return raw
    .split(/[、,，/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatPaymentMethods(methods: string[]): string {
  return methods.filter(Boolean).join('、');
}
