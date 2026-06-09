import { parseNotionNamePhone } from '@/lib/phone';
import type { TransactionCategory } from '@/lib/transaction-category';

const NO_CLIENT_CATEGORIES = new Set<TransactionCategory>([
  '轉出',
  '轉入',
  '工資',
  '分紅',
  '收入',
  '支出',
]);

export function categoryShowsClient(category: TransactionCategory): boolean {
  return !NO_CLIENT_CATEGORIES.has(category);
}

export function detectClientFromTitle(title: string): {
  clientName: string | null;
  clientPhone: string | null;
  isVip: boolean;
} {
  const parsed = parseNotionNamePhone(title);
  if (!parsed) {
    return { clientName: null, clientPhone: null, isVip: false };
  }
  return {
    clientName: parsed.name,
    clientPhone: parsed.phone,
    isVip: Boolean(parsed.isVip),
  };
}

export function syncClientFieldsFromTitle(
  title: string,
  category: TransactionCategory,
  current: { clientName: string | null; clientPhone: string | null },
): { clientName: string | null; clientPhone: string | null; isVip: boolean } {
  if (!categoryShowsClient(category)) {
    return { clientName: null, clientPhone: null, isVip: false };
  }
  const detected = detectClientFromTitle(title);
  return {
    clientName: detected.clientName ?? current.clientName,
    clientPhone: detected.clientPhone ?? current.clientPhone,
    isVip: detected.isVip,
  };
}
