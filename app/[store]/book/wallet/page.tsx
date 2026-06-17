'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ClientLedgerTable, type ClientLedgerDisplayRow } from '@/components/client-ledger-table';
import {
  ClientPendingAppointments,
  type ClientPendingAppointment,
} from '@/components/client-pending-appointments';
import { PageShell } from '@/app/components/page-shell';
import { useLiff } from '@/app/components/liff-provider';
import { LiffStatusGate } from '@/components/liff-status-gate';
import { LoadingScreen } from '@/components/loading-screen';
import { useStore } from '@/components/store-provider';
import { buttonVariants } from '@/components/ui/button';
import { CATEGORY_NOTION_STYLE } from '@/lib/category-styles';
import {
  formatClientKey,
  formatClientKeyLabel,
} from '@/lib/ledger-client-display';
import type { DailyTransactionListItem } from '@/lib/reports-server';
import type { TransactionCategory } from '@/lib/transaction-category';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/phone';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { Client } from '@/lib/types/database';

function toDisplayRows(transactions: DailyTransactionListItem[]): ClientLedgerDisplayRow[] {
  return transactions.map((row) => ({
    id: row.id,
    occurredOn: row.occurredOn,
    title: row.title,
    amount: row.amount,
    category: row.category,
    categoryClassName: CATEGORY_NOTION_STYLE[row.category as TransactionCategory],
  }));
}

export default function WalletPage() {
  const { bookBase, apiBase } = useStore();
  const { status, lineUserId } = useLiff();
  const [client, setClient] = useState<Client | null>(null);
  const [transactions, setTransactions] = useState<DailyTransactionListItem[]>([]);
  const [appointments, setAppointments] = useState<ClientPendingAppointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'ready' || !lineUserId) return;

    async function load() {
      setLoading(true);
      const res = await fetch(`${apiBase}/wallet`, {
        headers: {
          'x-line-user-id': lineUserId!,
          'ngrok-skip-browser-warning': 'true',
        },
      });
      const data = (await res.json()) as {
        error?: string;
        client?: Client;
        transactions?: DailyTransactionListItem[];
        appointments?: ClientPendingAppointment[];
      };

      if (!res.ok) {
        setError(data.error ?? '無法載入');
        setLoading(false);
        return;
      }

      setClient(data.client ?? null);
      setTransactions(data.transactions ?? []);
      setAppointments(data.appointments ?? []);
      setLoading(false);
    }

    void load();
  }, [status, lineUserId, apiBase]);

  const rows = useMemo(() => toDisplayRows(transactions), [transactions]);

  if (status !== 'ready' || loading) {
    return (
      <LiffStatusGate>
        <LoadingScreen />
      </LiffStatusGate>
    );
  }

  if (error || !client) {
    return (
      <PageShell title="儲值金與預約紀錄" backHref={bookBase}>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-destructive">無法載入</CardTitle>
            <CardDescription>{error ?? '尚未綁定電話'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`${bookBase}/bind`}
              className={cn(buttonVariants(), 'inline-flex w-full justify-center')}
            >
              前往綁定
            </Link>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const clientLabel = formatClientKeyLabel(client, client.is_vip);
  const clientKey = formatClientKey(client);

  return (
    <PageShell title="儲值金與預約紀錄" backHref={bookBase}>
      <div className="neon-panel mb-5 px-4 py-4">
        <p className="text-sm font-semibold text-foreground">{clientLabel}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          餘額 {formatCurrency(client.balance)}
          {appointments.length > 0 ? ` · ${appointments.length} 筆待結帳預約` : ''}
          {rows.length > 0 ? ` · ${rows.length} 筆消費紀錄` : ''}
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">{clientKey}</p>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">目前預約（未結帳）</h2>
        <ClientPendingAppointments appointments={appointments} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">消費紀錄</h2>
        <ClientLedgerTable
          rows={rows}
          compact
          emptyMessage="尚無消費紀錄"
        />
      </section>

      <Separator className="my-8 bg-border/60" />

      <Link
        href={`${bookBase}/bind?edit=1`}
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'inline-flex h-12 w-full justify-center text-base',
        )}
      >
        修改本名或電話
      </Link>
    </PageShell>
  );
}
