'use client';

import { useLiff } from '@/app/components/liff-provider';
import { LoadingScreen } from '@/components/loading-screen';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function LiffStatusGate({ children }: { children: React.ReactNode }) {
  const { status, error, loadingMessage } = useLiff();

  if (status === 'loading') {
    return <LoadingScreen message={loadingMessage} />;
  }

  if (status === 'error') {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <Card className="glass-card max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-xl text-destructive">無法啟動</CardTitle>
            <CardDescription className="text-base whitespace-pre-wrap">{error}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return <>{children}</>;
}
