'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BindSubmitButton({
  children,
  loading,
  className,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={cn(
        'group relative isolate h-14 w-full overflow-hidden rounded-lg',
        'border border-primary/45 bg-background/70 backdrop-blur-sm',
        'text-base font-bold tracking-[0.1em] text-foreground neon-text',
        'transition-[transform,opacity] duration-200',
        !isDisabled && 'animate-[neon-pulse_3.2s_ease-in-out_infinite]',
        'hover:border-neon active:scale-[0.98]',
        'disabled:pointer-events-none disabled:animate-none disabled:opacity-40',
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/10 via-accent/5 to-transparent"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-accent/15 opacity-0 blur-sm transition-opacity duration-300 group-hover:animate-[neon-scan_2s_linear_infinite] group-hover:opacity-100"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/35 to-transparent"
        aria-hidden
      />
      <span className="relative z-10 flex items-center justify-center gap-3">
        {loading ? <Loader2 className="size-5 animate-spin" strokeWidth={2.5} /> : null}
        <span>{children}</span>
      </span>
    </button>
  );
}
