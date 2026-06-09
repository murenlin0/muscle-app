import { stripAllSpaces } from '@/lib/phone';
import type { TransactionCategory } from '@/lib/transaction-category';

/** 師傅欄顯示名（與 staff 表對齊） */
export function canonicalStaffName(name: string): string {
  const n = name.trim();
  if (n === '湘') return '湘湘';
  return n;
}

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

/**
 * 解析「仁、湘、杰恩+10000送500-4500、8000VIP張茜茜0916453353」
 * 或「錦.湘.杰恩90分+10000送500-4500、6500VIP張茜茜0916453353」
 */
export function parseMultiStaffCompoundTitle(title: string): ParsedMultiStaffCompound | null {
  const compact = stripAllSpaces(title);
  const m = compact.match(
    /^(.+?)\+(\d+)送(\d+)-(\d+)、(\d+)VIP([\u4e00-\u9fffA-Za-z·.]{2,20})(09\d{8})$/i,
  );
  if (!m) return null;

  const staffPart = m[1];
  const topup = Number(m[2]);
  const bonus = Number(m[3]);
  const totalUsage = Number(m[4]);
  const finalBalance = Number(m[5]);
  const clientName = m[6].replace(/^VIP/i, '');
  const clientPhone = m[7];

  if (
    !Number.isFinite(topup) ||
    !Number.isFinite(bonus) ||
    !Number.isFinite(totalUsage) ||
    !Number.isFinite(finalBalance) ||
    topup <= 0
  ) {
    return null;
  }

  const durationMatch = staffPart.match(/(\d+)分/);
  const duration = durationMatch ? `${durationMatch[1]}分` : '90分';

  let namesPart = staffPart.replace(/\d+分$/, '');
  if (!/[、.,·]/.test(namesPart)) return null;

  const staffNames = namesPart
    .split(/[、.,·]/)
    .map((s) => s.trim())
    .filter(Boolean);

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

  const firstStaff = parsed.staffNames[0];
  out.push({
    title: `${firstStaff}${duration}+${topup}送${bonus}-${usageEach}、${balanceAfterService(0)}${vipSuffix}`,
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
