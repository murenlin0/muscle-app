'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CalendarDays, Wallet } from 'lucide-react';
import { PageShell } from '@/app/components/page-shell';
import { useLiff } from '@/app/components/liff-provider';
import { ActionCard } from '@/components/action-card';
import { LoadingScreen } from '@/components/loading-screen';
import { useStore } from '@/components/store-provider';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
export default function BookHomePage() {
  const router = useRouter();
  const { bookBase } = useStore();
  const { status, error, loadingMessage, client, displayName } = useLiff();

  const needsBind = status === 'ready' && !client;

  useEffect(() => {
    if (needsBind) {
      router.replace(`${bookBase}/bind`);
    }
  }, [needsBind, router, bookBase]);

  if (status === 'loading') {
    return <LoadingScreen message={loadingMessage} />;
  }

  if (needsBind) {
    return <LoadingScreen message="前往綁定頁面…" />;
  }

  if (!client) {
    return <LoadingScreen message="載入中…" />;
  }

  if (status === 'error') {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <Card className="glass-card max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-xl text-destructive">無法啟動</CardTitle>
            <CardDescription className="text-base">{error}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-svh">
      <div className="liff-content flex min-h-svh flex-col py-10">
        <header className="mb-8 text-center">
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            <h1 className="text-[2rem] font-bold leading-tight tracking-tight">
              {client.name || displayName || '會員'}
            </h1>
            {client.is_vip ? (
              <Badge variant="outline" className="border-primary/50 text-primary">
                VIP
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-base text-muted-foreground">請選擇要進行的服務</p>
        </header>

        <div className="flex flex-1 flex-col justify-center gap-4">
          <ActionCard
            href={`${bookBase}/booking`}
            icon={CalendarDays}
            title="預約"
            description="選擇服務與時段"
            tone="blue"
          />
          <ActionCard
            href={`${bookBase}/wallet`}
            icon={Wallet}
            title="儲值與交易紀錄"
            description="查看儲值、扣款與交易明細"
            tone="wallet"
          />
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">LINE 會員服務</p>
      </div>
    </main>
  );
}
