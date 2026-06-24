'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClientLedgerDrawer } from '@/components/portal/client-ledger-drawer';
import { EditableLedgerTable, type LedgerRow } from '@/components/portal/editable-ledger-table';
import { LedgerEditHistoryDrawer } from '@/components/portal/ledger-edit-history-drawer';
import { FinancialOverviewPanel } from '@/components/portal/financial-overview-panel';
import { ReportsAiBox, type AiReportFilter } from '@/components/portal/reports-ai-box';
import { StatusBanner } from '@/components/portal/status-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CATEGORY_NOTION_STYLE, LEDGER_ACCOUNT_STYLE } from '@/lib/category-styles';
import type { FinancialOverview } from '@/lib/financial-summary-server';
import { LEDGER_UI_PAGE_SIZE } from '@/lib/ledger-pagination';
import { sortLedgerDisplayRows } from '@/lib/ledger-display-sort';
import { REPORTS_UI_VERSION } from '@/lib/reports-ui-version';
import { STORE_LIST, type StoreSlug } from '@/lib/stores';
import {
  accountForLedgerPreset,
  categoriesForLedgerPreset,
  labelForLedgerPreset,
  TRANSACTION_CATEGORIES,
  type LedgerPresetFilter,
  type LedgerAccountFilter,
  type TransactionCategory,
} from '@/lib/transaction-category';
import { cn } from '@/lib/utils';

function CategoryFilterBadge({ category }: { category: TransactionCategory }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 px-2.5 py-0.5 text-xs font-medium rounded-full border',
        CATEGORY_NOTION_STYLE[category],
      )}
    >
      {category}
    </span>
  );
}

function AccountFilterBadge({ account }: { account: LedgerAccountFilter }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 px-2.5 py-0.5 text-xs font-medium rounded-full border',
        LEDGER_ACCOUNT_STYLE[account],
      )}
    >
      {account}
    </span>
  );
}

interface ReportList {
  rows: LedgerRow[];
  totalRows: number;
  totalCount: number;
  totalAmount: number;
  latestRecordDate: string | null;
  earliestInRange: string | null;
  hasMore: boolean;
  apiVersion: number;
  vipMemberPhones?: string[];
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
  showAiAssistant = true,
}: {
  storeFilter?: StoreSlug;
  showStorePicker?: boolean;
  showAiAssistant?: boolean;
}) {
  const [from, setFrom] = useState(LEDGER_DEFAULT_FROM);
  const [to, setTo] = useState(today());
  const [store, setStore] = useState<StoreSlug>(storeFilter ?? 'store1');
  const [category, setCategory] = useState<TransactionCategory | ''>('');
  const [ledgerPresetFilter, setLedgerPresetFilter] = useState<LedgerPresetFilter | null>(null);
  const [staffFilter, setStaffFilter] = useState<string | null>(null);
  const [aiCategoryFilter, setAiCategoryFilter] = useState<TransactionCategory[] | null>(null);
  const [report, setReport] = useState<ReportList | null>(null);
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [stats, setStats] = useState({ totalRows: 0, totalAmount: 0 });
  const [dataGeneration, setDataGeneration] = useState(0);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [normalizing, setNormalizing] = useState(false);
  const [notionSyncing, setNotionSyncing] = useState(false);
  const [calSyncing, setCalSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [ledgerMeta, setLedgerMeta] = useState<{
    totalCount: number;
    totalAmount: number;
    apiVersion: number;
    hasMore: boolean;
  } | null>(null);
  const [vipMemberPhones, setVipMemberPhones] = useState<Set<string>>(new Set());
  const [selectedClient, setSelectedClient] = useState<{ name: string; phone: string } | null>(
    null,
  );
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryRefreshKey, setEditHistoryRefreshKey] = useState(0);
  const ledgerSectionRef = useRef<HTMLElement>(null);

  const activeStore = storeFilter ?? store;

  const activeCategories = useMemo(() => {
    if (ledgerPresetFilter) {
      const cats = categoriesForLedgerPreset(ledgerPresetFilter);
      if (cats) return cats;
    }
    if (category) return [category];
    if (aiCategoryFilter?.length) return aiCategoryFilter;
    return null;
  }, [ledgerPresetFilter, category, aiCategoryFilter]);

  const activeAccount = useMemo(
    () => (ledgerPresetFilter ? accountForLedgerPreset(ledgerPresetFilter) : null),
    [ledgerPresetFilter],
  );

  const ledgerDraftDefaults = useMemo((): Partial<LedgerRow> => {
    const defaultCategory =
      category ||
      (activeCategories?.length === 1 ? activeCategories[0] : undefined) ||
      '一般消費';
    return {
      occurredOn: to,
      category: defaultCategory,
      paymentMethods: activeAccount ? [activeAccount] : [],
      staffName: staffFilter,
    };
  }, [to, category, activeCategories, activeAccount, staffFilter]);

  const filterCategories = activeCategories;

  const filterPresetLabel = ledgerPresetFilter ? labelForLedgerPreset(ledgerPresetFilter) : null;

  const showFilterBar = Boolean(filterCategories?.length || activeAccount || staffFilter);

  const displayRows = useMemo(() => {
    const rows = report?.rows ?? [];
    if (sortOrder === 'asc') return sortLedgerDisplayRows(rows, false);
    return rows;
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

  /** 抓一頁流水帳；withMeta=true 時同時更新統計（筆數／合計／VIP 名單） */
  const loadLedgerPage = useCallback(
    async (page: number, withMeta: boolean) => {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({ from, to });
      qs.set('store', activeStore);
      qs.set('page', String(page));
      qs.set('pageSize', String(LEDGER_UI_PAGE_SIZE));
      if (!withMeta) qs.set('meta', '0');
      if (activeCategories?.length === 1) {
        qs.set('category', activeCategories[0]!);
      } else if (activeCategories && activeCategories.length > 1) {
        qs.set('categories', activeCategories.join(','));
      }
      if (activeAccount) qs.set('account', activeAccount);
      if (staffFilter) qs.set('staffName', staffFilter);

      try {
        const txRes = await fetch(`/api/portal/reports/transactions?${qs}`, { cache: 'no-store' });
        const txData = (await txRes.json()) as { report?: ReportList; error?: string };
        if (!txRes.ok) {
          throw new Error(txData.error ?? '無法載入流水帳');
        }
        const chunk = txData.report;
        if (!chunk) throw new Error('無法載入流水帳');

        const rows = chunk.rows.map((r) => ({
          ...r,
          staffName: r.staffName ?? null,
          clientName: r.clientName ?? null,
          clientPhone: r.clientPhone ?? null,
        }));

        setReport((prev) => ({
          rows,
          totalRows: rows.length,
          totalCount: withMeta ? chunk.totalCount : prev?.totalCount ?? rows.length,
          totalAmount: withMeta ? chunk.totalAmount : prev?.totalAmount ?? 0,
          latestRecordDate: withMeta ? chunk.latestRecordDate : prev?.latestRecordDate ?? null,
          earliestInRange: chunk.earliestInRange,
          hasMore: chunk.hasMore,
          apiVersion: chunk.apiVersion ?? 0,
        }));
        if (withMeta) {
          if (chunk.vipMemberPhones?.length) {
            setVipMemberPhones(new Set(chunk.vipMemberPhones));
          }
          setLedgerMeta({
            totalCount: chunk.totalCount,
            totalAmount: chunk.totalAmount,
            apiVersion: chunk.apiVersion ?? 0,
            hasMore: chunk.hasMore,
          });
          setStats({ totalRows: chunk.totalCount, totalAmount: chunk.totalAmount });
        }
        setLedgerPage(page);
        setDataGeneration((g) => g + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : '無法載入報表');
        setReport(null);
        setLedgerMeta(null);
      } finally {
        setLoading(false);
      }
    },
    [from, to, activeStore, activeCategories, activeAccount, staffFilter],
  );

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const ovRes = await fetch(
        `/api/portal/reports/overview?${new URLSearchParams({ from, to, store: activeStore })}`,
        { cache: 'no-store' },
      );
      const ovData = (await ovRes.json()) as { overview?: FinancialOverview; error?: string };
      if (!ovRes.ok) {
        setError(ovData.error ?? '無法載入財務總覽');
        setOverview(null);
      } else {
        setOverview(ovData.overview ?? null);
      }
    } catch {
      setOverview(null);
    } finally {
      setOverviewLoading(false);
    }
  }, [from, to, activeStore]);

  /** 完整重載：統計 + 第一頁 + 財務總覽 */
  const load = useCallback(
    async (page = 0) => {
      setSortOrder('desc');
      await Promise.all([loadLedgerPage(page, true), loadOverview()]);
    },
    [loadLedgerPage, loadOverview],
  );

  // 篩選條件變更 → 完整重載第一頁
  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, activeStore, activeCategories, activeAccount, staffFilter]);

  useEffect(() => {
    if (!ledgerPresetFilter) return;
    ledgerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [ledgerPresetFilter]);

  /** 翻頁：只抓當頁列，不重抓統計與財務總覽 */
  function goToPage(page: number) {
    void loadLedgerPage(page, false);
  }

  const bumpEditHistory = useCallback(() => {
    setEditHistoryRefreshKey((key) => key + 1);
  }, []);

  const handleUndoEdit = useCallback(async () => {
    const res = await fetch('/api/portal/reports/edit-history/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: activeStore }),
    });
    const data = (await res.json()) as { error?: string; summary?: string };
    if (!res.ok) {
      throw new Error(data.error ?? '復原失敗');
    }
    await loadLedgerPage(ledgerPage, true);
    await loadOverview();
    bumpEditHistory();
    if (data.summary) {
      setSyncMsg(`已復原：${data.summary}`);
    }
  }, [activeStore, ledgerPage, loadLedgerPage, loadOverview, bumpEditHistory]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) {
        return;
      }
      e.preventDefault();
      void handleUndoEdit().catch((err) => {
        setError(err instanceof Error ? err.message : '復原失敗');
      });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndoEdit]);

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
        deduped?: number;
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
      `已正規化：掃描 ${r?.scanned ?? 0} 筆、去重 ${r?.deduped ?? 0} 筆、更新 ${r?.updated ?? 0} 筆、拆分轉移 ${r?.splitTransfers ?? 0} 筆、拆分多人合寫 ${r?.splitMultiStaff ?? 0} 組${issueNote}`,
    );
    if (r?.issues.length) {
      setError(r.issues.slice(0, 3).join('；'));
    }
    await load(0);
  }

  async function handleNotionSync() {
    setNotionSyncing(true);
    setSyncMsg(null);
    setError(null);
    const res = await fetch('/api/portal/reports/sync-notion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: activeStore }),
    });
    const data = (await res.json()) as {
      error?: string;
      notionRows?: number;
      upserted?: number;
      latestRecordDate?: string | null;
    };
    setNotionSyncing(false);
    if (!res.ok) {
      setError(data.error ?? 'Notion 同步失敗');
      return;
    }
    setSyncMsg(
      `Notion 同步完成：${data.notionRows ?? 0} 筆、寫入 ${data.upserted ?? 0} 筆${data.latestRecordDate ? `（最新 ${data.latestRecordDate}）` : ''}`,
    );
    await load(0);
  }

  async function handleCalendarSync() {
    setCalSyncing(true);
    setSyncMsg(null);
    setError(null);
    const res = await fetch('/api/portal/reports/sync-calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromDate: from,
        toDate: to,
      }),
    });
    const data = (await res.json()) as {
      error?: string;
      backfill?: {
        imported?: number;
        skippedExisting?: number;
        skippedPending?: number;
        errors?: string[];
        titles?: string[];
      };
      processed?: number;
      skipped?: number;
      errors?: string[];
      titles?: string[];
      deletions?: { cancelled?: number; errors?: string[] };
    };
    setCalSyncing(false);
    if (!res.ok) {
      setError(data.error ?? '日曆同步失敗');
      return;
    }
    if (data.backfill) {
      const bf = data.backfill;
      const errNote = bf.errors?.length ? `（${bf.errors.length} 筆錯誤）` : '';
      setSyncMsg(
        `日曆補匯完成：新增 ${bf.imported ?? 0} 筆、略過已有 ${bf.skippedExisting ?? 0} 筆${errNote}`,
      );
      if (bf.errors?.length) {
        setError(bf.errors.slice(0, 3).join('；'));
      }
    } else {
      const errNote = data.errors?.length ? `（${data.errors.length} 筆錯誤）` : '';
      const cancelNote =
        data.deletions?.cancelled ? `、取消預約 ${data.deletions.cancelled} 筆` : '';
      setSyncMsg(
        `日曆同步完成：新增 ${data.processed ?? 0} 筆、略過 ${data.skipped ?? 0} 筆${cancelNote}${errNote}`,
      );
      if (data.errors?.length) {
        setError(data.errors.slice(0, 3).join('；'));
      }
    }
    await load(0);
  }

  function handleApplyAiFilter(filter: AiReportFilter) {
    setFrom(filter.from);
    setTo(filter.to);
    if (showStorePicker && filter.store) {
      setStore(filter.store);
    }
    setStaffFilter(filter.staffName?.trim() || null);

    if (filter.account) {
      setLedgerPresetFilter(filter.account === '現金' ? 'cash' : 'fubon');
      setCategory('');
      setAiCategoryFilter(null);
    } else if (filter.categories && filter.categories.length === 1) {
      setCategory(filter.categories[0]!);
      setLedgerPresetFilter(null);
      setAiCategoryFilter(null);
    } else if (filter.categories && filter.categories.length > 1) {
      setAiCategoryFilter(filter.categories);
      setCategory('');
      setLedgerPresetFilter(null);
    } else {
      setCategory('');
      setLedgerPresetFilter(null);
      setAiCategoryFilter(null);
    }
  }

  const totalPages = ledgerMeta
    ? Math.max(1, Math.ceil(ledgerMeta.totalCount / LEDGER_UI_PAGE_SIZE))
    : 1;
  const pageStart = ledgerPage * LEDGER_UI_PAGE_SIZE + 1;
  const pageEnd = Math.min((ledgerPage + 1) * LEDGER_UI_PAGE_SIZE, ledgerMeta?.totalCount ?? 0);

  return (
    <div className="flex flex-col gap-5">
      {error ? <StatusBanner variant="error">{error}</StatusBanner> : null}
      {syncMsg ? <StatusBanner variant="success">{syncMsg}</StatusBanner> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#666]">
          手動新增、修改、刪除都會記錄在編輯紀錄；按 Ctrl+Z 可復原上一步
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-[#444] bg-[#252525] text-[#ddd] hover:bg-[#2f2f2f]"
          onClick={() => setEditHistoryOpen(true)}
        >
          編輯紀錄
        </Button>
      </div>

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
        <Button type="button" size="sm" variant="outline" onClick={() => void load(ledgerPage)} disabled={loading}>
          {loading ? '載入中…' : '更新報表'}
        </Button>
        <span className="self-center rounded border border-[#444] bg-[#252525] px-2 py-1 text-[11px] tabular-nums text-[#aaa]">
          報表 {REPORTS_UI_VERSION}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={notionSyncing}
          onClick={() => void handleNotionSync()}
        >
          {notionSyncing ? '同步中…' : '從 Notion 同步'}
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={calSyncing}
          onClick={() => void handleCalendarSync()}
          title="依上方起迄日，補匯 Google 日曆已結帳但報表缺漏的事件"
        >
          {calSyncing ? '同步中…' : '同步日曆結帳'}
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#ccc]">財務總覽</h2>
          <span className="rounded border border-[#333] bg-[#1a1a1a] px-2 py-0.5 text-[10px] tabular-nums text-[#666]">
            UI {REPORTS_UI_VERSION}
          </span>
        </div>
        <FinancialOverviewPanel
          overview={overview}
          loading={overviewLoading}
          ledgerPresetFilter={ledgerPresetFilter}
          onLedgerPresetFilter={(preset) => {
            setLedgerPresetFilter(preset);
            if (preset) {
              setCategory('');
              setAiCategoryFilter(null);
            }
          }}
        />
      </section>

      {showAiAssistant ? (
        <ReportsAiBox store={activeStore} onApplyFilter={handleApplyAiFilter} />
      ) : null}

      <section ref={ledgerSectionRef} className="space-y-3 border-t border-[#333] pt-5 scroll-mt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#ccc]">流水帳</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-[#888]">類型篩選</Label>
              <select
                value={category}
                onChange={(e) => {
                  const next = e.target.value as TransactionCategory | '';
                  setCategory(next);
                  setAiCategoryFilter(null);
                  if (next) setLedgerPresetFilter(null);
                }}
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
                <option value="desc">新 → 舊</option>
                <option value="asc">舊 → 新</option>
              </select>
            </div>
          </div>
        </div>

        {showFilterBar ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-md border border-[#333] bg-[#1a1a1a] px-3 py-2.5">
            <span className="text-sm text-[#888]">篩選條件</span>
            {activeAccount ? (
              <>
                <span className="text-sm text-[#666]">更動的帳戶</span>
                <AccountFilterBadge account={activeAccount} />
              </>
            ) : null}
            {filterCategories?.length ? (
              <>
                <span className="text-sm text-[#666]">類型</span>
                {filterCategories.map((cat) => (
                  <CategoryFilterBadge key={cat} category={cat} />
                ))}
              </>
            ) : null}
            {filterPresetLabel ? (
              <span className="text-xs text-[#666]">（{filterPresetLabel}）</span>
            ) : null}
            {staffFilter ? (
              <>
                <span className="text-sm text-[#666]">師傅</span>
                <span className="inline-flex shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {staffFilter}
                </span>
              </>
            ) : null}
            <button
              type="button"
              className="ml-auto rounded px-2 py-0.5 text-xs text-[#888] hover:bg-[#252525] hover:text-[#ccc]"
              onClick={() => {
                setLedgerPresetFilter(null);
                setCategory('');
                setAiCategoryFilter(null);
                setStaffFilter(null);
              }}
            >
              清除篩選
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#888]">
          <span>
            {stats.totalRows > 0 || report
              ? `共 ${fmt(stats.totalRows)} 筆 · 金額合計 $${fmt(stats.totalAmount)}${ledgerMeta ? ` · 第 ${ledgerPage + 1}/${totalPages} 頁（${fmt(pageStart)}–${fmt(pageEnd)}）` : ''}`
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
          key={dataGeneration}
          rows={displayRows}
          loading={loading}
          dataGeneration={dataGeneration}
          storeId={activeStore}
          vipMemberPhones={vipMemberPhones}
          draftDefaults={ledgerDraftDefaults}
          onClientClick={setSelectedClient}
          onRowCreated={() => void load(ledgerPage)}
          onEditCommitted={bumpEditHistory}
        />

        {ledgerMeta && totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || ledgerPage <= 0}
              onClick={() => goToPage(ledgerPage - 1)}
            >
              上一頁
            </Button>
            <span className="text-xs text-[#888]">
              {ledgerPage + 1} / {totalPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || ledgerPage + 1 >= totalPages}
              onClick={() => goToPage(ledgerPage + 1)}
            >
              下一頁
            </Button>
          </div>
        ) : null}

        <p className="text-xs text-[#666]">
          表頭欄位右緣可拖曳調整寬度（會記住設定）。點欄位即可編輯，離開欄位自動儲存；點「客人」可查看該客人消費紀錄。更動的帳戶僅現金／富邦；會員使用留空；支出／分紅／轉出為負數；轉入為正數。
        </p>
      </section>

      <ClientLedgerDrawer
        open={selectedClient !== null}
        client={selectedClient}
        storeId={activeStore}
        from={from}
        to={to}
        vipMemberPhones={vipMemberPhones}
        onClose={() => setSelectedClient(null)}
      />

      <LedgerEditHistoryDrawer
        open={editHistoryOpen}
        storeId={activeStore}
        refreshKey={editHistoryRefreshKey}
        onClose={() => setEditHistoryOpen(false)}
        onUndo={handleUndoEdit}
      />
    </div>
  );
}
