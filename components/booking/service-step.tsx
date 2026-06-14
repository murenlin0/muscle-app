'use client';

import { Check, Clock, Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
      <p className="rounded-lg border border-border/60 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        目前沒有可預約的服務項目
      </p>
    );
  }

  const showMemberHint = client.is_vip || client.balance > 0;

  return (
    <div className="space-y-4">
      {showMemberHint ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent/8 px-4 py-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            {client.is_vip ? 'VIP 會員' : '您有儲值餘額'}，現場結帳時可選擇以
            <span className="text-foreground"> 會員價 </span>
            從儲值金扣款。
          </p>
        </div>
      ) : null}

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
                'group relative w-full overflow-hidden rounded-2xl border-2 text-left transition-all active:scale-[0.99]',
                selected
                  ? 'border-primary bg-primary/10 shadow-[0_0_24px_oklch(0.58_0.19_252/0.25)]'
                  : 'border-border/70 bg-card/40 hover:border-primary/40 hover:bg-card/70',
              )}
            >
              <div className="flex items-stretch gap-0">
                <div
                  className={cn(
                    'flex w-[5.5rem] shrink-0 flex-col items-center justify-center border-r px-2 py-5',
                    selected ? 'border-primary/25 bg-primary/10' : 'border-border/50 bg-muted/20',
                  )}
                >
                  <span
                    className={cn(
                      'text-3xl font-bold leading-none tracking-tight',
                      selected ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {service.duration_minutes}
                  </span>
                  <span className="mt-1 text-xs font-medium text-muted-foreground">分鐘</span>
                </div>

                <div className="min-w-0 flex-1 p-4 pr-12">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-bold">{service.name}</p>
                    <Badge variant="outline" className="border-border/60 text-[10px] text-muted-foreground">
                      <Clock className="mr-1 size-3" />
                      {serviceDurationLabel(service)}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">單次</p>
                      <p className="text-lg font-semibold tabular-nums">{prices.cashLabel}</p>
                    </div>
                    {prices.memberLabel ? (
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">會員</p>
                        <p
                          className={cn(
                            'text-lg font-semibold tabular-nums',
                            prices.highlightMember ? 'text-accent' : 'text-foreground/80',
                          )}
                        >
                          {prices.memberLabel}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {prices.footnote ? (
                    <p className="mt-2 text-xs text-muted-foreground">{prices.footnote}</p>
                  ) : null}
                </div>
              </div>

              <span
                className={cn(
                  'absolute top-4 right-4 flex size-6 items-center justify-center rounded-full border-2 transition-all',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/60 bg-background/50 text-transparent group-hover:border-primary/40',
                )}
              >
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">點選服務後將自動進入選時間</p>
    </div>
  );
}
