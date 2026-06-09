'use client';

import { useState } from 'react';
import { displayMoney } from '@/lib/financial-display';
import type { FinancialOverview } from '@/lib/financial-summary-server';
import { cn } from '@/lib/utils';

function fmt(n: number) {
  return displayMoney(n).toLocaleString('zh-TW');
}

function Money({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('tabular-nums', className)}>
      ${fmt(value)}
    </span>
  );
}

function PanelCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[280px] flex-col rounded-md border border-[#333] bg-[#1c1c1c]',
        className,
      )}
    >
      <div className="border-b border-[#333] px-4 py-2.5 text-sm font-semibold text-[#e8e8e8]">
        {title}
      </div>
      <div className="flex flex-1 flex-col p-3">{children}</div>
    </div>
  );
}

function LineItem({
  label,
  value,
  onClick,
  active,
  bold,
}: {
  label: string;
  value: number;
  onClick?: () => void;
  active?: boolean;
  bold?: boolean;
}) {
  const inner = (
    <>
      <span className={cn('text-[#aaa]', bold && 'font-medium text-[#ddd]')}>{label}</span>
      <Money value={value} className={cn(bold ? 'text-[#f0f0f0] font-semibold' : 'text-[#ccc]')} />
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm transition',
          active ? 'bg-[#2a2a2a] ring-1 ring-[#444]' : 'hover:bg-[#262626]',
        )}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={cn('flex items-center justify-between px-2 py-1.5 text-sm', bold && 'pt-2')}>
      {inner}
    </div>
  );
}

function Flyout({
  title,
  items,
  onClose,
}: {
  title: string;
  items: { label: string; value: number }[];
  onClose: () => void;
}) {
  return (
    <div className="absolute left-full top-0 z-20 ml-2 w-56 rounded-md border border-[#404040] bg-[#252525] shadow-xl">
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-2">
        <span className="text-xs font-medium text-[#ccc]">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-[#666] hover:text-[#aaa]"
          aria-label="關閉"
        >
          ×
        </button>
      </div>
      <div className="space-y-0.5 p-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-[#2f2f2f]"
          >
            <span className="text-[#aaa]">{item.label}</span>
            <Money value={item.value} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinancialOverviewPanel({
  overview,
  loading,
}: {
  overview: FinancialOverview | null;
  loading: boolean;
}) {
  const [expand, setExpand] = useState<'income' | 'expense' | null>(null);

  if (loading && !overview) {
    return (
      <div className="grid gap-3 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-[280px] animate-pulse rounded-md bg-[#252525]" />
        ))}
      </div>
    );
  }

  if (!overview) return null;

  const { assets, incomeStatement, shareholders } = overview;
  const exp = incomeStatement.expenseBreakdown;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <PanelCard title="資產">
        <LineItem label="總資產" value={assets.total} bold />
        <div className="mt-1 space-y-0.5 border-t border-[#333] pt-2">
          <LineItem label="店內現金庫存" value={assets.cashOnHand} />
          <LineItem label="銀行帳戶" value={assets.bankAccounts} />
          <LineItem label="應收帳款" value={assets.accountsReceivable} />
        </div>
        <p className="mt-auto pt-3 text-[10px] leading-relaxed text-[#666]">
          總資產＝現金＋銀行－會員儲值餘額；應收帳款為會員尚未使用完的儲值金。
        </p>
      </PanelCard>

      <PanelCard title="收支" className="relative overflow-visible">
        <div className="relative space-y-1">
          <LineItem
            label="收入"
            value={incomeStatement.totalIncome}
            bold
            onClick={() => setExpand(expand === 'income' ? null : 'income')}
            active={expand === 'income'}
          />
          {expand === 'income' ? (
            <Flyout
              title="收入明細"
              onClose={() => setExpand(null)}
              items={[
                { label: '服務收入', value: incomeStatement.serviceIncome },
                { label: '分租收入', value: incomeStatement.subleaseIncome },
              ]}
            />
          ) : null}

          <LineItem
            label="支出"
            value={incomeStatement.totalExpense}
            bold
            onClick={() => setExpand(expand === 'expense' ? null : 'expense')}
            active={expand === 'expense'}
          />
          {expand === 'expense' ? (
            <Flyout
              title="支出明細"
              onClose={() => setExpand(null)}
              items={[
                { label: '添購', value: exp.添購 },
                { label: '房租', value: exp.房租 },
                { label: '水電', value: exp.水電 },
                { label: '廣告', value: exp.廣告 },
                { label: '師傅薪水', value: exp.師傅薪水 },
                ...(exp.其他 > 0 ? [{ label: '其他', value: exp.其他 }] : []),
              ]}
            />
          ) : null}

          <div className="border-t border-[#333] pt-2">
            <LineItem
              label={incomeStatement.netProfit >= 0 ? '淨利' : '淨損'}
              value={incomeStatement.netProfit}
              bold
            />
          </div>
        </div>
        <p className="mt-auto pt-3 text-[10px] text-[#666]">
          收支為區間損益；收入－支出＝淨利（此區金額均顯示正數）。
        </p>
      </PanelCard>

      <PanelCard title="股東權益">
        {shareholders.length === 0 ? (
          <p className="text-sm text-[#888]">尚無股東資料，請在 Supabase shareholders 表新增。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[#777]">
                  <th className="pb-2 pr-2 font-medium">股東</th>
                  <th className="pb-2 pr-2 text-right font-medium">持股</th>
                  <th className="pb-2 pr-2 text-right font-medium">應領</th>
                  <th className="pb-2 pr-2 text-right font-medium">已發放</th>
                  <th className="pb-2 text-right font-medium">未領</th>
                </tr>
              </thead>
              <tbody>
                {shareholders.map((sh) => (
                  <tr key={sh.id} className="border-t border-[#2a2a2a] text-[#ccc]">
                    <td className="py-2 pr-2">{sh.name}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {(sh.ownershipPercent * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">${fmt(sh.dividendDue)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">${fmt(sh.dividendPaid)}</td>
                    <td className="py-2 text-right tabular-nums">${fmt(sh.dividendUnpaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-auto pt-3 text-[10px] text-[#666]">
          應領＝區間淨利 × 持股；已發放取自「分紅」流水；未領＝應領－已發放。
        </p>
      </PanelCard>
    </div>
  );
}
