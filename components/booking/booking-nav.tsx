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
            'border border-white/25 bg-gradient-to-br from-sky-400/25 via-blue-500/20 to-indigo-500/15',
            'text-white/95 backdrop-blur-md',
            'shadow-[inset_0_1px_0_oklch(1_0_0/0.35),inset_0_-1px_0_oklch(0.5_0.1_252/0.15),0_0_24px_oklch(0.58_0.19_252/0.22)]',
            'transition-all duration-300',
            !nextDisabled &&
              'hover:border-white/40 hover:from-sky-400/35 hover:via-blue-500/28 hover:to-indigo-500/22 hover:shadow-[inset_0_1px_0_oklch(1_0_0/0.45),0_0_32px_oklch(0.58_0.19_252/0.35)]',
            nextDisabled && 'cursor-not-allowed opacity-35 shadow-none',
          )}
        >
          {!nextDisabled ? (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-[neon-scan_4s_ease-in-out_infinite]"
              />
            </>
          ) : null}
          <span className="relative z-10 drop-shadow-sm">{nextLabel}</span>
          <ArrowRight className="relative z-10 size-4 drop-shadow-sm" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}
