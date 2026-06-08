import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function AdminHubCard({
  href,
  icon: Icon,
  title,
  description,
  external,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="group block"
    >
      <div className="glass-card-interactive h-full p-0">
        <CardHeader className="flex-row items-start gap-4 space-y-0 p-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/25">
            <Icon className="size-6" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription className="mt-1.5 text-sm leading-relaxed">
              {description}
            </CardDescription>
          </div>
          <span
            className={cn(
              'mt-1 shrink-0 text-sm text-muted-foreground transition-colors',
              'group-hover:text-primary',
            )}
          >
            →
          </span>
        </CardHeader>
      </div>
    </Link>
  );
}
