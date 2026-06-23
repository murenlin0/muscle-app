'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BindSubmitButton({
  children,
  loading,
  className,
  disabled,
  tone = 'default',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  tone?: 'default' | 'line';
}) {
  const isDisabled = disabled || loading;
  const isLine = tone === 'line';

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={cn(
        'group relative isolate h-14 w-full overflow-hidden rounded-lg backdrop-blur-sm',
        'text-base font-bold tracking-[0.1em]',
        'transition-[transform,opacity] duration-200',
        'active:scale-[0.98]',
        'disabled:pointer-events-none disabled:animate-none disabled:opacity-40',
        isLine
          ? cn(
              'border border-emerald-400/55 bg-emerald-500/15 text-emerald-50',
              'shadow-[0_0_20px_oklch(0.62_0.17_155/0.28)]',
              !isDisabled && 'hover:border-emerald-300 hover:bg-emerald-500/22',
            )
          : cn(
              'border border-primary/45 bg-background/70 text-foreground neon-text',
              !isDisabled && 'animate-[neon-pulse_3.2s_ease-in-out_infinite] hover:border-neon',
            ),
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent',
          isLine ? 'from-emerald-500/22 via-emerald-400/8' : 'from-primary/10 via-accent/5',
        )}
        aria-hidden
      />
      {!isLine ? (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-accent/15 opacity-0 blur-sm transition-opacity duration-300 group-hover:animate-[neon-scan_2s_linear_infinite] group-hover:opacity-100"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          'pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent to-transparent',
          isLine ? 'via-emerald-400/55' : 'via-primary/50',
        )}
        aria-hidden
      />
      <span
        className={cn(
          'pointer-events-none absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent to-transparent',
          isLine ? 'via-emerald-400/35' : 'via-accent/35',
        )}
        aria-hidden
      />
      <span className="relative z-10 flex items-center justify-center gap-3">
        {loading ? <Loader2 className="size-5 animate-spin" strokeWidth={2.5} /> : null}
        <span>{children}</span>
      </span>
    </button>
  );
}
