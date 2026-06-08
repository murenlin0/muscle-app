/** 移除所有空白（全形、半形） */
export function stripAllSpaces(value: string): string {
  return value.replace(/[\s\u3000]+/g, '');
}

/** 台灣手機正規化：09xxxxxxxx */
export function normalizePhone(raw: string): string | null {
  const digits = stripAllSpaces(raw).replace(/\D/g, '');
  if (/^09\d{8}$/.test(digits)) return digits;
  if (/^9\d{8}$/.test(digits)) return `0${digits}`;
  return null;
}

/** 去掉 VIP 前綴 */
export function stripVipPrefix(name: string): string {
  return name.replace(/^VIP/i, '').trim();
}

export interface ParsedNamePhone {
  name: string;
  phone: string;
  titleSegment: string;
  /** Notion 匯入：欄位含 VIP 前綴（已儲值會員） */
  isVip?: boolean;
  /** Notion 舊寫法：3400/4000 = 已用/儲值總額，剩餘 = 4000-3400 */
  legacyBalance?: { used: number; stored: number; remaining: number };
}

const INVALID_NAME_CHARS = /[、+\-分儲值送\d|]/;

/** 多人合寫（略過）；純數字/數字的 3400/4000 餘額寫法不算 */
function isMultiCustomerNotionField(compact: string): boolean {
  if (!compact.includes('/')) return false;

  const withoutBalanceSlashes = compact.replace(/-?\d+\/-?\d+/g, '');
  if (!withoutBalanceSlashes.includes('/')) return false;

  if (/09\d{8}\//.test(compact)) return true;
  if (/[\u4e00-\u9fffA-Za-z]{2,}\/[\u4e00-\u9fffA-Za-z]{2,}/.test(compact)) return true;
  if (/\/VIP/i.test(withoutBalanceSlashes)) return true;

  return true;
}

function parseLegacyUsedStoredVip(
  text: string,
): { name: string; legacyBalance: ParsedNamePhone['legacyBalance'] } | null {
  const match = text.match(/(-?\d+)\/(\d+)VIP([\u4e00-\u9fffA-Za-z]{2,12})$/i);
  if (!match) return null;

  const used = Number(match[1]);
  const stored = Number(match[2]);
  const name = stripVipPrefix(match[3]).trim();
  if (!name || INVALID_NAME_CHARS.test(name)) return null;

  const remaining = Math.max(0, stored - used);

  return {
    name,
    legacyBalance: { used, stored, remaining },
  };
}

/**
 * 解析使用者於 LIFF 輸入的本名 + 電話（格式單純）。
 */
export function parseNamePhone(raw: string): ParsedNamePhone | null {
  const compact = stripAllSpaces(raw);
  if (!compact || compact.includes('/')) return null;

  const withoutVip = compact.replace(/^VIP/i, '');
  const match = withoutVip.match(/^(.+?)(09\d{8})$/);
  if (!match) return null;

  const name = stripVipPrefix(match[1]).trim();
  const phone = normalizePhone(match[2]);
  if (!name || !phone || INVALID_NAME_CHARS.test(name)) return null;

  return {
    name,
    phone,
    titleSegment: `${name}${phone}`,
    isVip: /^VIP/i.test(compact),
  };
}

/**
 * 解析 Notion「名稱電話」欄位（可能含師傅、時長、金流、頓號餘額等前綴）。
 *
 * 例：
 * - VIP洪萱芸0965007000
 * - 仁90分儲值4000、2500VIP陳思涵0921577629  → 陳思涵
 * - 仁120分3400/4000VIP吳澤彥0901193580 → 吳澤彥（3400 已用 / 4000 儲值，剩 600）
 * - 仁、湘、杰恩+10000…、8000VIP張茜茜0916453353 → 張茜茜
 *
 * 含「客人/客人」或 phone/VIP 的多人合寫列會回傳 null。
 */
export function parseNotionNamePhone(raw: string): ParsedNamePhone | null {
  const compact = stripAllSpaces(raw);
  if (!compact) return null;
  if (isMultiCustomerNotionField(compact)) return null;

  const phoneMatches = [...compact.matchAll(/09\d{8}/g)];
  if (!phoneMatches.length) return null;

  const lastPhone = phoneMatches[phoneMatches.length - 1];
  const phone = normalizePhone(lastPhone[0]);
  if (!phone) return null;

  const beforePhone = compact.slice(0, lastPhone.index ?? 0);
  const tailSegment = (beforePhone.split('、').pop() ?? beforePhone).replace(/^\d+/, '');
  const hadVip = /VIP/i.test(tailSegment) || /VIP/i.test(beforePhone);

  let name = '';
  let legacyBalance: ParsedNamePhone['legacyBalance'];

  const legacy = parseLegacyUsedStoredVip(tailSegment) ?? parseLegacyUsedStoredVip(beforePhone);
  if (legacy) {
    name = legacy.name;
    legacyBalance = legacy.legacyBalance;
  } else {
    const vipParts = tailSegment.split(/VIP/i);
    if (vipParts.length > 1) {
      name = vipParts[vipParts.length - 1] ?? '';
    } else {
      const endName = beforePhone.match(/([\u4e00-\u9fffA-Za-z]{2,12})$/);
      name = endName?.[1] ?? tailSegment.replace(/^VIP/i, '');
    }
    name = stripVipPrefix(name).trim();
  }

  if (!name || INVALID_NAME_CHARS.test(name) || name.length > 12) return null;

  return {
    name,
    phone,
    titleSegment: `${name}${phone}`,
    isVip: hadVip || Boolean(legacy),
    legacyBalance,
  };
}

/** Calendar 標題用的客人段：本名緊接電話、無空格 */
export function formatClientTitleSegment(name: string, phone: string): string {
  const n = stripAllSpaces(stripVipPrefix(name));
  const p = normalizePhone(phone);
  if (!n || !p) throw new Error('姓名或電話格式不正確');
  return `${n}${p}`;
}

export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('zh-TW')}`;
}

export function ledgerTypeLabel(type: string): string {
  switch (type) {
    case 'initial':
      return '期初餘額';
    case 'top_up':
      return '儲值';
    case 'deduction':
      return '扣款';
    case 'adjustment':
      return '調整';
    default:
      return type;
  }
}

export function signedLedgerAmount(type: string, amount: number): number {
  switch (type) {
    case 'top_up':
    case 'initial':
    case 'adjustment':
      return amount;
    case 'deduction':
      return -amount;
    default:
      return amount;
  }
}
