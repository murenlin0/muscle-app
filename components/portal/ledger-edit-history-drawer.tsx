'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LedgerEditAction, LedgerEditHistoryItem } from '@/lib/ledger-edit-history-types';
import { Button } from '@/components/ui/button';
import { STORE_TIMEZONE } from '@/lib/store-timezone';
import type { StoreSlug } from '@/lib/stores';
import { cn } from '@/lib/utils';

const ACTION_LABEL: Record<LedgerEditAction, string> = {
  create: '新增',
  update: '修改',
  delete: '刪除',
  undo: '復原',
};

const ACTION_STYLE: Record<LedgerEditAction, string> = {
  create: 'text-emerald-300/95 border-emerald-400/50',
  update: 'text-amber-300/95 border-amber-400/50',
  delete: 'text-red-300/95 border-red-400/50',
  undo: 'text-sky-300/95 border-sky-400/50',
};

function formatEditTime(iso: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

async function fetchEditHistory(
  storeId: StoreSlug,
): Promise<{ rows: LedgerEditHistoryItem[]; tableReady: boolean }> {
  const qs = new URLSearchParams({ store: storeId, limit: '80' });
  const res = await fetch(`/api/portal/reports/edit-history?${qs}`, { cache: 'no-store' });
  const data = (await res.json()) as {
    edits?: LedgerEditHistoryItem[];
    tableReady?: boolean;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? '無法載入編輯紀錄');
  return { rows: data.edits ?? [], tableReady: data.tableReady ?? true };
}

export function LedgerEditHistoryDrawer({
  open,
  storeId,
  refreshKey,
  onClose,
  onUndo,
}: {
  open: boolean;
  storeId: StoreSlug;
  refreshKey: number;
  onClose: () => void;
  onUndo: () => Promise<void>;
}) {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<LedgerEditHistoryItem[]>([]);
  const [tableReady, setTableReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await fetchEditHistory(storeId);
      setRows(data.rows);
      setTableReady(data.tableReady);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : '載入失敗');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (!open) {
      setRows([]);
      setFetchError(null);
      setUndoError(null);
      return;
    }
    void loadRows();
  }, [open, loadRows, refreshKey]);

  async function handleUndoClick() {
    setUndoing(true);
    setUndoError(null);
    try {
      await onUndo();
      await loadRows();
    } catch (e) {
      setUndoError(e instanceof Error ? e.message : '復原失敗');
    } finally {
      setUndoing(false);
    }
  }

  const canUndo = rows.some(
    (row) => !row.undoneAt && row.action !== 'undo',
  );

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="關閉"
        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-[110] flex w-full max-w-md flex-col border-l border-[#333] bg-[#161616] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="編輯紀錄"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#2a2a2a] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-[#e8e8e8]">編輯紀錄</h3>
            <p className="mt-1 text-xs text-[#777]">
              {loading ? '載入中…' : `${rows.length} 筆紀錄`}
            </p>
            <p className="mt-1 text-[10px] text-[#666]">Ctrl+Z 可復原上一步</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-lg leading-none text-[#666] hover:bg-[#252525] hover:text-[#aaa]"
            aria-label="關閉"
          >
            ×
          </button>
        </div>

        <div className="border-b border-[#2a2a2a] px-5 py-3">
          {!tableReady ? (
            <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200/95">
              編輯紀錄資料表尚未建立。請至 Supabase → SQL Editor，貼上並執行
              <code className="mx-1 rounded bg-black/30 px-1">supabase/18_ledger_edit_history.sql</code>
              後重新整理此頁。
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full border-[#444] bg-[#252525] text-[#ddd] hover:bg-[#2f2f2f]"
            disabled={!canUndo || undoing || loading || !tableReady}
            onClick={() => void handleUndoClick()}
          >
            {undoing ? '復原中…' : '復原上一步（Ctrl+Z）'}
          </Button>
          {undoError ? <p className="mt-2 text-xs text-red-400">{undoError}</p> : null}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {fetchError ? (
            <p className="py-8 text-center text-sm text-red-400">{fetchError}</p>
          ) : loading ? (
            <p className="py-8 text-center text-sm text-[#666]">載入中…</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#666]">
              {fetchError?.includes('資料表尚未建立')
                ? fetchError
                : '尚無手動編輯紀錄'}
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => {
                const undone = Boolean(row.undoneAt);
                return (
                  <li
                    key={row.id}
                    className={cn(
                      'rounded-md border px-3 py-2.5',
                      undone
                        ? 'border-[#2a2a2a] bg-[#1a1a1a] opacity-60'
                        : 'border-[#333] bg-[#1f1f1f]',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          'inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          ACTION_STYLE[row.action],
                        )}
                      >
                        {ACTION_LABEL[row.action]}
                      </span>
                      <time className="shrink-0 text-[10px] tabular-nums text-[#777]">
                        {formatEditTime(row.createdAt)}
                      </time>
                    </div>
                    <p
                      className={cn(
                        'mt-1.5 text-sm leading-snug text-[#ddd]',
                        undone && 'line-through',
                      )}
                    >
                      {row.summary}
                    </p>
                    <p className="mt-1 text-[10px] text-[#666]">{row.actorName}</p>
                    {undone ? (
                      <p className="mt-1 text-[10px] text-[#555]">已復原</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}
