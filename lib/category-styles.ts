import type { TransactionCategory } from '@/lib/transaction-category';

/** Notion 風格類型標籤色 */
export const CATEGORY_NOTION_STYLE: Record<TransactionCategory, string> = {
  一般消費: 'bg-[#4a3b2f] text-[#e8d5c4] border border-[#5c4a3a]',
  會員儲值: 'bg-[#5c2d3a] text-[#f0c4d0] border border-[#6e3a4a]',
  會員使用: 'bg-[#44325c] text-[#d8c4f0] border border-[#553d70]',
  會員補差額: 'bg-[#3d3550] text-[#cfc4e8] border border-[#4d4560]',
  轉移: 'bg-[#2d4a38] text-[#b8e0c8] border border-[#3a5c48]',
  支出: 'bg-[#2a3d52] text-[#b8d4f0] border border-[#3a5068]',
  工資: 'bg-[#3a3a3a] text-[#d4d4d4] border border-[#4a4a4a]',
  收入: 'bg-[#4a3f2a] text-[#f0e0b8] border border-[#5c5035]',
  分紅: 'bg-[#522a2a] text-[#f0b8b8] border border-[#683535]',
};
