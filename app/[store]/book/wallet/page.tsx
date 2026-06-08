'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageShell } from '@/app/components/page-shell';
import { useLiff } from '@/app/components/liff-provider';
import { LiffStatusGate } from '@/components/liff-status-gate';
import { LoadingScreen } from '@/components/loading-screen';
import { useStore } from '@/components/store-provider';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/phone';
import type { Client, LedgerRecord } from '@/lib/types/database';

export default function WalletPage() {
  const { bookBase, apiBase } = useStore();
  const { status, lineUserId } = useLiff();
  const [client, setClient] = useState<Client | null>(null);
  const [ledger, setLedger] = useState<LedgerRecord[]>([]);
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
        ledger?: LedgerRecord[];
      };

      if (!res.ok) {
        setError(data.error ?? '無法載入');
        setLoading(false);
        return;
      }

      setClient(data.client ?? null);
      setLedger(data.ledger ?? []);
      setLoading(false);
    }

    load();
  }, [status, lineUserId, apiBase]);

  if (status !== 'ready' || loading) {
    return (
      <LiffStatusGate>
        <LoadingScreen />
      </LiffStatusGate>
    );
  }

  if (error || !client) {
    return (
      <PageShell title="儲值金" backHref={bookBase}>
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

  return (
    <PageShell title="儲值金" subtitle={client.name} backHref={bookBase}>
      <div className="glow-balance">
        <div className="pointer-events-none absolute -right-8 -top-8 size-36 rounded-full bg-accent/15 blur-3xl" />
        <CardHeader className="relative">
          <div className="flex items-center justify-between gap-2">
            <CardDescription className="text-base text-foreground/70">目前可用餘額</CardDescription>
            {client.is_vip ? (
              <Badge className="border-primary-foreground/20 bg-primary/20 text-primary-foreground">
                VIP
              </Badge>
            ) : null}
          </div>
          <CardTitle className="neon-text font-mono text-5xl font-bold tracking-tight text-foreground">
            {formatCurrency(client.balance)}
          </CardTitle>
          {client.initial_balance > 0 && ledger.length === 0 ? (
            <CardDescription className="text-foreground/60">
              含期初匯入 {formatCurrency(client.initial_balance)}
            </CardDescription>
          ) : null}
        </CardHeader>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-base font-bold text-foreground">交易紀錄</h2>
        {ledger.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-8 text-center text-base text-muted-foreground">
              尚無流水紀錄
              <br />
              Calendar 同步後會顯示儲值與扣款
            </CardContent>
          </Card>
        ) : (
          <Card className="glass-card divide-y divide-border/60 overflow-hidden p-0">
            {ledger.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-semibold">{row.type_label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {new Date(row.occurred_at).toLocaleString('zh-TW')}
                  </p>
                </div>
                <span
                  className={cn(
                    'font-mono text-lg font-bold',
                    row.signed_amount >= 0 ? 'text-accent' : 'text-destructive',
                  )}
                >
                  {row.signed_amount >= 0 ? '+' : ''}
                  {row.signed_amount.toLocaleString('zh-TW')}
                </span>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Separator className="my-8 bg-border/60" />

      <Link
        href={`${bookBase}/bind?edit=1`}
        className={cn(buttonVariants({ variant: 'outline' }), 'inline-flex h-12 w-full justify-center text-base')}
      >
        修改本名或電話
      </Link>
    </PageShell>
  );
}
