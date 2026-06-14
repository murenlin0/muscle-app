'use client';

import { cn } from '@/lib/utils';

const STEPS = ['選服務', '選時間', '確認送出'] as const;

export function BookingStepIndicator({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="mb-8 px-1">
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
                    'flex size-9 items-center justify-center rounded-full text-sm font-bold transition-all duration-200',
                    active &&
                      'border-2 border-primary bg-transparent text-primary shadow-[0_0_14px_oklch(0.58_0.19_252/0.35)]',
                    done && 'border border-primary/55 bg-primary/12 text-primary',
                    !active &&
                      !done &&
                      'border border-transparent bg-muted/55 text-muted-foreground/75',
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
                    'mx-1.5 h-px flex-1',
                    step > n ? 'bg-primary/45' : 'bg-border/70',
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
