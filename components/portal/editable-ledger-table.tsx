'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CATEGORY_NOTION_STYLE } from '@/lib/category-styles';
import {
  formatPaymentMethods,
  parsePaymentMethodsInput,
  PAYMENT_METHODS,
} from '@/lib/payment-methods';
import type { StoreSlug } from '@/lib/stores';
import {
  TRANSACTION_CATEGORIES,
  type TransactionCategory,
} from '@/lib/transaction-category';
import { cn } from '@/lib/utils';

export interface LedgerRow {
  id: string;
  occurredOn: string;
  title: string;
  amount: number;
  category: TransactionCategory;
  paymentMethods: string[];
}

type ColKey = 'date' | 'title' | 'amount' | 'category' | 'payment';

const COL_LABELS: Record<ColKey, string> = {
  date: '日期',
  title: '標題',
  amount: '金額數字',
  category: '類型',
  payment: '付款方式',
};

const DEFAULT_WIDTHS: Record<ColKey, number> = {
  date: 128,
  title: 480,
  amount: 108,
  category: 132,
  payment: 180,
};

const WIDTHS_STORAGE_KEY = 'muscle-ledger-col-widths';

function loadWidths(): Record<ColKey, number> {
  if (typeof window === 'undefined') return DEFAULT_WIDTHS;
  try {
    const raw = localStorage.getItem(WIDTHS_STORAGE_KEY);
    if (!raw) return DEFAULT_WIDTHS;
    return { ...DEFAULT_WIDTHS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_WIDTHS;
  }
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function newDraftRow(): LedgerRow {
  return {
    id: `new-${crypto.randomUUID()}`,
    occurredOn: todayIso(),
    title: '',
    amount: 0,
    category: '一般消費',
    paymentMethods: [],
  };
}

const cellInput =
  'w-full min-w-0 border-0 bg-transparent px-2 py-1.5 text-sm outline-none ring-0 focus:bg-[#2a2a2a] focus:ring-1 focus:ring-[#4a4a4a] rounded-sm';

export function EditableLedgerTable({
  rows: initialRows,
  loading,
  storeId,
  onRefresh,
}: {
  rows: LedgerRow[];
  loading: boolean;
  storeId: StoreSlug;
  onRefresh: () => void;
}) {
  const [rows, setRows] = useState<LedgerRow[]>(initialRows);
  const [widths, setWidths] = useState<Record<ColKey, number>>(DEFAULT_WIDTHS);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const resizeRef = useRef<{ col: ColKey; startX: number; startW: number } | null>(null);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    setWidths(loadWidths());
  }, []);

  const persistWidths = useCallback((next: Record<ColKey, number>) => {
    setWidths(next);
    localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const r = resizeRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      const next = { ...widthsRef.current, [r.col]: Math.max(72, r.startW + delta) };
      widthsRef.current = next;
      setWidths(next);
    }
    function onUp() {
      if (resizeRef.current) {
        persistWidths(widthsRef.current);
        resizeRef.current = null;
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [persistWidths]);

  function updateRow(id: string, patch: Partial<LedgerRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function saveRow(row: LedgerRow) {
    if (!row.title.trim()) return;
    setSavingId(row.id);
    setRowError(null);

    const payload = {
      storeId,
      occurredOn: row.occurredOn,
      title: row.title,
      amount: row.amount,
      category: row.category,
      paymentMethods: row.paymentMethods,
    };

    const isNew = row.id.startsWith('new-');
    const res = await fetch(
      isNew ? '/api/portal/reports/transactions' : `/api/portal/reports/transactions/${row.id}`,
      {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    const data = (await res.json()) as { error?: string; id?: string };

    setSavingId(null);
    if (!res.ok) {
      setRowError(data.error ?? '儲存失敗');
      return;
    }
    onRefresh();
  }

  async function deleteRow(row: LedgerRow) {
    if (row.id.startsWith('new-')) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      return;
    }
    if (!confirm('確定刪除這一列？')) return;
    setSavingId(row.id);
    const res = await fetch(
      `/api/portal/reports/transactions/${row.id}?store=${storeId}`,
      { method: 'DELETE' },
    );
    setSavingId(null);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setRowError(data.error ?? '刪除失敗');
      return;
    }
    onRefresh();
  }

  function startResize(col: ColKey, e: React.MouseEvent) {
    e.preventDefault();
    resizeRef.current = { col, startX: e.clientX, startW: widths[col] };
  }

  const colOrder: ColKey[] = ['date', 'title', 'amount', 'category', 'payment'];

  return (
    <div className="overflow-hidden rounded-md border border-[#333] bg-[#1c1c1c] shadow-sm">
      {rowError ? (
        <div className="border-b border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {rowError}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: 900 }}>
          <colgroup>
            {colOrder.map((col) => (
              <col key={col} style={{ width: widths[col] }} />
            ))}
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr className="border-b border-[#333] bg-[#252525] text-[11px] font-medium tracking-wide text-[#8a8a8a]">
              {colOrder.map((col) => (
                <th key={col} className="relative select-none px-0 py-0 text-left font-medium">
                  <div className="flex h-9 items-center px-2">{COL_LABELS[col]}</div>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    onMouseDown={(e) => startResize(col, e)}
                    className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-[#5c8aff]/40"
                  />
                </th>
              ))}
              <th className="px-1" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#888]">
                  載入中…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#888]">
                  尚無資料，請按下方新增一列。
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="group border-b border-[#2a2a2a] transition-colors hover:bg-[#262626]"
                >
                  <td className="p-0 align-middle">
                    <input
                      type="date"
                      value={row.occurredOn}
                      onChange={(e) => updateRow(row.id, { occurredOn: e.target.value })}
                      onBlur={() => void saveRow(row)}
                      className={cn(cellInput, 'text-[#bbb]')}
                    />
                  </td>
                  <td className="p-0 align-middle">
                    <input
                      type="text"
                      value={row.title}
                      onChange={(e) => updateRow(row.id, { title: e.target.value })}
                      onBlur={() => void saveRow(row)}
                      placeholder="輸入標題…"
                      className={cn(cellInput, 'text-[#ebebeb]')}
                    />
                  </td>
                  <td className="p-0 align-middle">
                    <input
                      type="number"
                      value={row.amount || ''}
                      onChange={(e) =>
                        updateRow(row.id, { amount: Number(e.target.value) || 0 })
                      }
                      onBlur={() => void saveRow(row)}
                      className={cn(cellInput, 'text-right tabular-nums text-[#ebebeb]')}
                    />
                  </td>
                  <td className="p-0 align-middle">
                    <select
                      value={row.category}
                      onChange={(e) => {
                        const category = e.target.value as TransactionCategory;
                        updateRow(row.id, { category });
                        void saveRow({ ...row, category });
                      }}
                      className={cn(
                        'mx-1 my-1 w-[calc(100%-8px)] rounded px-2 py-1 text-xs font-medium',
                        CATEGORY_NOTION_STYLE[row.category],
                      )}
                    >
                      {TRANSACTION_CATEGORIES.map((c) => (
                        <option key={c} value={c} className="bg-[#252525] text-white">
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-0 align-middle">
                    <input
                      type="text"
                      list="payment-methods-list"
                      value={formatPaymentMethods(row.paymentMethods)}
                      onChange={(e) =>
                        updateRow(row.id, {
                          paymentMethods: parsePaymentMethodsInput(e.target.value),
                        })
                      }
                      onBlur={() => void saveRow(row)}
                      placeholder="現金、Line…"
                      className={cn(cellInput, 'text-[#bbb]')}
                    />
                  </td>
                  <td className="p-0 align-middle text-center">
                    <button
                      type="button"
                      onClick={() => void deleteRow(row)}
                      className="rounded px-1.5 py-1 text-[#666] opacity-0 transition hover:bg-[#3a2a2a] hover:text-red-400 group-hover:opacity-100"
                      title="刪除"
                    >
                      {savingId === row.id ? '…' : '×'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <datalist id="payment-methods-list">
        {PAYMENT_METHODS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, newDraftRow()])}
        className="flex w-full items-center gap-2 border-t border-[#333] px-3 py-2.5 text-left text-sm text-[#8a8a8a] transition hover:bg-[#262626] hover:text-[#ccc]"
      >
        <span className="text-lg leading-none">+</span>
        <span>新增一列</span>
      </button>
    </div>
  );
}
