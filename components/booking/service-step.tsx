'use client';

import { Clock, Loader2 } from 'lucide-react';
import {
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
      <h2 className="text-lg font-bold">選擇服務</h2>
      <div className="space-y-3">
        {services.map((service) => {
          const selected = selectedId === service.id;
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
              <p className="text-base font-bold">{service.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                單次 {prices.cashLabel}
                {prices.memberLabel ? ` · 會員 ${prices.memberLabel}` : ''}
              </p>

              <div className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="size-4 text-primary/80" />
                {serviceDurationLabel(service)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
