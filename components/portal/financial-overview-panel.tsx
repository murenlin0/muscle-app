'use client';

import { displayMoney } from '@/lib/financial-display';
import type { FinancialOverview } from '@/lib/financial-summary-server';
import type { LedgerPresetFilter } from '@/lib/transaction-category';
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
          'flex w-full items-center justify-between rounded-md px-2 py-2.5 text-left transition',
          active ? 'bg-[#252525] ring-1 ring-[#4a6fa5]' : 'hover:bg-[#222]',
        )}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={cn('flex items-center justify-between px-2 py-2', bold && 'py-2.5')}>
      {inner}
    </div>
  );
}

export function FinancialOverviewPanel({
  overview,
  loading,
  ledgerPresetFilter,
  onLedgerPresetFilter,
}: {
  overview: FinancialOverview | null;
  loading: boolean;
  ledgerPresetFilter: LedgerPresetFilter | null;
  onLedgerPresetFilter: (preset: LedgerPresetFilter | null) => void;
}) {
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

  function togglePreset(preset: LedgerPresetFilter) {
    onLedgerPresetFilter(ledgerPresetFilter === preset ? null : preset);
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <PanelCard title="資產">
        <div className="mb-3 flex items-baseline justify-between border-b border-[#2a2a2a] pb-3">
          <span className="text-sm font-medium text-[#aaa]">總資產</span>
          <SignedMoney value={assets.total} className="text-xl" />
        </div>
        <div className="space-y-0.5">
          <LineItem label="店內現金" value={assets.cashOnHand} />
          <LineItem label="富邦帳戶" value={assets.bankAccounts} />
          <LineItem label="餘額未使用" value={assets.unusedMemberBalance} />
          <LineItem label="應收帳款" value={assets.accountsReceivable} muted />
        </div>
        <p className="mt-auto pt-3 text-[10px] leading-relaxed text-[#555]">
          總資產＝店內現金＋富邦帳戶（流水帳更動的帳戶為現金／富邦者，金額數字加總）；餘額未使用＝每位客人會員儲值／使用／補差額金額加總後再合計；應收帳款僅供參考。
        </p>
      </PanelCard>

      <PanelCard title="收支">
        <div className="space-y-0.5">
          <LineItem
            label="收入"
            value={incomeStatement.totalIncome}
            bold
            onClick={() => togglePreset('income')}
            active={ledgerPresetFilter === 'income'}
          />
          <LineItem
            label="支出"
            value={incomeStatement.totalExpense}
            bold
            onClick={() => togglePreset('expense')}
            active={ledgerPresetFilter === 'expense'}
          />
          <div className="mt-1 border-t border-[#2a2a2a] pt-2">
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
          收入＝會員儲值＋一般消費＋會員補差額＋店租收入；支出＝支出＋工資。點收入或支出可篩選下方流水帳。
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
  );
}
