import type { ServicePriceDisplay } from '@/lib/booking-services';
import { cn } from '@/lib/utils';

export function ServicePriceLines({
  prices,
  align = 'left',
  size = 'sm',
}: {
  prices: ServicePriceDisplay;
  align?: 'left' | 'right';
  size?: 'sm' | 'md';
}) {
  const main =
    prices.highlightMember && prices.memberLabel
      ? prices.memberLabel
      : prices.cashLabel;

  return (
    <div className={cn(align === 'right' && 'text-right')}>
      <p
        className={cn(
          'font-mono font-semibold tabular-nums text-primary/90',
          size === 'md' ? 'text-lg' : 'text-sm',
        )}
      >
        {main}
        {prices.highlightMember ? (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">會員價</span>
        ) : (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">單次</span>
        )}
      </p>
      {prices.memberLabel ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {prices.highlightMember ? (
            <>單次 {prices.cashLabel}</>
          ) : (
            <>會員 {prices.memberLabel}</>
          )}
        </p>
      ) : null}
    </div>
  );
}
