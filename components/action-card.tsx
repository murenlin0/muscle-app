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
  /** 卡片左下角等寬字提示（如餘額） */
  monoHint?: string;
  tone?: 'blue' | 'wallet';
}) {
  return (
    <Link href={href} className="group block active:scale-[0.995] transition-transform">
      <div className="neon-outline-card relative p-5">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-xl border-2 transition-colors duration-200',
              tone === 'blue'
                ? 'border-primary/70 bg-primary/15 text-primary group-hover:border-primary group-hover:bg-primary/20 group-hover:shadow-[0_0_16px_oklch(0.58_0.19_252/0.35)]'
                : 'border-amber-400/70 bg-amber-400/15 text-amber-400 group-hover:border-amber-300 group-hover:bg-amber-400/22 group-hover:shadow-[0_0_16px_oklch(0.82_0.16_85/0.35)]',
            )}
          >
            <Icon className="size-6" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-lg font-bold tracking-tight transition-colors group-hover:text-primary">
              {title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground transition-colors group-hover:text-foreground/80">
              {description}
            </p>
          </div>
          <span
            className={cn(
              'font-mono text-sm transition-all duration-200',
              tone === 'blue'
                ? 'text-primary/50 group-hover:text-primary group-hover:drop-shadow-[0_0_8px_oklch(0.58_0.19_252/0.45)]'
                : 'text-amber-400/50 group-hover:text-amber-300 group-hover:drop-shadow-[0_0_8px_oklch(0.82_0.16_85/0.45)]',
            )}
          >
            →
          </span>
        </div>
        {monoHint ? (
          <p
            className={cn(
              'mt-4 font-mono text-sm font-semibold tabular-nums transition-colors',
              tone === 'blue'
                ? 'text-primary/90 group-hover:text-primary'
                : 'text-amber-400/90 group-hover:text-amber-300',
            )}
          >
            {monoHint}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
