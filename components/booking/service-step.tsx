'use client';

import { Clock, Loader2 } from 'lucide-react';
import {
  serviceBadge,
  serviceBadgeClass,
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
      <p className="neon-panel px-4 py-8 text-center text-sm text-muted-foreground">
        目前沒有可預約的服務項目
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">選擇服務</h2>
      <div className="space-y-3">
        {services.map((service) => {
          const selected = selectedId === service.id;
          const prices = servicePriceDisplay(service, client);
          const badge = serviceBadge(service);
          const mainPrice =
            prices.highlightMember && prices.memberLabel
              ? prices.memberLabel
              : prices.cashLabel;

          return (
            <button
              key={service.id}
              type="button"
              onClick={() => onSelect(service)}
              className={cn(
                'neon-outline-card relative w-full p-4 text-left active:scale-[0.995]',
                selected && 'neon-outline-card-selected',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold">{service.name}</p>
                  <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="size-4 shrink-0 text-primary/60" />
                    {serviceDurationLabel(service)}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end">
                  {badge ? (
                    <span
                      className={cn(
                        'mb-2 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                        serviceBadgeClass(badge.tone),
                      )}
                    >
                      {badge.label}
                    </span>
                  ) : null}
                  <p className="font-mono text-base font-semibold tabular-nums text-primary/85">
                    {mainPrice}
                  </p>
                  {prices.memberLabel && !prices.highlightMember ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      會員 {prices.memberLabel}
                    </p>
                  ) : prices.highlightMember ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      單次 {prices.cashLabel}
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
