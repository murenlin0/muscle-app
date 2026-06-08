'use client';

import Image from 'next/image';
import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { STORE_LIST, type StoreConfig } from '@/lib/stores';
import { cn } from '@/lib/utils';

function StorePreview({
  store,
  className,
}: {
  store: StoreConfig;
  className?: string;
}) {
  return (
    <div className={cn('relative h-full min-h-[420px] overflow-hidden rounded-2xl', className)}>
      <Image
        src={store.galleryImage}
        alt={store.name}
        fill
        className="object-cover transition-opacity duration-500"
        sizes="(max-width: 768px) 100vw, 60vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
      <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
        <p className="text-sm text-white/70">{store.area}</p>
        <h3 className="mt-1 text-2xl font-bold text-white md:text-3xl">{store.name}</h3>
        {store.comingSoon ? (
          <p className="mt-3 text-sm text-white/60">敬請期待</p>
        ) : (
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={store.lineOfficialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-white px-6 py-3 text-sm font-bold text-black transition-opacity hover:bg-white/90"
            >
              我要預約
            </a>
            <a
              href={store.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              <MapPin className="size-4" />
              位置
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function StoreShowcase() {
  const [active, setActive] = useState<StoreConfig>(STORE_LIST[0]);

  return (
    <section id="stores" className="relative scroll-mt-4 bg-background py-16 md:py-24">
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">
        {STORE_LIST.map((store) => (
          <Image
            key={store.slug}
            src={store.thumbnailImage}
            alt=""
            fill
            className={cn(
              'object-cover blur-2xl transition-opacity duration-700',
              active.slug === store.slug ? 'opacity-40' : 'opacity-0',
            )}
            aria-hidden
          />
        ))}
      </div>

      <div className="relative mx-auto max-w-6xl px-5">
        <div className="mb-10 text-center md:text-left">
          <p className="text-sm font-semibold tracking-widest text-primary">LOCATIONS</p>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">選擇分店</h2>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.4fr_0.6fr]">
          <StorePreview store={active} className="hidden md:block" />
          <StorePreview store={active} className="md:hidden" />

          <div className="flex flex-col gap-3">
            {STORE_LIST.map((store) => (
              <button
                key={store.slug}
                type="button"
                onMouseEnter={() => setActive(store)}
                onFocus={() => setActive(store)}
                onClick={() => setActive(store)}
                className={cn(
                  'group relative overflow-hidden rounded-xl border p-4 text-left transition-all',
                  active.slug === store.slug
                    ? 'border-primary/50 bg-card/80 shadow-lg shadow-primary/10'
                    : 'border-border/60 bg-card/40 hover:border-primary/30',
                )}
              >
                <div className="relative z-10 flex items-center gap-4">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-lg">
                    <Image
                      src={store.thumbnailImage}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{store.name}</p>
                    <p className="text-sm text-muted-foreground">{store.area}</p>
                    {store.comingSoon ? (
                      <p className="mt-1 text-xs text-muted-foreground">敬請期待</p>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
