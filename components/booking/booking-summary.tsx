'use client';

import { CalendarDays, Clock, Sparkles, UserRound } from 'lucide-react';
import { BOOKING_STAFF_UNASSIGNED } from '@/lib/booking-draft';
import {
  serviceDisplayMeta,
  serviceDurationLabel,
  servicePriceDisplay,
} from '@/lib/booking-services';

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
  staffName,
  startsAt,
}: {
  client: Client;
  service: Service | null;
  staffName: string;
  startsAt: Date | null;
}) {
  const meta = service ? serviceDisplayMeta(service) : null;
  const prices = service ? servicePriceDisplay(service, client) : null;

  return (
    <div className="rounded-2xl border border-border/70 bg-card/50 p-4 backdrop-blur-sm">
      <p className="mb-1 text-sm font-bold tracking-wide text-foreground">預約摘要</p>
      <div className="divide-y divide-border/50">
        <SummaryRow
          icon={Sparkles}
          label="療程"
          value={meta?.title ?? '尚未選擇'}
          empty={!service}
        />
        <SummaryRow
          icon={Clock}
          label="時長"
          value={service ? serviceDurationLabel(service) : '—'}
          empty={!service}
        />
        <SummaryRow
          icon={UserRound}
          label="師傅"
          value={staffName === BOOKING_STAFF_UNASSIGNED ? '尚未選擇' : staffName}
          empty={staffName === BOOKING_STAFF_UNASSIGNED}
        />
        <SummaryRow
          icon={CalendarDays}
          label="時間"
          value={startsAt ? formatDateTime(startsAt) : '尚未選擇'}
          empty={!startsAt}
        />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
        <span className="text-sm text-muted-foreground">預估金額</span>
        <span className="text-lg font-bold tabular-nums text-primary">
          {prices?.estimatedLabel ?? '—'}
        </span>
      </div>
      {prices?.memberLabel && !prices.highlightMember ? (
        <p className="mt-1 text-right text-xs text-muted-foreground">
          會員價 {prices.memberLabel}
        </p>
      ) : null}
    </div>
  );
}

import type { Client, Service } from '@/lib/types/database';
import { cn } from '@/lib/utils';