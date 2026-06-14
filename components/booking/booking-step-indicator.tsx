'use client';

import { cn } from '@/lib/utils';

const STEPS = ['選服務', '選時間', '確認送出'] as const;

export function BookingStepIndicator({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="mb-8 px-2">
      <div className="flex items-center">
        {STEPS.map((label, index) => {
          const n = (index + 1) as 1 | 2 | 3;
          const active = step === n;
          const done = step > n;
          return (
            <div key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    'flex size-9 items-center justify-center rounded-full text-sm font-bold transition-colors',
                    active && 'bg-primary text-primary-foreground shadow-[0_0_16px_oklch(0.58_0.19_252/0.45)]',
                    done && 'bg-primary/25 text-primary',
                    !active && !done && 'border border-border/80 bg-muted/30 text-muted-foreground',
                  )}
                >
                  {n}
                </span>
                <span
                  className={cn(
                    'hidden text-[10px] font-medium sm:block',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              </div>
              {index < STEPS.length - 1 ? (
                <div
                  className={cn(
                    'mx-1 h-0.5 flex-1 rounded-full',
                    step > n ? 'bg-primary/50' : 'bg-border/60',
                  )}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
