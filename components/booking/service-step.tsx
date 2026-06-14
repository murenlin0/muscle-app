'use client';

import { Clock, Loader2 } from 'lucide-react';
import {
  serviceBadgeClass,
  serviceDisplayMeta,
  serviceDurationLabel,
  servicePriceDisplay,
} from '@/lib/booking-services';
import type { Client, Service } from '@/lib/types/database';
import { cn } from '@/lib/utils';

export function ServiceStep({
  services,
  loading,
  client,
  selectedId,
  onSelect,
}: {
  services: Service[];
  loading: boolean;
  client: Client;
  selectedId: string | null;
  onSelect: (service: Service) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!services.length) {
    return (
      <p className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        目前沒有可預約的服務項目
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">選擇你的療程</h2>
      <div className="space-y-3">
        {services.map((service) => {
          const selected = selectedId === service.id;
          const meta = serviceDisplayMeta(service);
          const prices = servicePriceDisplay(service, client);

          return (
            <button
              key={service.id}
              type="button"
              onClick={() => onSelect(service)}
              className={cn(
                'relative w-full rounded-2xl border p-5 text-left transition-all active:scale-[0.995]',
                selected
                  ? 'border-primary/70 bg-primary/8 ring-1 ring-primary/40'
                  : 'border-border/70 bg-card/40 hover:border-primary/35 hover:bg-card/60',
              )}
            >
              {meta.badge ? (
                <span
                  className={cn(
                    'absolute top-4 right-4 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                    serviceBadgeClass(meta.badge.tone),
                  )}
                >
                  {meta.badge.label}
                </span>
              ) : null}

              <p className="pr-16 text-base font-bold">{meta.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{meta.description}</p>

              <div className="mt-4 flex items-end justify-between gap-4">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="size-4 text-primary/80" />
                  {serviceDurationLabel(service)}
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold tabular-nums text-primary">{prices.cashLabel}</p>
                  {prices.memberLabel ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      會員 {prices.memberLabel}
                    </p>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
