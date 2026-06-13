import type { TransactionCategory } from '@/lib/transaction-category';

/** v0 風格：透明底 + 彩色描邊 pill 標籤（寬度隨文字） */
export const CATEGORY_NOTION_STYLE: Record<TransactionCategory, string> = {
  一般消費: 'bg-transparent text-amber-300/95 border border-amber-400/55 rounded-full',
  會員儲值: 'bg-transparent text-rose-300/95 border border-rose-400/50 rounded-full',
  會員使用: 'bg-transparent text-violet-300/95 border border-violet-400/50 rounded-full',
  會員補差額: 'bg-transparent text-purple-300/90 border border-purple-400/45 rounded-full',
  轉出: 'bg-transparent text-emerald-300/90 border border-emerald-500/45 rounded-full',
  轉入: 'bg-transparent text-teal-300/90 border border-teal-400/50 rounded-full',
  支出: 'bg-transparent text-sky-300/90 border border-sky-400/50 rounded-full',
  工資: 'bg-transparent text-zinc-300/90 border border-zinc-500/50 rounded-full',
  收入: 'bg-transparent text-yellow-200/90 border border-yellow-500/45 rounded-full',
  店租收入: 'bg-transparent text-lime-300/90 border border-lime-500/45 rounded-full',
  分紅: 'bg-transparent text-red-300/90 border border-red-400/50 rounded-full',
};

/** 更動的帳戶 — pill 標籤（現金黃、富邦藍） */
export const LEDGER_ACCOUNT_STYLE: Record<string, string> = {
  現金: 'bg-transparent text-yellow-200/95 border border-yellow-500/55 rounded-full',
  富邦: 'bg-transparent text-sky-300/95 border border-sky-400/55 rounded-full',
  仁中信: 'bg-transparent text-zinc-400/90 border border-zinc-500/45 rounded-full',
  街口: 'bg-transparent text-zinc-400/90 border border-zinc-500/45 rounded-full',
  Line: 'bg-transparent text-zinc-400/90 border border-zinc-500/45 rounded-full',
};

/** 流水帳金額正負色 */
export function ledgerAmountClass(amount: number): string {
  if (amount > 0) return 'text-[#4fd1c5]';
  if (amount < 0) return 'text-[#f56565]';
  return 'text-[#888]';
}

export function formatSignedAmount(amount: number): string {
  const n = Math.round(amount);
  const abs = Math.abs(n).toLocaleString('zh-TW');
  if (n > 0) return `+$${abs}`;
  if (n < 0) return `-$${abs}`;
  return '$0';
}
