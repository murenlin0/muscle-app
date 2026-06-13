'use client';

import { useEffect, useRef, useState } from 'react';
import { CATEGORY_NOTION_STYLE, LEDGER_ACCOUNT_STYLE, ledgerAmountClass } from '@/lib/category-styles';
import {
  syncClientFieldsFromTitle,
} from '@/lib/ledger-client-detect';
import {
  formatClientKeyLabel,
  resolveClientFromFields,
} from '@/lib/ledger-client-display';
import { LEDGER_ACCOUNTS, primaryLedgerAccount } from '@/lib/ledger-accounts';
import {
  normalizeLedgerAmount,
  shouldShowLedgerAccount,
} from '@/lib/ledger-amount';
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
  staffName: string | null;
  clientName: string | null;
  clientPhone: string | null;
}

type ColKey = 'date' | 'title' | 'amount' | 'category' | 'payment' | 'staff' | 'client';
type RowStatus = 'idle' | 'saving' | 'saved' | 'error';

const COL_LABELS: Record<ColKey, string> = {
  date: '日期',
  title: '標題',
  amount: '金額數字',
  category: '類型',
  payment: '更動的帳戶',
  staff: '人員',
  client: '客人',
};

const colOrder: ColKey[] = ['date', 'title', 'amount', 'category', 'payment', 'staff', 'client'];

/** 欄寬依內容；標題欄可伸縮 */
const COL_HEADER_CLASS: Record<ColKey, string> = {
  date: 'whitespace-nowrap',
  title: '',
  amount: 'whitespace-nowrap',
  category: 'whitespace-nowrap w-[1%]',
  payment: 'whitespace-nowrap w-[1%]',
  staff: 'whitespace-nowrap',
  client: 'whitespace-nowrap',
};

const badgeSelect =
  'mx-1 my-1 w-auto max-w-full cursor-pointer px-2 py-1 text-xs font-medium outline-none transition-opacity rounded-md';

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
    staffName: null,
    clientName: null,
    clientPhone: null,
  };
}

function normalizeRow(row: LedgerRow): LedgerRow {
  const paymentMethods = row.category === '會員使用' ? [] : row.paymentMethods;
  return {
    ...row,
    paymentMethods,
    amount: normalizeLedgerAmount(row.category, row.amount),
  };
}

function rowSnapshot(row: LedgerRow): string {
  const n = normalizeRow(row);
  return JSON.stringify({
    occurredOn: n.occurredOn,
    title: n.title.trim(),
    amount: n.amount,
    category: n.category,
    paymentMethods: n.paymentMethods,
    staffName: n.staffName,
    clientName: n.clientName,
    clientPhone: n.clientPhone,
  });
}

function clientDisplay(
  row: LedgerRow,
  vipMemberPhones: Set<string>,
): string {
  const identity = resolveClientFromFields(
    row.title,
    row.category,
    row.clientName,
    row.clientPhone,
  );
  if (!identity) return '';
  return formatClientKeyLabel(identity, vipMemberPhones.has(identity.phone));
}

function computeTotals(rows: LedgerRow[]) {
  return {
    totalRows: rows.length,
    totalAmount: rows.reduce((sum, r) => sum + r.amount, 0),
  };
}

const cellInput =
  'w-full min-w-0 border-0 bg-transparent px-2 py-1.5 text-sm outline-none ring-0 focus:bg-[#2a2a2a] focus:ring-1 focus:ring-[#4a4a4a] rounded-sm transition-colors duration-150';

export function EditableLedgerTable({
  rows: initialRows,
  loading,
  dataGeneration,
  storeId,
  vipMemberPhones = new Set(),
  onClientClick,
  onStatsChange,
}: {
  rows: LedgerRow[];
  loading: boolean;
  dataGeneration: number;
  storeId: StoreSlug;
  vipMemberPhones?: Set<string>;
  onClientClick?: (client: { name: string; phone: string }) => void;
  onStatsChange?: (stats: { totalRows: number; totalAmount: number }) => void;
}) {
  const [rows, setRows] = useState<LedgerRow[]>(initialRows);
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [rowError, setRowError] = useState<string | null>(null);
  const [staffOptions, setStaffOptions] = useState<string[]>([]);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const lastSavedRef = useRef<Map<string, string>>(new Map());
  const savedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const prevDataGenerationRef = useRef(0);

  useEffect(() => {
    if (dataGeneration === 0 || dataGeneration === prevDataGenerationRef.current) return;
    prevDataGenerationRef.current = dataGeneration;
    rowsRef.current = initialRows;
    setRows(initialRows);
    lastSavedRef.current = new Map(initialRows.map((r) => [r.id, rowSnapshot(r)]));
    onStatsChange?.(computeTotals(initialRows));
  }, [dataGeneration, initialRows, onStatsChange]);

  useEffect(() => {
    let cancelled = false;
    async function loadStaff() {
      const res = await fetch('/api/staff/roster', { cache: 'no-store' });
      const data = (await res.json()) as {
        staff?: { display_name: string; store_id: string }[];
      };
      if (cancelled || !res.ok) return;
      const names = (data.staff ?? [])
        .filter((s) => s.store_id === storeId)
        .map((s) => s.display_name)
        .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      setStaffOptions(names);
    }
    void loadStaff();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  useEffect(() => {
    return () => {
      for (const t of savedTimersRef.current.values()) clearTimeout(t);
    };
  }, []);

  function setStatus(id: string, status: RowStatus) {
    setRowStatus((prev) => ({ ...prev, [id]: status }));
  }

  function flashSaved(id: string) {
    setStatus(id, 'saved');
    const prev = savedTimersRef.current.get(id);
    if (prev) clearTimeout(prev);
    savedTimersRef.current.set(
      id,
      setTimeout(() => {
        setRowStatus((s) => {
          const next = { ...s };
          if (next[id] === 'saved') delete next[id];
          return next;
        });
      }, 1200),
    );
  }

  function updateRow(id: string, patch: Partial<LedgerRow>) {
    const current = rowsRef.current.find((r) => r.id === id);
    if (!current) return;
    const merged = normalizeRow({ ...current, ...patch });
    const next = rowsRef.current.map((r) => (r.id === id ? merged : r));
    rowsRef.current = next;
    setRows(next);
    onStatsChange?.(computeTotals(next));
  }

  async function saveRowById(id: string) {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row || !row.title.trim()) return;

    const normalized = normalizeRow(row);
    const snap = rowSnapshot(normalized);
    if (!id.startsWith('new-') && lastSavedRef.current.get(id) === snap) return;

    setStatus(id, 'saving');
    setRowError(null);

    const payload = {
      storeId,
      occurredOn: normalized.occurredOn,
      title: normalized.title,
      amount: normalized.amount,
      category: normalized.category,
      paymentMethods: normalized.paymentMethods,
      staffName: normalized.staffName,
      clientName: normalized.clientName,
      clientPhone: normalized.clientPhone,
    };

    const isNew = id.startsWith('new-');
    const res = await fetch(
      isNew ? '/api/portal/reports/transactions' : `/api/portal/reports/transactions/${id}`,
      {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    const data = (await res.json()) as { error?: string; id?: string };

    if (!res.ok) {
      setStatus(id, 'error');
      setRowError(data.error ?? '儲存失敗');
      return;
    }

    if (normalized.amount !== row.amount || normalized.paymentMethods !== row.paymentMethods) {
      updateRow(id, {
        amount: normalized.amount,
        paymentMethods: normalized.paymentMethods,
      });
    }

    const persistedId = isNew && data.id ? data.id : id;
    if (isNew && data.id) {
      const next = rowsRef.current.map((r) =>
        r.id === id ? { ...r, id: data.id! } : r,
      );
      rowsRef.current = next;
      setRows(next);
      lastSavedRef.current.delete(id);
      lastSavedRef.current.set(persistedId, snap);
      setRowStatus((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      lastSavedRef.current.set(persistedId, snap);
    }

    flashSaved(persistedId);
  }

  async function deleteRow(row: LedgerRow) {
    if (row.id.startsWith('new-')) {
      const next = rowsRef.current.filter((r) => r.id !== row.id);
      rowsRef.current = next;
      setRows(next);
      onStatsChange?.(computeTotals(next));
      return;
    }
    if (!confirm('確定刪除這一列？')) return;

    setStatus(row.id, 'saving');
    const res = await fetch(
      `/api/portal/reports/transactions/${row.id}?store=${storeId}`,
      { method: 'DELETE' },
    );

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setStatus(row.id, 'error');
      setRowError(data.error ?? '刪除失敗');
      return;
    }

    const next = rowsRef.current.filter((r) => r.id !== row.id);
    rowsRef.current = next;
    setRows(next);
    onStatsChange?.(computeTotals(next));
    lastSavedRef.current.delete(row.id);
    setRowStatus((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
  }

  const showInitialEmpty = loading && rows.length === 0;

  return (
    <div className="overflow-hidden rounded-md border border-[#333] bg-[#1c1c1c] shadow-sm">
      {rowError ? (
        <div className="border-b border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {rowError}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setRowError(null)}
          >
            關閉
          </button>
        </div>
      ) : null}

      <div className="relative overflow-x-auto">
        {loading && rows.length > 0 ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 bg-[#1c1c1c]/25 transition-opacity duration-200"
            aria-hidden
          />
        ) : null}

        <table className="w-max min-w-full border-collapse text-sm table-auto">
          <thead>
            <tr className="border-b border-[#333] bg-[#252525] text-[11px] font-medium tracking-wide text-[#8a8a8a]">
              {colOrder.map((col) => (
                <th
                  key={col}
                  className={cn('px-2 py-2 text-left font-medium', COL_HEADER_CLASS[col])}
                >
                  {COL_LABELS[col]}
                </th>
              ))}
              <th className="w-12 px-1" />
            </tr>
          </thead>
          <tbody>
            {showInitialEmpty ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-[#888]">
                  載入中…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-[#888]">
                  尚無資料，請按下方新增一列。
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const status = rowStatus[row.id];
                const showAccount = shouldShowLedgerAccount(row.category);
                const account = primaryLedgerAccount(row.paymentMethods, row.category);

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'group border-b border-[#2a2a2a] transition-colors duration-300',
                      status === 'saved' && 'bg-[#1f2a1f]/80',
                      status === 'error' && 'bg-[#2a1f1f]/80',
                      status !== 'saved' && status !== 'error' && 'hover:bg-[#262626]',
                    )}
                  >
                    <td className={cn('p-0 align-middle', COL_HEADER_CLASS.date)}>
                      <input
                        type="date"
                        value={row.occurredOn}
                        onChange={(e) => updateRow(row.id, { occurredOn: e.target.value })}
                        onBlur={() => void saveRowById(row.id)}
                        className={cn(cellInput, 'text-[#bbb]')}
                      />
                    </td>
                    <td className="p-0 align-middle">
                      <input
                        type="text"
                        value={row.title}
                        size={Math.max(16, Math.min(row.title.length || 16, 72))}
                        onChange={(e) => updateRow(row.id, { title: e.target.value })}
                        onBlur={() => {
                          const current = rowsRef.current.find((r) => r.id === row.id);
                          if (!current) return;
                          const detected = syncClientFieldsFromTitle(
                            current.title,
                            current.category,
                            {
                              clientName: current.clientName,
                              clientPhone: current.clientPhone,
                            },
                          );
                          updateRow(row.id, {
                            clientName: detected.clientName,
                            clientPhone: detected.clientPhone,
                          });
                          void saveRowById(row.id);
                        }}
                        placeholder="師傅、時長、金額、客人…"
                        className={cn(cellInput, 'w-auto min-w-[12rem] text-[#ebebeb]')}
                      />
                    </td>
                    <td className={cn('p-0 align-middle', COL_HEADER_CLASS.amount)}>
                      <input
                        type="number"
                        value={row.amount || ''}
                        onChange={(e) =>
                          updateRow(row.id, { amount: Number(e.target.value) || 0 })
                        }
                        onBlur={() => void saveRowById(row.id)}
                        className={cn(
                          cellInput,
                          'text-right tabular-nums font-medium',
                          ledgerAmountClass(row.amount),
                        )}
                      />
                    </td>
                    <td className={cn('p-0 align-middle', COL_HEADER_CLASS.category)}>
                      <select
                        value={row.category}
                        onChange={(e) => {
                          const category = e.target.value as TransactionCategory;
                          const detected = syncClientFieldsFromTitle(row.title, category, {
                            clientName: row.clientName,
                            clientPhone: row.clientPhone,
                          });
                          updateRow(row.id, {
                            category,
                            clientName: detected.clientName,
                            clientPhone: detected.clientPhone,
                          });
                          void saveRowById(row.id);
                        }}
                        className={cn(
                          badgeSelect,
                          CATEGORY_NOTION_STYLE[row.category],
                          status === 'saving' && 'opacity-60',
                        )}
                      >
                        {TRANSACTION_CATEGORIES.map((c) => (
                          <option key={c} value={c} className="bg-[#252525] text-white">
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={cn('p-0 align-middle', COL_HEADER_CLASS.payment)}>
                      {showAccount ? (
                        <select
                          value={account}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateRow(row.id, {
                              paymentMethods: v ? [v] : [],
                            });
                            void saveRowById(row.id);
                          }}
                          className={cn(
                            badgeSelect,
                            account
                              ? LEDGER_ACCOUNT_STYLE[account]
                              : 'border border-[#444] text-[#888]',
                            status === 'saving' && 'opacity-60',
                          )}
                        >
                          <option value="">—</option>
                          {LEDGER_ACCOUNTS.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="block px-2 py-1.5 text-[#555]">—</span>
                      )}
                    </td>
                    <td className={cn('p-0 align-middle', COL_HEADER_CLASS.staff)}>
                      <select
                        value={row.staffName ?? ''}
                        onChange={(e) => {
                          updateRow(row.id, {
                            staffName: e.target.value || null,
                          });
                          void saveRowById(row.id);
                        }}
                        className={cn(cellInput, 'text-[#bbb]')}
                      >
                        <option value="">—</option>
                        {staffOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                        {row.staffName && !staffOptions.includes(row.staffName) ? (
                          <option value={row.staffName}>{row.staffName}</option>
                        ) : null}
                      </select>
                    </td>
                    <td className={cn('p-0 align-middle', COL_HEADER_CLASS.client)}>
                          row.title,
                          row.category,
                          row.clientName,
                          row.clientPhone,
                        );
                        if (!identity) {
                          return <span className="block px-2 py-1.5 text-[#555]">—</span>;
                        }
                        const label = clientDisplay(row, vipMemberPhones);
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onClientClick?.(identity);
                            }}
                            title="查看此客人消費紀錄"
                            className={cn(
                              cellInput,
                              'relative z-[1] text-left text-[#9ec5ff] hover:bg-[#2a2a2a] hover:underline',
                              !onClientClick && 'cursor-default text-[#999] hover:no-underline',
                            )}
                          >
                            {label}
                          </button>
                        );
                      })()}
                    </td>
                    <td className="p-0 align-middle text-center">
                      <span className="inline-flex w-8 items-center justify-center text-[10px] text-[#666]">
                        {status === 'saving' ? (
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#888]" />
                        ) : status === 'saved' ? (
                          <span className="text-[#6a9a6a]">✓</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        onClick={() => void deleteRow(row)}
                        className="rounded px-1 py-0.5 text-[#666] opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                        title="刪除"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => {
          const next = [...rowsRef.current, newDraftRow()];
          rowsRef.current = next;
          setRows(next);
          onStatsChange?.(computeTotals(next));
        }}
        className="flex w-full items-center gap-2 border-t border-[#333] px-3 py-2.5 text-left text-sm text-[#8a8a8a] transition hover:bg-[#262626] hover:text-[#ccc]"
      >
        <span className="text-lg leading-none">+</span>
        <span>新增一列</span>
      </button>
    </div>
  );
}
