'use client';

import { useEffect, useState } from 'react';
import { displayMoney } from '@/lib/financial-display';
import type { FinancialOverview } from '@/lib/financial-summary-server';
import { cn } from '@/lib/utils';

function fmt(n: number) {
  return displayMoney(n).toLocaleString('zh-TW');
}

function SignedMoney({
  value,
  className,
  showSign = false,
}: {
  value: number;
  className?: string;
  showSign?: boolean;
}) {
  const abs = fmt(Math.abs(value));
  const positive = value >= 0;
  const text = showSign ? `${positive ? '+' : '-'}$${abs}` : `$${abs}`;
  return (
    <span
      className={cn(
        'tabular-nums font-semibold tracking-tight',
        showSign && positive && 'text-[#4fd1c5]',
        showSign && !positive && value !== 0 && 'text-[#f56565]',
        !showSign && 'text-[#e8e8e8]',
        className,
      )}
    >
      {text}
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
        'flex min-h-[280px] flex-col rounded-lg border border-[#2a2a2a] bg-[#1c1c1c]/80',
        className,
      )}
    >
      <div className="border-b border-[#2a2a2a] px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#888]">
        {title}
      </div>
      <div className="flex flex-1 flex-col p-4">{children}</div>
    </div>
  );
}

function LineItem({
  label,
  value,
  onClick,
  active,
  bold,
  muted,
}: {
  label: string;
  value: number;
  onClick?: () => void;
  active?: boolean;
  bold?: boolean;
  muted?: boolean;
}) {
  const inner = (
    <>
      <span
        className={cn(
          'text-sm',
          muted ? 'text-[#777]' : bold ? 'font-medium text-[#ccc]' : 'text-[#999]',
        )}
      >
        {label}
      </span>
      <SignedMoney
        value={value}
        className={cn(bold ? 'text-base' : 'text-sm font-medium text-[#d4d4d4]')}
      />
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'group flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left transition',
          active ? 'bg-[#252525] ring-1 ring-[#3a3a3a]' : 'hover:bg-[#222]',
        )}
      >
        <span className="flex min-w-0 flex-1 items-center justify-between">{inner}</span>
        <span className="shrink-0 text-xs text-[#555] group-hover:text-[#888]" aria-hidden>
          ›
        </span>
      </button>
    );
  }

  return (
    <div className={cn('flex items-center justify-between px-2 py-2', bold && 'py-2.5')}>
      {inner}
    </div>
  );
}

function DetailDrawer({
  open,
  title,
  items,
  onClose,
}: {
  open: boolean;
  title: string;
  items: { label: string; value: number }[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="關閉"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[#333] bg-[#161616]/98 shadow-2xl animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-[#2a2a2a] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#e0e0e0]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-lg leading-none text-[#666] hover:bg-[#252525] hover:text-[#aaa]"
            aria-label="關閉"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-0.5">
            {items.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-md px-3 py-3 hover:bg-[#1f1f1f]"
              >
                <span className="text-sm text-[#999]">{item.label}</span>
                <SignedMoney value={item.value} className="text-sm" />
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

export function FinancialOverviewPanel({
  overview,
  loading,
}: {
  overview: FinancialOverview | null;
  loading: boolean;
}) {
  const [drawer, setDrawer] = useState<'income' | 'expense' | null>(null);

  if (loading && !overview) {
    return (
      <div className="grid gap-3 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-[280px] animate-pulse rounded-lg bg-[#252525]" />
        ))}
      </div>
    );
  }

  if (!overview) return null;

  const { assets, incomeStatement, shareholders } = overview;
  const exp = incomeStatement.expenseBreakdown;

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-3">
        <PanelCard title="資產">
          <div className="mb-3 flex items-baseline justify-between border-b border-[#2a2a2a] pb-3">
            <span className="text-sm font-medium text-[#aaa]">總資產</span>
            <SignedMoney value={assets.total} className="text-xl" />
          </div>
          <div className="space-y-0.5">
            <LineItem label="店內現金" value={assets.cashOnHand} />
            <LineItem label="銀行帳戶" value={assets.bankAccounts} />
            <LineItem label="預收未服務" value={assets.deferredRevenue} />
            <LineItem label="應收帳款" value={assets.accountsReceivable} muted />
          </div>
          <p className="mt-auto pt-3 text-[10px] leading-relaxed text-[#555]">
            總資產＝店內現金＋銀行帳戶（各帳戶流水金額加總）；預收未服務、應收帳款僅供參考。
          </p>
        </PanelCard>

        <PanelCard title="收支">
          <div className="space-y-0.5">
            <LineItem
              label="收入"
              value={incomeStatement.totalIncome}
              bold
              onClick={() => setDrawer('income')}
              active={drawer === 'income'}
            />
            <LineItem
              label="支出"
              value={incomeStatement.totalExpense}
              bold
              onClick={() => setDrawer('expense')}
              active={drawer === 'expense'}
            />
            <div className="border-t border-[#2a2a2a] pt-2 mt-1">
              <div className="flex items-center justify-between px-2 py-2.5">
                <span className="text-sm font-medium text-[#ccc]">
                  {incomeStatement.netProfit >= 0 ? '淨利' : '淨損'}
                </span>
                <SignedMoney
                  value={incomeStatement.netProfit}
                  showSign
                  className="text-base"
                />
              </div>
            </div>
          </div>
          <p className="mt-auto pt-3 text-[10px] text-[#555]">
            收支為區間損益；點收入或支出可查看明細。
          </p>
        </PanelCard>

        <PanelCard title="股東權益">
          {shareholders.length === 0 ? (
            <p className="text-sm text-[#888]">尚無股東資料，請在 Supabase shareholders 表新增。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[#666]">
                    <th className="pb-2 pr-2 font-medium">股東</th>
                    <th className="pb-2 pr-2 text-right font-medium">持股</th>
                    <th className="pb-2 pr-2 text-right font-medium">應領</th>
                    <th className="pb-2 pr-2 text-right font-medium">已發放</th>
                    <th className="pb-2 text-right font-medium">未領</th>
                  </tr>
                </thead>
                <tbody>
                  {shareholders.map((sh) => (
                    <tr key={sh.id} className="border-t border-[#252525] text-[#bbb]">
                      <td className="py-2.5 pr-2">{sh.name}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">
                        {(sh.ownershipPercent * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">${fmt(sh.dividendDue)}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">${fmt(sh.dividendPaid)}</td>
                      <td className="py-2.5 text-right tabular-nums">${fmt(sh.dividendUnpaid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-auto pt-3 text-[10px] text-[#555]">
            應領＝區間淨利 × 持股；已發放取自「分紅」流水；未領＝應領－已發放。
          </p>
        </PanelCard>
      </div>

      <DetailDrawer
        open={drawer === 'income'}
        title="收入明細"
        onClose={() => setDrawer(null)}
        items={[
          { label: '服務收入', value: incomeStatement.serviceIncome },
          { label: '分租收入', value: incomeStatement.subleaseIncome },
        ]}
      />
      <DetailDrawer
        open={drawer === 'expense'}
        title="支出明細"
        onClose={() => setDrawer(null)}
        items={[
          { label: '添購', value: exp.添購 },
          { label: '房租', value: exp.房租 },
          { label: '水電', value: exp.水電 },
          { label: '廣告', value: exp.廣告 },
          { label: '師傅薪水', value: exp.師傅薪水 },
          ...(exp.其他 > 0 ? [{ label: '其他', value: exp.其他 }] : []),
        ]}
      />
    </>
  );
}
