'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function BookingNav({
  onBack,
  onNext,
  nextLabel = '下一步',
  nextDisabled,
  showBack = true,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      {showBack && onBack ? (
        <Button
          type="button"
          variant="ghost"
          className="h-11 px-2 text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="mr-1 size-4" />
          上一步
        </Button>
      ) : (
        <span />
      )}
      {onNext ? (
        <button
          type="button"
          disabled={nextDisabled}
          onClick={onNext}
          className={cn(
            'relative inline-flex h-12 min-w-[9.5rem] shrink-0 items-center justify-center gap-2 overflow-hidden rounded-xl px-7 text-sm font-semibold tracking-wide',
            'border border-sky-400/50 bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 text-white',
            'shadow-[0_0_0_1px_oklch(0.72_0.14_230/0.35),0_0_28px_oklch(0.55_0.2_252/0.45),inset_0_1px_0_oklch(1_0_0/0.2)]',
            'transition-all duration-300',
            !nextDisabled &&
              'hover:border-sky-300/70 hover:shadow-[0_0_0_1px_oklch(0.78_0.12_230/0.5),0_0_40px_oklch(0.55_0.2_252/0.65),inset_0_1px_0_oklch(1_0_0/0.28)] hover:brightness-110',
            nextDisabled && 'cursor-not-allowed opacity-40 shadow-none',
          )}
        >
          {!nextDisabled ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[neon-scan_3s_ease-in-out_infinite]"
            />
          ) : null}
          <span className="relative z-10">{nextLabel}</span>
          <ArrowRight className="relative z-10 size-4" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}
