'use client';

import Link from 'next/link';
import { Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/components/store-provider';

export function BookingHero() {
  const { bookBase, store } = useStore();

  return (
    <header className="mb-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <Link href={bookBase} className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30">
            <Activity className="size-5 text-primary" strokeWidth={2.25} />
          </span>
          <div>
            <p className="text-base font-bold leading-tight">筋棧 · {store.name}</p>
            <Badge variant="outline" className="mt-1 border-primary/40 bg-primary/10 text-[10px] text-primary">
              線上即時預約
            </Badge>
          </div>
        </Link>
      </div>
      <h1 className="text-xl font-bold leading-snug tracking-tight">
        專業運動按摩，讓身體回到最佳狀態
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        深層組織、運動恢復與傷害修復，依您的狀況調整。線上三步驟完成預約，無須電話確認。
      </p>
    </header>
  );
}
