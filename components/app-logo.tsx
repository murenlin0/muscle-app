'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export const LOGO_SRC = '/logo.png';
export const LOGO_URL = 'muscle.com.tw';

const SIZES = {
  sm: {
    mark: 'h-11',
    url: 'mt-2 text-[0.65rem] tracking-[0.26em]',
    rule: 'mt-2 w-10',
  },
  md: {
    mark: 'h-[4.5rem]',
    url: 'mt-2.5 text-[0.7rem] tracking-[0.3em]',
    rule: 'mt-2.5 w-12',
  },
  lg: {
    mark: 'h-[5.75rem]',
    url: 'mt-3 text-sm tracking-[0.34em]',
    rule: 'mt-3 w-14',
  },
} as const;

export function AppLogo({
  size = 'md',
  className,
  priority,
  showUrl = true,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  priority?: boolean;
  showUrl?: boolean;
}) {
  const [missing, setMissing] = useState(false);
  const { mark, url, rule } = SIZES[size];

  if (missing) {
    return showUrl ? (
      <div className={cn('inline-flex flex-col items-center', className)}>
        <span className="font-logo-url text-base font-light tracking-[0.3em] text-white lowercase">
          {LOGO_URL}
        </span>
      </div>
    ) : null;
  }

  return (
    <div className={cn('inline-flex flex-col items-center', className)}>
      <Image
        src={LOGO_SRC}
        alt="筋棧"
        width={400}
        height={150}
        priority={priority}
        className={cn('w-auto object-contain mix-blend-screen', mark)}
        onError={() => setMissing(true)}
      />
      {showUrl ? (
        <>
          <span
            className={cn('h-px bg-gradient-to-r from-transparent via-primary/55 to-transparent', rule)}
            aria-hidden
          />
          <span
            className={cn(
              'font-logo-url font-light lowercase text-white/90',
              url,
            )}
          >
            {LOGO_URL}
          </span>
        </>
      ) : null}
    </div>
  );
}
