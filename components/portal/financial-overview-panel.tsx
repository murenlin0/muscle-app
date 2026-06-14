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
        showSign && positive && 'text-emerald-300/90',
        showSign && !positive && value !== 0 && 'text-rose-300/85',
        !showSign && 'text-[#ebebeb]',
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
        'flex min-h-[300px] flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-[#171717]/95 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]',
        className,
      )}
    >
      <div className="border-b border-white/[0.06] px-5 py-3.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6e6e6e]">
          {title}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">{children}</div>
    </div>
  );
}

function AssetFilterLine({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center justify-between border-b border-white/[0.04] py-2.5 text-left transition-colors last:border-0',
        'hover:bg-white/[0.03]',
        active && 'rounded-md border border-white/[0.08] bg-white/[0.04] px-2 -mx-2',
      )}
    >
      <span className="text-[13px] text-[#9a9a9a] transition-colors group-hover:text-[#c8c8c8]">
        {label}
      </span>
      <span className="flex items-center gap-2">
        <SignedMoney value={value} className="text-[13px] font-medium text-[#d6d6d6]" />
        <span
          className="text-[#484848] transition-colors group-hover:text-[#777]"
          aria-hidden
        >
          ›
        </span>
      </span>
    </button>
  );
}

function PnlFilterCard({
  variant,
  label,
  value,
  active,
  onClick,
}: {
  variant: 'revenue' | 'cost';
  label: string;
  value: number;
  active?: boolean;
  onClick: () => void;
}) {
  const isRevenue = variant === 'revenue';
  const abs = fmt(Math.abs(value));

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200',
        isRevenue
          ? 'border-emerald-500/15 bg-emerald-500/[0.03] hover:border-emerald-400/25 hover:bg-emerald-500/[0.06]'
          : 'border-rose-400/12 bg-rose-500/[0.025] hover:border-rose-400/22 hover:bg-rose-500/[0.05]',
        active &&
          (isRevenue
            ? 'border-emerald-400/35 bg-emerald-500/[0.08] shadow-[0_0_0_1px_rgba(52,211,153,0.08)]'
            : 'border-rose-400/30 bg-rose-500/[0.07] shadow-[0_0_0_1px_rgba(251,113,133,0.08)]'),
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
          isRevenue
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300/85'
            : 'border-rose-400/20 bg-rose-500/8 text-rose-300/75',
        )}
        aria-hidden
      >
        {isRevenue ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 11V5M8 5L5.5 7.5M8 5l2.5 2.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 5v6M8 11l-2.5-2.5M8 11l2.5-2.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#d4d4d4]">
        {label}
      </span>
      <span
        className={cn(
          'shrink-0 tabular-nums text-[15px] font-semibold tracking-tight',
          isRevenue ? 'text-emerald-300/90' : 'text-rose-300/85',
        )}
      >
        {isRevenue ? '+' : '-'}${abs}
      </span>
      <span
        className="shrink-0 text-[#484848] transition-colors group-hover:text-[#777]"
        aria-hidden
      >
        ›
      </span>
    </button>
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
      <div className="grid gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[300px] animate-pulse rounded-xl border border-white/[0.04] bg-[#1a1a1a]"
          />
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
    <div className="grid gap-4 lg:grid-cols-3">
      <PanelCard title="資產">
        <div className="mb-4 border-b border-white/[0.06] pb-4">
          <p className="mb-1 text-[11px] tracking-wide text-[#6e6e6e]">總資產</p>
          <SignedMoney value={assets.total} className="text-2xl font-semibold" />
        </div>
        <div>
          <AssetFilterLine
            label="店內現金"
            value={assets.cashOnHand}
            active={ledgerPresetFilter === 'cash'}
            onClick={() => togglePreset('cash')}
          />
          <AssetFilterLine
            label="富邦帳戶"
            value={assets.bankAccounts}
            active={ledgerPresetFilter === 'fubon'}
            onClick={() => togglePreset('fubon')}
          />
          <AssetFilterLine
            label="餘額未使用"
            value={assets.unusedMemberBalance}
            active={ledgerPresetFilter === 'memberBalance'}
            onClick={() => togglePreset('memberBalance')}
          />
          <div className="flex items-center justify-between border-b border-white/[0.04] py-2.5 last:border-0">
            <span className="text-[13px] text-[#5e5e5e]">應收帳款</span>
            <SignedMoney value={assets.accountsReceivable} className="text-[13px] font-medium text-[#666]" />
          </div>
        </div>
        <p className="mt-auto pt-4 text-[10px] leading-relaxed text-[#505050]">
          總資產＝店內現金＋富邦帳戶；餘額未使用＝會員儲值／使用／補差額逐客累計；應收帳款僅供參考。點擊前三項可篩選流水帳。
        </p>
      </PanelCard>

      <PanelCard title="收支">
        <div className="space-y-2">
          <PnlFilterCard
            variant="revenue"
            label="營業額(不含儲值)"
            value={incomeStatement.totalIncome}
            active={ledgerPresetFilter === 'income'}
            onClick={() => togglePreset('income')}
          />
          <PnlFilterCard
            variant="cost"
            label="成本"
            value={incomeStatement.totalExpense}
            active={ledgerPresetFilter === 'expense'}
            onClick={() => togglePreset('expense')}
          />
        </div>
        <div className="mt-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3.5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#a8a8a8]">
              {incomeStatement.netProfit >= 0 ? '淨利' : '淨損'}
            </span>
            <SignedMoney value={incomeStatement.netProfit} showSign className="text-[15px]" />
          </div>
        </div>
        <p className="mt-auto pt-4 text-[10px] leading-relaxed text-[#505050]">
          營業額＝一般消費＋會員使用＋會員補差額＋店租收入；成本＝支出＋工資。點擊可篩選流水帳。
        </p>
      </PanelCard>

      <PanelCard title="股東權益">
        {shareholders.length === 0 ? (
          <p className="text-[13px] text-[#6e6e6e]">尚無股東資料，請在 Supabase shareholders 表新增。</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="text-[#5e5e5e]">
                  <th className="pb-2.5 pr-2 font-medium">股東</th>
                  <th className="pb-2.5 pr-2 text-right font-medium">持股</th>
                  <th className="pb-2.5 pr-2 text-right font-medium">應領</th>
                  <th className="pb-2.5 pr-2 text-right font-medium">已發放</th>
                  <th className="pb-2.5 text-right font-medium">未領</th>
                </tr>
              </thead>
              <tbody>
                {shareholders.map((sh) => (
                  <tr
                    key={sh.id}
                    className="border-t border-white/[0.04] text-[#b0b0b0] transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="py-2.5 pr-2">{sh.name}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-[#909090]">
                      {(sh.ownershipPercent * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 pr-2 text-right tabular-nums">${fmt(sh.dividendDue)}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums">${fmt(sh.dividendPaid)}</td>
                    <td className="py-2.5 text-right tabular-nums text-[#d0d0d0]">
                      ${fmt(sh.dividendUnpaid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-auto pt-4 text-[10px] leading-relaxed text-[#505050]">
          應領＝區間淨利 × 持股；已發放取自「分紅」流水；未領＝應領－已發放。
        </p>
      </PanelCard>
    </div>
  );
}
