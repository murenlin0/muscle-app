import { parseNotionNamePhone, stripVipPrefix } from '@/lib/phone';

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

/** 名字（無電話列的歸戶用）：欄位優先，否則取標題最後一個 VIP 後的名字 */
function clientNameKey(row: TitleBalanceRow): string | null {
  if (row.client_name) {
    const n = stripVipPrefix(row.client_name).trim();
    if (n) return n;
  }
  const matches = [...row.title.matchAll(/VIP\s*([\u4e00-\u9fffA-Za-z]{2,12})/gi)];
  const last = matches[matches.length - 1];
  return last?.[1] ?? null;
}

/**
 * 餘額未使用：每位客人（電話歸戶，無電話時用名字歸戶）只取最新一筆
 * 含頓號餘額的標題，加總其頓號後數字。
 */
export function sumUnusedBalancesFromTitles(rows: TitleBalanceRow[]): number {
  // 名字 → 電話 對照：讓「許芳榮老婆/VIP許芳榮」這類無電話列歸到本人帳上
  const nameToPhone = new Map<string, string>();
  for (const row of rows) {
    const phone = clientPhoneKey(row);
    const name = clientNameKey(row);
    if (phone && name && !nameToPhone.has(name)) nameToPhone.set(name, phone);
  }

  const latestByClient = new Map<string, { date: string; balance: number; id: string }>();

  for (const row of rows) {
    const balance = parseBalanceAfter顿号(row.title);
    if (balance === null) continue;

    const phone = clientPhoneKey(row);
    const name = clientNameKey(row);
    const key = phone ?? (name ? nameToPhone.get(name) ?? `name:${name}` : null);
    if (!key) continue;

    const id = row.id ?? '';
    const existing = latestByClient.get(key);
    if (
      !existing ||
      row.occurred_on > existing.date ||
      (row.occurred_on === existing.date && id > existing.id)
    ) {
      latestByClient.set(key, { date: row.occurred_on, balance, id });
    }
  }

  let sum = 0;
  for (const { balance } of latestByClient.values()) {
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
