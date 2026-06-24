'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LedgerRow } from '@/components/portal/editable-ledger-table';
import type { ClientLedgerDisplayRow } from '@/components/client-ledger-table';
import { ClientLedgerTable } from '@/components/client-ledger-table';
import {
  formatClientKey,
  formatClientKeyLabel,
} from '@/lib/ledger-client-display';
import { compareLedgerDisplayRows } from '@/lib/ledger-display-sort';
import type { StoreSlug } from '@/lib/stores';

function fmt(n: number) {
  return n.toLocaleString('zh-TW');
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${y}/${m}/${d}`;
}

async function fetchClientRows(
  storeId: StoreSlug,
  from: string,
  to: string,
  clientPhone: string,
): Promise<LedgerRow[]> {
  const all: LedgerRow[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore && page < 50) {
    const qs = new URLSearchParams({
      from,
      to,
      store: storeId,
      clientPhone,
      page: String(page),
      pageSize: '1000',
    });
    const res = await fetch(`/api/portal/reports/transactions?${qs}`, { cache: 'no-store' });
    const data = (await res.json()) as {
      report?: { rows: LedgerRow[]; hasMore: boolean };
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? '無法載入客人流水');
    const chunk = data.report;
    if (!chunk?.rows.length) break;
    all.push(...chunk.rows);
    hasMore = chunk.hasMore;
    page += 1;
  }

  return all.sort((a, b) => compareLedgerDisplayRows(a, b, true));
}

export function ClientLedgerDrawer({
  open,
  client,
  storeId,
  from,
  to,
  vipMemberPhones,
  onClose,
}: {
  open: boolean;
  client: { name: string; phone: string } | null;
  storeId: StoreSlug;
  from: string;
  to: string;
  vipMemberPhones: Set<string>;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [ledgerBalance, setLedgerBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

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
    if (!client) return;
    setLoading(true);
    setFetchError(null);
    try {
      const [data, balanceRes] = await Promise.all([
        fetchClientRows(storeId, from, to, client.phone),
        fetch(
          `/api/portal/clients?store=${encodeURIComponent(storeId)}&phone=${encodeURIComponent(client.phone)}`,
          { cache: 'no-store' },
        ),
      ]);
      setRows(data);
      if (balanceRes.ok) {
        const balData = (await balanceRes.json()) as { balance?: number };
        setLedgerBalance(balData.balance ?? null);
      } else {
        setLedgerBalance(null);
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : '載入失敗');
      setRows([]);
      setLedgerBalance(null);
    } finally {
      setLoading(false);
    }
  }, [client, storeId, from, to]);

  useEffect(() => {
    if (!open || !client) {
      setRows([]);
      setLedgerBalance(null);
      setFetchError(null);
      return;
    }
    void loadRows();
  }, [open, client, loadRows]);

  const balance = ledgerBalance;

  if (!mounted || !open || !client) return null;

  const label = formatClientKeyLabel(client, vipMemberPhones.has(client.phone));
  const key = formatClientKey(client);

  return createPortal(
    <>
      <button
        type="button"
        aria-label="關閉"
        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-[110] flex w-full max-w-lg flex-col border-l border-[#333] bg-[#161616] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`${label} 消費紀錄`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#2a2a2a] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-[#e8e8e8]">{label}</h3>
            <p className="mt-1 text-xs text-[#777]">
              {loading ? '載入中…' : `${rows.length} 筆紀錄`}
              {!loading && balance !== null ? ` · 餘額 $${fmt(balance)}` : ''}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-[#555]">{key}</p>
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
        <div className="flex-1 overflow-y-auto">
          {fetchError ? (
            <p className="px-5 py-8 text-center text-sm text-red-400">{fetchError}</p>
          ) : loading ? (
            <p className="px-5 py-8 text-center text-sm text-[#666]">載入中…</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[#666]">
              {formatDate(from)}～{formatDate(to)} 無紀錄
            </p>
          ) : (
            <ClientLedgerTable
              variant="portal"
              rows={rows.map(
                (row): ClientLedgerDisplayRow => ({
                  id: row.id,
                  occurredOn: row.occurredOn,
                  title: row.title,
                  amount: row.amount,
                  category: row.category,
                }),
              )}
            />
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}
