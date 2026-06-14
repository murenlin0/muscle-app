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
        <Button
          type="button"
          disabled={nextDisabled}
          className={cn(
            'h-11 rounded-xl px-6 font-semibold',
            nextDisabled && 'opacity-40',
          )}
          onClick={onNext}
        >
          {nextLabel}
          <ArrowRight className="ml-1 size-4" />
        </Button>
      ) : null}
    </div>
  );
}
