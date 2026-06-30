import { stripAllSpaces } from '@/lib/phone';
import type { TransactionCategory } from '@/lib/transaction-category';

/** 師傅欄顯示名（與 staff 表對齊） */
export function canonicalStaffName(name: string): string {
  const n = name.trim();
  if (n === '湘') return '湘湘';
  if (n === '寶') return '阿寶';
  return n;
}

const MULTI_CHAR_STAFF = ['杰恩', 'Yumi', '湘湘', '阿寶'] as const;

export interface MultiStaffSourceRow {
  title: string;
  amount: number;
  payment_methods: string[];
  staff_name?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  is_vip?: boolean | null;
}

export interface MultiStaffSplitRow {
  title: string;
  amount: number;
  category: TransactionCategory;
  payment_methods: string[];
  staff_name: string;
  client_name: string;
  client_phone: string;
  is_vip: boolean;
}

export interface ParsedMultiStaffCompound {
  staffNames: string[];
  duration: string;
  topup: number;
  bonus: number;
  totalUsage: number;
  /** 頓號後、VIP 前的數字＝全部服務完成後的客人餘額 */
  finalBalance: number;
  clientName: string;
  clientPhone: string;
}

/** 仁錦 / 仁湘 / 錦仁 → ['仁','錦'] */
export function splitCompactStaffNames(raw: string): string[] {
  let rest = raw.trim();
  const out: string[] = [];

  while (rest.length > 0) {
    let matched = false;
    for (const token of MULTI_CHAR_STAFF) {
      if (rest.startsWith(token)) {
        out.push(token === '湘湘' ? '湘' : token === '阿寶' ? '寶' : token);
        rest = rest.slice(token.length);
        matched = true;
        break;
      }
    }
    if (matched) continue;
    out.push(rest[0]);
    rest = rest.slice(1);
  }

  return out.filter(Boolean);
}

function parseStaffPart(staffPart: string): { staffNames: string[]; duration: string } | null {
  const durationMatch = staffPart.match(/(\d+)分/);
  const duration = durationMatch ? `${durationMatch[1]}分` : '90分';
  let namesPart = staffPart.replace(/\d+分$/, '');

  const doubleMatch = namesPart.match(/^(.+?)雙打$/);
  if (doubleMatch) {
    const staffNames = splitCompactStaffNames(doubleMatch[1]);
    if (staffNames.length >= 2) return { staffNames, duration };
    return null;
  }

  if (/[、.,·]/.test(namesPart)) {
    const staffNames = namesPart
      .split(/[、.,·]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (staffNames.length >= 2) return { staffNames, duration };
  }

  return null;
}

function formatTopupSegment(topup: number, bonus: number, usageEach: number): string {
  if (bonus > 0) return `+${topup}送${bonus}-${usageEach}`;
  return `+${topup}-${usageEach}`;
}

/**
 * 解析多人合寫標題，例如：
 * - 仁、湘、杰恩+10000送500-4500、8000VIP張茜茜0916453353
 * - 錦.湘.杰恩90分+10000送500-4500、6500VIP張茜茜0916453353
 * - 仁錦雙打90分+10000送500-3000、9500VIP張茜茜0916453353
 * - 仁湘雙打90分+4000-3000、3500VIP謝明潔0922013860
 */
export function parseMultiStaffCompoundTitle(title: string): ParsedMultiStaffCompound | null {
  const compact = stripAllSpaces(title);
  const m = compact.match(
    /^(.+?)\+(\d{3,5})(?:送(\d+))?-(\d+)、(\d+)VIP([\u4e00-\u9fffA-Za-z·.]{2,24})(09\d{8})$/i,
  );
  if (!m) return null;

  const staffPart = m[1];
  const topup = Number(m[2]);
  const bonus = m[3] ? Number(m[3]) : 0;
  const totalUsage = Number(m[4]);
  const finalBalance = Number(m[5]);
  const clientName = m[6].replace(/^VIP/i, '');
  const clientPhone = m[7];

  if (
    !Number.isFinite(topup) ||
    !Number.isFinite(bonus) ||
    !Number.isFinite(totalUsage) ||
    !Number.isFinite(finalBalance) ||
    topup <= 0 ||
    topup > 50000
  ) {
    return null;
  }

  const staffParsed = parseStaffPart(staffPart);
  if (!staffParsed) return null;

  const { staffNames, duration } = staffParsed;
  if (staffNames.length < 2) return null;
  if (totalUsage % staffNames.length !== 0) return null;

  return {
    staffNames,
    duration,
    topup,
    bonus,
    totalUsage,
    finalBalance,
    clientName,
    clientPhone,
  };
}

export function isMultiStaffCompoundTitle(title: string): boolean {
  return parseMultiStaffCompoundTitle(title) !== null;
}

const BANK_PM = new Set(['富邦', 'Line', '街口', '仁中信', '轉帳', 'line']);

function hasBankPayment(pm: string[]): boolean {
  return pm.some((p) => BANK_PM.has(p) || BANK_PM.has(p.toLowerCase()));
}

/**
 * Notion 已將多人合寫拆成多列（儲值富邦列 + 各師傅會員使用列）。
 * 僅在「單列富邦儲值」時正規化為會員儲值，不憑空展開子列（避免重複計入富邦）。
 */
export function shouldNormalizeCompoundAsTopupRow(row: MultiStaffSourceRow & {
  category?: string;
}): boolean {
  const parsed = parseMultiStaffCompoundTitle(row.title);
  if (!parsed) return false;
  const pm = row.payment_methods ?? [];
  if (pm.includes('會員使用') || row.category === '會員使用') return false;
  return hasBankPayment(pm) && Math.abs(row.amount) === parsed.topup;
}

/** 將 Notion 富邦儲值列正規化為單筆會員儲值（不展開） */
export function normalizeCompoundTopupRow(
  row: MultiStaffSourceRow & { category?: string },
): MultiStaffSplitRow | null {
  const parsed = parseMultiStaffCompoundTitle(row.title);
  if (!parsed || !shouldNormalizeCompoundAsTopupRow(row)) return null;

  const firstStaff = parsed.staffNames[0];
  const topupSeg = formatTopupSegment(parsed.topup, parsed.bonus, parsed.totalUsage / parsed.staffNames.length);
  const vipSuffix = `VIP${parsed.clientName}${parsed.clientPhone}`;
  const balanceAfter = parsed.finalBalance + (parsed.totalUsage / parsed.staffNames.length) * (parsed.staffNames.length - 1);

  return {
    title: `${firstStaff}${parsed.duration}${topupSeg}、${balanceAfter}${vipSuffix}`,
    amount: parsed.topup,
    category: '會員儲值',
    payment_methods: row.payment_methods?.length ? row.payment_methods : ['富邦'],
    staff_name: canonicalStaffName(firstStaff),
    client_name: parsed.clientName,
    client_phone: parsed.clientPhone,
    is_vip: true,
  };
}

/** 拆成：首筆儲值（富邦）＋其餘會員使用 */
export function splitMultiStaffTransaction(row: MultiStaffSourceRow): MultiStaffSplitRow[] | null {
  const parsed = parseMultiStaffCompoundTitle(row.title);
  if (!parsed) return null;

  const usageEach = parsed.totalUsage / parsed.staffNames.length;
  const { clientName, clientPhone, duration, topup, bonus } = parsed;
  const vipSuffix = `VIP${clientName}${clientPhone}`;

  const n = parsed.staffNames.length;
  const balanceAfterService = (staffIndex: number) =>
    parsed.finalBalance + usageEach * (n - 1 - staffIndex);

  const out: MultiStaffSplitRow[] = [];
  const topupSeg = formatTopupSegment(topup, bonus, usageEach);

  const firstStaff = parsed.staffNames[0];
  out.push({
    title: `${firstStaff}${duration}${topupSeg}、${balanceAfterService(0)}${vipSuffix}`,
    amount: topup,
    category: '會員儲值',
    payment_methods: row.payment_methods?.length ? row.payment_methods : ['富邦'],
    staff_name: canonicalStaffName(firstStaff),
    client_name: clientName,
    client_phone: clientPhone,
    is_vip: true,
  });

  for (let i = 1; i < parsed.staffNames.length; i++) {
    const staff = parsed.staffNames[i];
    out.push({
      title: `${staff}${duration}-${usageEach}、${balanceAfterService(i)}${vipSuffix}`,
      amount: usageEach,
      category: '會員使用',
      payment_methods: [],
      staff_name: canonicalStaffName(staff),
      client_name: clientName,
      client_phone: clientPhone,
      is_vip: true,
    });
  }

  return out;
}
