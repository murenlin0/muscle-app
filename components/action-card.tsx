import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function ActionCard({
  href,
  icon: Icon,
  title,
  description,
  tone = 'blue',
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: 'blue' | 'muted';
}) {
  return (
    <Link href={href} className="group block active:scale-[0.99] transition-transform">
      <div className="glass-card-interactive relative overflow-hidden p-0">
        <div className="pointer-events-none absolute -right-6 -top-6 size-32 rounded-full bg-accent/12 blur-3xl transition-all group-hover:bg-primary/18" />
        <CardHeader className="relative flex-row items-center gap-5 space-y-0 p-5">
          <div
            className={cn(
              'flex size-14 shrink-0 items-center justify-center rounded-xl',
              tone === 'blue'
                ? 'bg-primary text-primary-foreground shadow-[0_0_20px_oklch(0.62_0.21_252/0.45)]'
                : 'bg-secondary text-accent ring-1 ring-primary/25 shadow-[0_0_14px_oklch(0.55_0.12_285/0.12)]',
            )}
          >
            <Icon className="size-7" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <CardTitle className="text-xl font-bold tracking-tight">{title}</CardTitle>
            <CardDescription className="mt-1 text-base text-muted-foreground">
              {description}
            </CardDescription>
          </div>
          <span className="font-mono text-sm text-primary/40 transition-all group-hover:text-accent group-hover:drop-shadow-[0_0_6px_oklch(0.55_0.12_285/0.5)]">
            →
          </span>
        </CardHeader>
      </div>
    </Link>
  );
}
