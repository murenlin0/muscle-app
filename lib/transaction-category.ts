/** 報表用簡化類型（對齊 muscle.com.tw，不再依賴 Notion 選項） */
export const TRANSACTION_CATEGORIES = [
  '一般消費',
  '會員儲值',
  '會員使用',
  '會員補差額',
  '轉移',
  '支出',
  '工資',
  '收入',
  '分紅',
] as const;

export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

const NOTION_TYPE_TO_CATEGORY: Record<string, TransactionCategory> = {
  '30分': '一般消費',
  '60分': '一般消費',
  '90分': '一般消費',
  '120分': '一般消費',
  '150分': '一般消費',
  '180分': '一般消費',
  儲值: '會員儲值',
  'VIP 30分': '會員使用',
  'VIP 60分': '會員使用',
  'VIP 90分': '會員使用',
  'VIP 120分': '會員使用',
  'VIP 150分': '會員使用',
  'VIP 180分': '會員使用',
  'VIP 結清': '會員補差額',
  'VIP 活動': '會員補差額',
  轉移: '轉移',
  支出: '支出',
  工資: '工資',
  收入: '收入',
  分紅: '分紅',
};

export function mapNotionServiceTypeToCategory(
  serviceType: string | null | undefined,
  paymentMethods: string[] = [],
): TransactionCategory {
  const raw = serviceType?.trim();
  if (raw && NOTION_TYPE_TO_CATEGORY[raw]) {
    return NOTION_TYPE_TO_CATEGORY[raw];
  }

  if (paymentMethods.includes('會員使用')) {
    return '會員使用';
  }

  return '一般消費';
}

const REVENUE_CATEGORIES = new Set<TransactionCategory>([
  '一般消費',
  '會員儲值',
  '會員使用',
  '會員補差額',
  '收入',
]);

export function isRevenueCategory(category: TransactionCategory): boolean {
  return REVENUE_CATEGORIES.has(category);
}
