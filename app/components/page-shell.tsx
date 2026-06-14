import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { AppLogo } from '@/components/app-logo';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function PageShell({
  title,
  subtitle,
  backHref = '/',
  compact = false,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-svh">
      <div className={cn('liff-content', compact ? 'py-4' : 'py-8')}>
        <div className={cn('relative flex items-center justify-center', compact ? 'mb-3' : 'mb-8')}>
          <Link
            href={backHref}
            aria-label="返回"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'absolute left-0 top-1/2 -translate-y-1/2',
            )}
          >
            <ChevronLeft className="size-6" strokeWidth={2.25} />
          </Link>
          <AppLogo size={compact ? 'sm' : 'md'} />
        </div>
        <div className={cn('text-center', compact ? 'mb-3' : 'mb-8')}>
          <h1 className={cn('font-bold tracking-tight', compact ? 'text-base' : 'text-2xl')}>
            {title}
          </h1>
          {subtitle ? (
            <p className={cn('text-muted-foreground', compact ? 'mt-1 text-sm' : 'mt-2 text-base')}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </main>
  );
}
