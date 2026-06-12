import { parseNotionNamePhone, stripVipPrefix } from '@/lib/phone';
import type { TransactionCategory } from '@/lib/transaction-category';
import { categoryShowsClient } from '@/lib/ledger-client-detect';

export interface ClientIdentity {
  name: string;
  phone: string;
}

export function resolveClientFromFields(
  title: string,
  category: TransactionCategory,
  clientName: string | null,
  clientPhone: string | null,
): ClientIdentity | null {
  if (!categoryShowsClient(category)) return null;

  if (clientName && clientPhone) {
    return { name: stripVipPrefix(clientName), phone: clientPhone };
  }

  const parsed = parseNotionNamePhone(title);
  if (!parsed) return null;
  return { name: parsed.name, phone: parsed.phone };
}

/** 客人 key：本名緊接電話，例 劉啓忻0975349314 */
export function formatClientKey(identity: ClientIdentity): string {
  return `${stripVipPrefix(identity.name)}${identity.phone}`;
}

export function formatClientKeyLabel(identity: ClientIdentity, isVipMember: boolean): string {
  const key = formatClientKey(identity);
  return isVipMember ? `VIP${key}` : key;
}

export function collectVipMemberPhones(
  rows: {
    category: TransactionCategory | string;
    client_phone?: string | null;
    client_name?: string | null;
    title: string;
  }[],
): Set<string> {
  const phones = new Set<string>();

  for (const row of rows) {
    if (row.category !== '會員儲值') continue;

    if (row.client_phone) {
      phones.add(row.client_phone);
      continue;
    }

    const parsed = parseNotionNamePhone(row.title);
    if (parsed?.phone) phones.add(parsed.phone);
  }

  return phones;
}
