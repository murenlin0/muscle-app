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
          className={cn(
            'neon-future-btn inline-flex h-12 min-w-[8.5rem] items-center justify-center gap-1.5 px-7 text-sm',
            nextDisabled && 'cursor-not-allowed',
          )}
          onClick={onNext}
        >
          <span className="relative z-10">{nextLabel}</span>
          <ArrowRight className="relative z-10 size-4" />
        </button>
      ) : null}
    </div>
  );
}
