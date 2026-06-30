import { stripAllSpaces } from '@/lib/phone';
import type { TransactionCategory } from '@/lib/transaction-category';

export interface CompoundTitleParts {
  staffPrefix: string;
  duration: string;
  topup: number;
  usage: number;
  finalBalance: number;
  vipSuffix: string;
}

export interface ActivityCompoundParts {
  staffPrefix: string;
  duration: string;
  topup: number;
  song: number;
  usage: number | null;
  finalBalance: number;
  vipSuffix: string;
}

const BANK_PM = new Set(['富邦', 'Line', '街口', '仁中信', '轉帳', 'line']);

/** 合寫標題：仁60分+4000-1000、3000VIP… 或 湘120分5000-1900、3300VIP… */
export function parseCompoundVipTitle(title: string): CompoundTitleParts | null {
  const t = stripAllSpaces(title);

  const plus = t.match(
    /^(.+?)(\d+分)(?:現金儲值\d+|富邦儲值\d+|現金\d+富邦\d+)?\+(\d+)-(\d+)、(\d+)VIP(.+)$/i,
  );
  if (plus) {
    return {
      staffPrefix: plus[1],
      duration: plus[2],
      topup: Number(plus[3]),
      usage: Number(plus[4]),
      finalBalance: Number(plus[5]),
      vipSuffix: `VIP${plus[6]}`,
    };
  }

  const plain = t.match(/^(.+?)(\d+分)(\d+)-(\d+)、(\d+)VIP(.+)$/i);
  if (plain) {
    return {
      staffPrefix: plain[1],
      duration: plain[2],
      topup: Number(plain[3]),
      usage: Number(plain[4]),
      finalBalance: Number(plain[5]),
      vipSuffix: `VIP${plain[6]}`,
    };
  }

  return null;
}

/** 活動合寫：+10000送500-1900、8600VIP… */
export function parseActivityCompoundTitle(title: string): ActivityCompoundParts | null {
  const t = stripAllSpaces(title);
  const m = t.match(/^(.+?)\+(\d+)送(\d+)(?:-(\d+))?、(\d+)VIP(.+)$/i);
  if (!m) return null;

  const block = m[1];
  const dur = block.match(/(\d+分)$/);
  return {
    staffPrefix: dur ? block.slice(0, -dur[1].length) : block,
    duration: dur?.[1] ?? '',
    topup: Number(m[2]),
    song: Number(m[3]),
    usage: m[4] ? Number(m[4]) : null,
    finalBalance: Number(m[5]),
    vipSuffix: `VIP${m[6]}`,
  };
}

export function isCompoundVipTitle(title: string): boolean {
  return parseCompoundVipTitle(title) !== null || parseActivityCompoundTitle(title) !== null;
}

function titleStaffPrefix(staffName: string | null | undefined, fallback: string): string {
  if (!staffName) return fallback;
  if (staffName === '湘湘') return '湘';
  if (staffName === '阿寶') return '寶';
  return staffName;
}

function buildHead(
  row: { staff_name?: string | null; title: string },
  parsed: { staffPrefix: string; duration: string },
): string {
  const staff = titleStaffPrefix(row.staff_name, parsed.staffPrefix);
  const duration =
    parsed.duration || (row.title.match(/(\d+分)/)?.[1] ?? (row.title.includes('120') ? '120分' : '90分'));
  return `${staff}${duration}`;
}

function formatVipSuffix(
  vipSuffix: string,
  clientName: string | null | undefined,
  clientPhone: string | null | undefined,
): string {
  if (clientName && clientPhone) {
    return `VIP${clientName}${clientPhone}`;
  }
  return vipSuffix.startsWith('VIP') ? vipSuffix : `VIP${vipSuffix}`;
}

type TitleRow = {
  title: string;
  amount: number;
  category: string;
  payment_methods: string[];
  staff_name?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
};

/** 活動儲值（送點）合寫標題 → 依列屬性拆分 */
export function expectedTitleForActivityRow(row: TitleRow): string | null {
  const parsed = parseActivityCompoundTitle(row.title);
  if (!parsed) return null;

  const cat = row.category as TransactionCategory;
  const vip = formatVipSuffix(parsed.vipSuffix, row.client_name, row.client_phone);
  const head = buildHead(row, parsed);
  const credit = parsed.topup + parsed.song;

  if (cat === '會員儲值' && row.amount === parsed.topup) {
    const pm = row.payment_methods ?? [];
    const hasCash = pm.includes('現金');
    const hasBank = pm.some((p) => BANK_PM.has(p) || BANK_PM.has(p.toLowerCase()));
    if (hasCash && !hasBank) {
      return `${head}現金儲值${parsed.topup} +${parsed.topup}送${parsed.song}、${credit}${vip}`;
    }
    return `${head}+${parsed.topup}送${parsed.song}、${credit}${vip}`;
  }

  if (cat === '會員使用') {
    return `${head}-${row.amount}、${parsed.finalBalance}${vip}`;
  }

  if (cat === '會員補差額' && row.amount === parsed.song) {
    return `${head}活動送${parsed.song}、${credit}${vip}`;
  }

  return null;
}

/** 一般儲值+使用合寫標題 → 依列屬性拆分 */
export function expectedTitleForSplitRow(row: TitleRow): string | null {
  const activity = expectedTitleForActivityRow(row);
  if (activity) return activity;

  const parsed = parseCompoundVipTitle(row.title);
  if (!parsed) return null;

  const cat = row.category as TransactionCategory;
  const vip = formatVipSuffix(parsed.vipSuffix, row.client_name, row.client_phone);
  const head = buildHead(row, parsed);

  if (cat === '會員使用') {
    if (row.amount !== parsed.usage) return null;
    return `${head}-${parsed.usage}、${parsed.finalBalance}${vip}`;
  }

  if (cat === '會員儲值') {
    if (row.amount !== parsed.topup) return null;
    const pm = row.payment_methods ?? [];
    const hasCash = pm.includes('現金');
    const hasBank = pm.some((p) => BANK_PM.has(p) || BANK_PM.has(p.toLowerCase()));

    if (hasCash && !hasBank) {
      return `${head}現金儲值${parsed.topup} +${parsed.topup}-${parsed.usage}、${parsed.finalBalance}${vip}`;
    }
    if (hasBank && !hasCash) {
      return `${head}+${parsed.topup}、${parsed.topup}${vip}`;
    }
    if (hasCash && hasBank) {
      if (row.amount === parsed.topup) {
        const part = pm.includes('現金') ? `現金儲值${row.amount}` : `富邦儲值${row.amount}`;
        return `${head}${part} +${parsed.topup}-${parsed.usage}、${parsed.finalBalance}${vip}`;
      }
    }
    return `${head}+${parsed.topup}、${parsed.topup}${vip}`;
  }

  return null;
}

export function titleMatchesRowAttributes(row: TitleRow): boolean {
  const expected = expectedTitleForSplitRow(row);
  if (!expected) return true;
  return stripAllSpaces(row.title) === stripAllSpaces(expected);
}
