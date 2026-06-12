import { parseNotionNamePhone } from '@/lib/phone';

/** 標題頓號後、VIP 前的數字＝該筆交易完成後的客人餘額 */
export function parseBalanceAfter顿号(title: string): number | null {
  const idx = title.lastIndexOf('、');
  if (idx < 0) return null;

  const tail = title.slice(idx + 1).replace(/\s/g, '');

  const legacy = tail.match(/^(-?\d+)\/(\d+)VIP/i);
  if (legacy) {
    const used = Number(legacy[1]);
    const stored = Number(legacy[2]);
    if (!Number.isFinite(used) || !Number.isFinite(stored)) return null;
    return Math.max(0, stored - used);
  }

  const beforeVip = tail.match(/^(\d+)VIP/i);
  if (beforeVip) return Number(beforeVip[1]);

  const numOnly = tail.match(/^(\d+)/);
  if (numOnly) return Number(numOnly[1]);

  return null;
}

export interface TitleBalanceRow {
  id?: string;
  occurred_on: string;
  title: string;
  client_name?: string | null;
  client_phone?: string | null;
}

function clientPhoneKey(row: TitleBalanceRow): string | null {
  if (row.client_phone) return row.client_phone;
  const parsed = parseNotionNamePhone(row.title);
  return parsed?.phone ?? null;
}

/**
 * 餘額未使用：每位客人取最新一筆含頓號餘額的標題，加總其頓號後數字。
 */
export function sumUnusedBalancesFromTitles(rows: TitleBalanceRow[]): number {
  const latestByPhone = new Map<string, { date: string; balance: number; id: string }>();

  for (const row of rows) {
    const balance = parseBalanceAfter顿号(row.title);
    if (balance === null) continue;

    const phone = clientPhoneKey(row);
    if (!phone) continue;

    const id = row.id ?? '';
    const existing = latestByPhone.get(phone);
    if (
      !existing ||
      row.occurred_on > existing.date ||
      (row.occurred_on === existing.date && id > existing.id)
    ) {
      latestByPhone.set(phone, { date: row.occurred_on, balance, id });
    }
  }

  let sum = 0;
  for (const { balance } of latestByPhone.values()) {
    sum += balance;
  }
  return sum;
}

/** 單一客人最新餘額（頓號後數字） */
export function latestClientBalanceFromTitles(
  rows: TitleBalanceRow[],
  phone: string,
): number | null {
  const filtered = rows.filter((r) => clientPhoneKey(r) === phone);
  if (!filtered.length) return null;

  const sorted = [...filtered].sort((a, b) => {
    if (a.occurred_on !== b.occurred_on) return a.occurred_on.localeCompare(b.occurred_on);
    return (a.id ?? '').localeCompare(b.id ?? '');
  });

  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const balance = parseBalanceAfter顿号(sorted[i]!.title);
    if (balance !== null) return balance;
  }
  return null;
}
