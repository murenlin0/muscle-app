import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ActionCard({
  href,
  icon: Icon,
  title,
  description,
  monoHint,
  tone = 'blue',
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  monoHint?: string;
  tone?: 'blue' | 'wallet';
}) {
  return (
    <Link href={href} className="group block active:scale-[0.995] transition-transform">
      <div className="neon-outline-card relative p-5">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl border transition-colors duration-300',
              tone === 'blue'
                ? 'border-primary/30 bg-primary/8 text-primary/90 group-hover:border-primary/45 group-hover:bg-primary/12 group-hover:shadow-[0_0_14px_oklch(0.58_0.19_252/0.12)]'
                : 'border-amber-400/35 bg-amber-400/8 text-amber-400/90 group-hover:border-amber-400/50 group-hover:bg-amber-400/12 group-hover:shadow-[0_0_14px_oklch(0.82_0.16_85/0.12)]',
            )}
          >
            <Icon className="size-5" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-lg font-bold tracking-tight transition-colors group-hover:text-primary/90">
              {title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground transition-colors group-hover:text-foreground/75">
              {description}
            </p>
          </div>
          <span
            className={cn(
              'font-mono text-sm transition-all duration-300',
              tone === 'blue'
                ? 'text-primary/30 group-hover:text-primary/70'
                : 'text-amber-400/35 group-hover:text-amber-400/75',
            )}
          >
            →
          </span>
        </div>
        {monoHint ? (
          <p
            className={cn(
              'mt-4 text-right font-mono text-sm font-semibold tabular-nums transition-colors',
              tone === 'blue'
                ? 'text-primary/70 group-hover:text-primary/90'
                : 'text-amber-400/70 group-hover:text-amber-400/90',
            )}
          >
            {monoHint}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
