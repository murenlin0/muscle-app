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
  tone?: 'blue' | 'muted';
}) {
  return (
    <Link href={href} className="group block active:scale-[0.995] transition-transform">
      <div
        className={cn(
          'neon-outline-card relative p-5',
          tone === 'muted' && 'border-primary/30 hover:border-primary/55',
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200',
              tone === 'blue'
                ? 'border-primary/50 bg-primary/10 text-primary group-hover:border-primary group-hover:bg-primary/15'
                : 'border-primary/25 bg-muted/30 text-muted-foreground group-hover:border-primary/45 group-hover:text-primary',
            )}
          >
            <Icon className="size-5" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-lg font-bold tracking-tight transition-colors group-hover:text-primary">
              {title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground transition-colors group-hover:text-foreground/80">
              {description}
            </p>
          </div>
          <span className="font-mono text-sm text-primary/35 transition-all duration-200 group-hover:text-primary group-hover:drop-shadow-[0_0_8px_oklch(0.58_0.19_252/0.45)]">
            →
          </span>
        </div>
        {monoHint ? (
          <p className="mt-4 font-mono text-sm font-semibold tabular-nums text-primary/80 transition-colors group-hover:text-primary">
            {monoHint}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
