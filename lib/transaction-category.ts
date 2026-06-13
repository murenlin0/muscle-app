/** 報表用簡化類型（對齊 muscle.com.tw，不再依賴 Notion 選項） */
export const TRANSACTION_CATEGORIES = [
  '一般消費',
  '會員儲值',
  '會員使用',
  '會員補差額',
  '轉出',
  '轉入',
  '支出',
  '工資',
  '收入',
  '店租收入',
  '分紅',
] as const;

/** 財務總覽「收入」加總用的類型 */
export const OVERVIEW_INCOME_CATEGORIES = [
  '會員儲值',
  '一般消費',
  '會員補差額',
  '店租收入',
] as const satisfies readonly TransactionCategory[];

/** 財務總覽「支出」加總用的類型 */
export const OVERVIEW_EXPENSE_CATEGORIES = ['支出', '工資'] as const satisfies readonly TransactionCategory[];

export type LedgerPresetFilter = 'income' | 'expense';

export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

/** @deprecated 舊資料遷移用 */
export const LEGACY_TRANSFER_CATEGORY = '轉移';

const NOTION_TYPE_TO_CATEGORY: Record<string, TransactionCategory | typeof LEGACY_TRANSFER_CATEGORY> = {
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
  轉移: LEGACY_TRANSFER_CATEGORY,
  支出: '支出',
  工資: '工資',
  收入: '收入',
  店租收入: '店租收入',
  分紅: '分紅',
};

export function mapNotionServiceTypeToCategory(
  serviceType: string | null | undefined,
  paymentMethods: string[] = [],
): TransactionCategory | typeof LEGACY_TRANSFER_CATEGORY {
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
  '會員補差額',
  '收入',
  '店租收入',
]);

export function isRevenueCategory(category: TransactionCategory): boolean {
  return REVENUE_CATEGORIES.has(category);
}

/** 損益表收入（不含會員儲值＝預收；會員使用＝已交付服務） */
export function isPnlIncomeCategory(category: TransactionCategory): boolean {
  return (
    category === '一般消費' ||
    category === '會員使用' ||
    category === '會員補差額' ||
    category === '收入'
  );
}

export function isPnlExpenseCategory(category: TransactionCategory): boolean {
  return category === '支出' || category === '工資' || category === '分紅';
}

export function isOverviewIncomeCategory(category: TransactionCategory): boolean {
  return (OVERVIEW_INCOME_CATEGORIES as readonly string[]).includes(category);
}

export function isOverviewExpenseCategory(category: TransactionCategory): boolean {
  return (OVERVIEW_EXPENSE_CATEGORIES as readonly string[]).includes(category);
}

export function categoriesForLedgerPreset(preset: LedgerPresetFilter): TransactionCategory[] {
  return preset === 'income'
    ? [...OVERVIEW_INCOME_CATEGORIES]
    : [...OVERVIEW_EXPENSE_CATEGORIES];
}
