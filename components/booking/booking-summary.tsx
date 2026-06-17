'use client';

import { CalendarDays, Clock, Sparkles } from 'lucide-react';
import {
  serviceDurationLabel,
  servicePriceDisplay,
} from '@/lib/booking-services';
import { ServicePriceLines } from '@/components/booking/service-price-lines';
import type { Client, Service } from '@/lib/types/database';
import { cn } from '@/lib/utils';

function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  empty,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  empty?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Icon className="size-4 shrink-0 text-primary/70" />
        {label}
      </div>
      <span
        className={cn(
          'text-right text-sm font-medium',
          empty ? 'text-muted-foreground/60' : 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function BookingSummary({
  client,
  service,
  startsAt,
}: {
  client: Client;
  service: Service | null;
  startsAt: Date | null;
}) {
  const prices = service ? servicePriceDisplay(service, client) : null;

  return (
    <div className="neon-panel p-4">
      <p className="mb-1 text-sm font-bold tracking-wide text-foreground">預約摘要</p>
      <div className="divide-y divide-primary/10">
        <SummaryRow
          icon={Sparkles}
          label="服務"
          value={service?.name ?? '尚未選擇'}
          empty={!service}
        />
        <SummaryRow
          icon={Clock}
          label="時長"
          value={service ? serviceDurationLabel(service) : '—'}
          empty={!service}
        />
        <SummaryRow
          icon={CalendarDays}
          label="時間"
          value={startsAt ? formatDateTime(startsAt) : '尚未選擇'}
          empty={!startsAt}
        />
      </div>
      <div className="mt-3 border-t border-primary/15 pt-3">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm text-muted-foreground">預估金額</span>
          {prices ? (
            <ServicePriceLines prices={prices} align="right" size="md" />
          ) : (
            <span className="font-mono text-lg font-bold tabular-nums text-primary">—</span>
          )}
        </div>
      </div>
    </div>
  );
}
