'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EditableLedgerTable, type LedgerRow } from '@/components/portal/editable-ledger-table';
import { FinancialOverviewPanel } from '@/components/portal/financial-overview-panel';
import { StatusBanner } from '@/components/portal/status-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FinancialOverview } from '@/lib/financial-summary-server';
import { STORE_LIST, type StoreSlug } from '@/lib/stores';
import { TRANSACTION_CATEGORIES, type TransactionCategory } from '@/lib/transaction-category';

interface ReportList {
  rows: LedgerRow[];
  totalRows: number;
  totalCount: number;
  totalAmount: number;
  latestRecordDate: string | null;
  earliestInRange: string | null;
  hasMore: boolean;
  apiVersion: number;
}

function fmt(n: number) {
  return n.toLocaleString('zh-TW');
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${y}/${m}/${d}`;
}

/** 民有店 Notion 歷史資料起日 */
const LEDGER_DEFAULT_FROM = '2024-03-01';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ReportsDashboard({
  storeFilter,
  showStorePicker = false,
}: {
  storeFilter?: StoreSlug;
  showStorePicker?: boolean;
}) {
  const [from, setFrom] = useState(LEDGER_DEFAULT_FROM);
  const [to, setTo] = useState(today());
  const [store, setStore] = useState<StoreSlug>(storeFilter ?? 'store1');
  const [category, setCategory] = useState<TransactionCategory | ''>('');
  const [report, setReport] = useState<ReportList | null>(null);
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [stats, setStats] = useState({ totalRows: 0, totalAmount: 0 });
  const [dataGeneration, setDataGeneration] = useState(0);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('asc');
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [normalizing, setNormalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [ledgerMeta, setLedgerMeta] = useState<{ totalCount: number; apiVersion: number } | null>(null);

  const activeStore = storeFilter ?? store;

  const displayRows = useMemo(() => {
    const rows = report?.rows ?? [];
    if (sortOrder === 'desc') return rows;
    return [...rows].reverse();
  }, [report?.rows, sortOrder]);

  const rangeBounds = useMemo(() => {
    if (report?.earliestInRange && report.rows[0]) {
      return { oldest: report.earliestInRange, newest: report.rows[0].occurredOn };
    }
    const rows = report?.rows ?? [];
    if (!rows.length) return null;
    return {
      oldest: rows[rows.length - 1]?.occurredOn,
      newest: rows[0]?.occurredOn,
    };
  }, [report?.rows, report?.earliestInRange]);

  const load = useCallback(async () => {
    setLoading(true);
    setOverviewLoading(true);
    setError(null);
    const baseQs = new URLSearchParams({ from, to });
    baseQs.set('store', activeStore);
    if (category) baseQs.set('category', category);

    const ovPromise = fetch(
      `/api/portal/reports/overview?${new URLSearchParams({ from, to, store: activeStore })}`,
      { cache: 'no-store' },
    );

    try {
      const allRows: LedgerRow[] = [];
      let page = 0;
      let totalCount = 0;
      let apiVersion = 0;
      let latestRecordDate: string | null = null;
      let earliestInRange: string | null = null;
      let hasMore = true;

      while (hasMore && page < 50) {
        const qs = new URLSearchParams(baseQs);
        qs.set('page', String(page));
        qs.set('pageSize', '1000');
        const txRes = await fetch(`/api/portal/reports/transactions?${qs}`, { cache: 'no-store' });
        const txData = (await txRes.json()) as { report?: ReportList; error?: string };
        if (!txRes.ok) {
          throw new Error(txData.error ?? '無法載入流水帳');
        }
        const chunk = txData.report;
        if (!chunk) break;

        apiVersion = chunk.apiVersion ?? 0;
        totalCount = chunk.totalCount ?? chunk.rows.length;
        latestRecordDate = chunk.latestRecordDate;
        if (chunk.earliestInRange) earliestInRange = chunk.earliestInRange;
        allRows.push(
          ...chunk.rows.map((r) => ({
            ...r,
            staffName: r.staffName ?? null,
            clientName: r.clientName ?? null,
            clientPhone: r.clientPhone ?? null,
          })),
        );
        hasMore = chunk.hasMore;
        page += 1;

        if (chunk.apiVersion < 4 && page === 1 && !chunk.hasMore && chunk.totalCount > chunk.rows.length) {
          throw new Error('伺服器版本過舊，請稍後再試或聯絡管理員重新部署');
        }
      }

      const ovRes = await ovPromise;
      const ovData = (await ovRes.json()) as { overview?: FinancialOverview; error?: string };
      if (!ovRes.ok) {
        setError(ovData.error ?? '無法載入財務總覽');
        setOverview(null);
      } else {
        setOverview(ovData.overview ?? null);
      }

      const totalAmount = allRows.reduce((sum, r) => sum + r.amount, 0);
      const mergedEarliest = allRows.length ? allRows[allRows.length - 1]?.occurredOn ?? null : null;
      const merged: ReportList = {
        rows: allRows,
        totalRows: allRows.length,
        totalCount,
        totalAmount,
        latestRecordDate,
        earliestInRange: mergedEarliest ?? earliestInRange,
        hasMore: false,
        apiVersion,
      };

      setReport(merged);
      setLedgerMeta({ totalCount, apiVersion });
      setDataGeneration((g) => g + 1);
      setStats({ totalRows: allRows.length, totalAmount });

      if (allRows.length < totalCount) {
        setError(`僅載入 ${allRows.length} / ${totalCount} 筆，請再按「更新報表」`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '無法載入報表');
      setReport(null);
      setLedgerMeta(null);
    } finally {
      setLoading(false);
      setOverviewLoading(false);
    }
  }, [from, to, activeStore, category]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleNormalizeLedger() {
    setNormalizing(true);
    setSyncMsg(null);
    setError(null);
    const res = await fetch('/api/portal/reports/normalize-ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: activeStore }),
    });
    const data = (await res.json()) as {
      error?: string;
      report?: {
        scanned: number;
        updated: number;
        splitTransfers: number;
        splitMultiStaff: number;
        issues: string[];
      };
    };
    setNormalizing(false);
    if (!res.ok) {
      setError(data.error ?? '正規化失敗');
      return;
    }
    const r = data.report;
    const issueNote =
      r && r.issues.length > 0 ? `（${r.issues.length} 筆需手動處理）` : '';
    setSyncMsg(
      `已正規化：掃描 ${r?.scanned ?? 0} 筆、更新 ${r?.updated ?? 0} 筆、拆分轉移 ${r?.splitTransfers ?? 0} 筆、拆分多人合寫 ${r?.splitMultiStaff ?? 0} 組${issueNote}`,
    );
    if (r?.issues.length) {
      setError(r.issues.slice(0, 3).join('；'));
    }
    await load();
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? <StatusBanner variant="error">{error}</StatusBanner> : null}
      {syncMsg ? <StatusBanner variant="success">{syncMsg}</StatusBanner> : null}

      <div className="flex flex-wrap items-end gap-3 rounded-md border border-[#333] bg-[#1c1c1c] p-3">
        <div className="space-y-1">
          <Label htmlFor="from" className="text-xs text-[#888]">
            起日
          </Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 border-[#444] bg-[#252525]" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to" className="text-xs text-[#888]">
            迄日
          </Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 border-[#444] bg-[#252525]" />
        </div>
        {showStorePicker ? (
          <div className="space-y-1">
            <Label className="text-xs text-[#888]">分店</Label>
            <select
              value={store}
              onChange={(e) => setStore(e.target.value as StoreSlug)}
              className="flex h-9 rounded-md border border-[#444] bg-[#252525] px-2 text-sm"
            >
              {STORE_LIST.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? '載入中…' : '更新報表'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={normalizing}
          onClick={() => void handleNormalizeLedger()}
        >
          {normalizing ? '正規化中…' : '正規化流水帳'}
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#ccc]">財務總覽</h2>
        <FinancialOverviewPanel overview={overview} loading={overviewLoading} />
      </section>

      <section className="space-y-3 border-t border-[#333] pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#ccc]">流水帳</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-[#888]">類型篩選</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TransactionCategory | '')}
                className="flex h-9 min-w-[8rem] rounded-md border border-[#444] bg-[#252525] px-2 text-sm"
              >
                <option value="">全部</option>
                {TRANSACTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[#888]">排序</Label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
                className="flex h-9 min-w-[8rem] rounded-md border border-[#444] bg-[#252525] px-2 text-sm"
              >
                <option value="asc">舊 → 新</option>
                <option value="desc">新 → 舊</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#888]">
          <span>
            {stats.totalRows > 0 || report
              ? `共 ${fmt(stats.totalRows)} 筆${ledgerMeta && ledgerMeta.totalCount !== stats.totalRows ? ` / ${fmt(ledgerMeta.totalCount)}` : ''} · 金額合計 $${fmt(stats.totalAmount)}${ledgerMeta ? ` · API v${ledgerMeta.apiVersion}` : ''}`
              : ' '}
          </span>
          <span>
            {rangeBounds
              ? `區間內：最舊 ${formatDate(rangeBounds.oldest)} · 最新 ${formatDate(rangeBounds.newest)}`
              : `篩選：${formatDate(from)}～${formatDate(to)}`}
            {report?.latestRecordDate ? ` · 資料庫最新 ${formatDate(report.latestRecordDate)}` : ''}
          </span>
        </div>

        <EditableLedgerTable
          key={`${dataGeneration}-${sortOrder}`}
          rows={displayRows}
          loading={loading}
          dataGeneration={dataGeneration}
          storeId={activeStore}
          onStatsChange={setStats}
        />

        <p className="text-xs text-[#666]">
          點欄位即可編輯，離開欄位自動儲存。更動的帳戶僅現金／富邦；會員使用留空；支出／分紅／轉出為負數；轉入為正數。
        </p>
      </section>
    </div>
  );
}
