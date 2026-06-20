'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LedgerAccountFilter, TransactionCategory } from '@/lib/transaction-category';
import type { StoreSlug } from '@/lib/stores';

export interface AiReportFilter {
  from: string;
  to: string;
  store: StoreSlug | null;
  staffName: string | null;
  categories: TransactionCategory[] | null;
  account: LedgerAccountFilter | null;
}

const SAMPLES = [
  '今年淨利多少',
  '本月跟上個月營業額比較',
  '現金加富邦多少',
  '沒電話的客人有幾個',
  '前5名師傅服務時數',
];

export function ReportsAiBox({
  store,
  onApplyFilter,
}: {
  store: StoreSlug;
  onApplyFilter: (filter: AiReportFilter) => void;
}) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [filterApplied, setFilterApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setExplanation(null);
    setFilterApplied(false);

    try {
      const res = await fetch('/api/portal/reports/ai-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, store }),
      });
      const data = (await res.json()) as {
        filter?: AiReportFilter | null;
        answer?: string;
        intent?: { explanation?: string; blocked?: boolean };
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'AI 查詢失敗');
        return;
      }
      setAnswer(data.answer ?? null);
      setExplanation(data.intent?.blocked ? null : (data.intent?.explanation ?? null));
      setFilterApplied(Boolean(data.filter));
      if (data.filter) onApplyFilter(data.filter);
    } catch {
      setError('連線失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-[#161616] p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-primary">
        <Sparkles className="size-4" />
        AI 報表助手
        <span className="rounded-full border border-[#444] px-2 py-0.5 text-[10px] font-normal text-[#888]">
          查詢、統計、比較；不會修改資料
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask(question);
            }
          }}
          placeholder="用說的查報表，例如：今年淨利、本月比上個月、王小明餘額"
          className="flex h-10 flex-1 rounded-md border border-[#444] bg-[#252525] px-3 text-sm text-foreground placeholder:text-[#666]"
        />
        <Button
          type="button"
          size="sm"
          className="h-10"
          disabled={!question.trim() || loading}
          onClick={() => void ask(question)}
        >
          {loading ? '查詢中…' : '送出'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SAMPLES.map((s) => (
          <button
            key={s}
            type="button"
            disabled={loading}
            onClick={() => {
              setQuestion(s);
              void ask(s);
            }}
            className="rounded-full border border-[#444] px-2.5 py-0.5 text-xs text-[#aaa] transition hover:border-primary/50 hover:text-primary disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      ) : null}

      {answer ? (
        <div className="space-y-1 rounded-md border border-[#333] bg-[#1c1c1c] px-3 py-2.5">
          {explanation ? (
            <p className="text-xs text-[#777]">解析：{explanation}</p>
          ) : null}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#e5e5e5]">{answer}</p>
          {filterApplied ? (
            <p className="pt-1 text-[11px] text-[#666]">已自動套用篩選，下方流水帳同步更新</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
