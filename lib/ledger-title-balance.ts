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

  const numOnly = tail.match(/^(-?\d+)/);
  if (numOnly) return Number(numOnly[1]);

  return null;
}

/** 頓號前所有帶正負號數字的總和＝該列當日的增減（儲值為正、使用為負） */
function parseSignedDeltaBefore顿号(title: string): number | null {
  const idx = title.lastIndexOf('、');
  const head = idx >= 0 ? title.slice(0, idx) : title;
  const tokens = [...head.matchAll(/([+-]\d+)/g)];
  if (!tokens.length) return null;
  return tokens.reduce((s, m) => s + Number(m[1]), 0);
}

interface BalRow {
  date: string;
  balance: number;
  id: string;
  delta: number | null;
}

/**
 * 取單一客人的「最新餘額」。
 * 同一天只有一列時直接取該列頓號餘額；同一天有多列（例如先結清 +、再使用 -）時，
 * 用「前一日餘額 + 當日各列增減」推算當日結束餘額，並要求它等於某列標註餘額才採用，
 * 否則退回「同日取最大 id」的舊行為。
 */
function pickLatestBalance(rows: BalRow[]): number | null {
  if (!rows.length) return null;
  const maxDate = rows.reduce((d, r) => (r.date > d ? r.date : d), rows[0]!.date);
  const latest = rows.filter((r) => r.date === maxDate);

  const byIdDesc = (a: BalRow, b: BalRow) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  const byDateIdDesc = (a: BalRow, b: BalRow) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : byIdDesc(a, b);

  if (latest.length === 1) return latest[0]!.balance;

  // 同日多列：嘗試鏈式推算
  const prior = rows.filter((r) => r.date < maxDate).sort(byDateIdDesc);
  const startBalance = prior.length ? prior[0]!.balance : 0;
  if (latest.every((r) => r.delta !== null)) {
    const end = startBalance + latest.reduce((s, r) => s + (r.delta ?? 0), 0);
    if (latest.some((r) => r.balance === end)) return end;
  }

  // 退回舊行為：同日取最大 id
  return [...latest].sort(byIdDesc)[0]!.balance;
}

function toBalRows(rows: TitleBalanceRow[]): BalRow[] {
  const out: BalRow[] = [];
  for (const row of rows) {
    const balance = parseBalanceAfter顿号(row.title);
    if (balance === null) continue;
    out.push({
      date: row.occurred_on,
      balance,
      id: row.id ?? '',
      delta: parseSignedDeltaBefore顿号(row.title),
    });
  }
  return out;
}

export interface TitleBalanceRow {
  id?: string;
  occurred_on: string;
  title: string;
  client_name?: string | null;
  client_phone?: string | null;
}

export interface MemberBalanceRow extends TitleBalanceRow {
  amount: number;
  category: string;
}

/** 會員列 signed 金額：儲值/補差額 +，使用 -（對齊 Notion 會員餘額公式） */
export function memberRowSignedAmount(category: string, amount: number): number {
  const a = Math.round(amount ?? 0);
  if (category === '會員使用') return -a;
  if (category === '會員儲值' || category === '會員補差額') return a;
  return 0;
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

function buildNameToPhone(rows: TitleBalanceRow[]): Map<string, string> {
  const nameToPhone = new Map<string, string>();
  for (const row of rows) {
    const phone = clientPhoneKey(row);
    const name = clientNameKey(row);
    if (phone && name && !nameToPhone.has(name)) nameToPhone.set(name, phone);
  }
  return nameToPhone;
}

function clientGroupKey(row: TitleBalanceRow, nameToPhone: Map<string, string>): string | null {
  const phone = clientPhoneKey(row);
  const name = clientNameKey(row);
  return phone ?? (name ? nameToPhone.get(name) ?? `name:${name}` : null);
}

/**
 * 餘額未使用：每位客人加總 會員儲值/使用/補差額 的 signed 金額，再全部加總。
 * 與 Notion「會員餘額」公式逐客人加總一致。
 */
export function sumUnusedMemberBalances(rows: MemberBalanceRow[]): number {
  const nameToPhone = buildNameToPhone(rows);
  const nets = new Map<string, number>();
  for (const row of rows) {
    const key = clientGroupKey(row, nameToPhone);
    if (!key) continue;
    nets.set(key, (nets.get(key) ?? 0) + memberRowSignedAmount(row.category, row.amount));
  }
  let sum = 0;
  for (const net of nets.values()) sum += net;
  return sum;
}

/** 單一客人會員餘額（儲值 - 使用 + 補差額） */
export function clientMemberBalance(rows: MemberBalanceRow[], phone: string): number | null {
  let sum = 0;
  let any = false;
  for (const row of rows) {
    if (clientPhoneKey(row) !== phone) continue;
    if (!['會員儲值', '會員使用', '會員補差額'].includes(row.category)) continue;
    sum += memberRowSignedAmount(row.category, row.amount);
    any = true;
  }
  return any ? sum : null;
}

/**
 * @deprecated 改用 sumUnusedMemberBalances；仍供稽核腳本比對頓號餘額
 * 餘額未使用：每位客人（電話歸戶，無電話時用名字歸戶）只取最新一筆
 * 含頓號餘額的標題，加總其頓號後數字。
 */
export function sumUnusedBalancesFromTitles(rows: TitleBalanceRow[]): number {
  const nameToPhone = buildNameToPhone(rows);

  const rowsByClient = new Map<string, TitleBalanceRow[]>();
  for (const row of rows) {
    const key = clientGroupKey(row, nameToPhone);
    if (!key) continue;
    const arr = rowsByClient.get(key);
    if (arr) arr.push(row);
    else rowsByClient.set(key, [row]);
  }

  let sum = 0;
  for (const clientRows of rowsByClient.values()) {
    const balance = pickLatestBalance(toBalRows(clientRows));
    if (balance !== null) sum += balance;
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
  return pickLatestBalance(toBalRows(filtered));
}
