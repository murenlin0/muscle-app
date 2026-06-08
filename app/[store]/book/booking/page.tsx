'use client';

import { PageShell } from '@/app/components/page-shell';
import { useStore } from '@/components/store-provider';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function BookingPage() {
  const { bookBase } = useStore();

  return (
    <PageShell title="預約" subtitle="Phase 2 開發中" backHref={bookBase}>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-xl font-bold">預約流程</CardTitle>
          <CardDescription className="text-base">即將推出完整預約體驗</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-base text-muted-foreground">
          <p>Step 1 — 選擇服務（30 / 60 / 90 / 120 分鐘）</p>
          <p>Step 2 — 日曆選時（3 日 / 週 / 月視圖）</p>
          <p>Step 3 — 確認資料並送出 LINE 預約訊息</p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
