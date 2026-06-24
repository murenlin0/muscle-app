'use client';

import { useMemo } from 'react';
import {
  CATEGORY_NOTION_STYLE,
  formatSignedAmount,
  ledgerAmountClass,
} from '@/lib/category-styles';
import { sortLedgerDisplayRows } from '@/lib/ledger-display-sort';
import { ledgerDisplayAmount } from '@/lib/ledger-amount';
import type { TransactionCategory } from '@/lib/transaction-category';
import { cn } from '@/lib/utils';

export interface ClientLedgerDisplayRow {
  id: string;
  occurredOn: string;
  title: string;
  amount: number;
  category: string;
  categoryClassName?: string;
}

function formatDate(iso: string): string {
  const datePart = iso.includes('T') ? iso.split('T')[0] : iso;
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return iso;
  return `${y}/${m}/${d}`;
}

export function ClientLedgerTable({
  rows,
  loading,
  emptyMessage,
  compact,
  variant = 'liff',
}: {
  rows: ClientLedgerDisplayRow[];
  loading?: boolean;
  emptyMessage?: string;
  compact?: boolean;
  variant?: 'liff' | 'portal';
}) {
  const isPortal = variant === 'portal';
  const pad = compact ? 'px-2 py-2.5' : 'px-3 py-2.5';
  const displayRows = useMemo(() => sortLedgerDisplayRows(rows, true), [rows]);

  if (loading) {
    return (
      <p
        className={cn(
          'px-4 py-10 text-center text-sm',
          isPortal ? 'text-[#666]' : 'neon-panel text-muted-foreground',
        )}
      >
        載入中…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p
        className={cn(
          'px-4 py-10 text-center text-sm',
          isPortal ? 'text-[#666]' : 'neon-panel text-muted-foreground',
        )}
      >
        {emptyMessage ?? '尚無紀錄'}
      </p>
    );
  }

  return (
    <div className={cn(!isPortal && 'neon-panel overflow-hidden')}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead
            className={cn(
              'text-[11px]',
              isPortal
                ? 'sticky top-0 bg-[#1a1a1a] text-[#888]'
                : 'border-b border-primary/15 bg-card/30 text-muted-foreground',
            )}
          >
            <tr>
              <th className="px-2 py-2 text-left font-medium">日期</th>
              <th className="px-2 py-2 text-left font-medium">標題</th>
              <th className="px-2 py-2 text-right font-medium">金額</th>
              <th className="px-2 py-2 text-left font-medium">類型</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const categoryStyle =
                row.categoryClassName ??
                CATEGORY_NOTION_STYLE[row.category as TransactionCategory] ??
                'rounded-full border border-border/50 bg-transparent px-2 py-0.5 text-[10px] text-muted-foreground';
              const signedAmount = ledgerDisplayAmount(
                row.category as TransactionCategory,
                row.amount,
              );

              return (
                <tr
                  key={row.id}
                  className={
                    isPortal
                      ? 'border-b border-[#252525] hover:bg-[#1f1f1f]'
                      : 'border-b border-primary/10 last:border-b-0 hover:bg-primary/5'
                  }
                >
                  <td
                    className={cn(
                      'whitespace-nowrap',
                      pad,
                      isPortal ? 'text-[#aaa]' : 'text-muted-foreground',
                    )}
                  >
                    {formatDate(row.occurredOn)}
                  </td>
                  <td
                    className={cn(
                      isPortal ? 'min-w-0 max-w-[15rem] break-all' : 'max-w-[9rem] truncate',
                      pad,
                      isPortal ? 'text-[#ddd]' : 'text-foreground/90',
                    )}
                    title={row.title}
                  >
                    {row.title}
                  </td>
                  <td
                    className={cn(
                      'whitespace-nowrap text-right font-medium tabular-nums',
                      ledgerAmountClass(signedAmount),
                      pad,
                    )}
                  >
                    {formatSignedAmount(signedAmount)}
                  </td>
                  <td className={pad}>
                    <span className={cn('inline-block font-medium', categoryStyle)}>
                      {row.category}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
