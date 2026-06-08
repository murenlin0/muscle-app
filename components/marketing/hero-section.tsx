'use client';

import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import { AppLogo } from '@/components/app-logo';
import { STORE_LIST } from '@/lib/stores';

const DEFAULT_HERO = STORE_LIST.find((s) => s.bookingEnabled)?.heroImage ?? '/stores/store1/hero.jpg';

export function HeroSection() {
  function scrollToStores() {
    document.getElementById('stores')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <section className="relative min-h-svh w-full overflow-hidden">
      <Image
        src={DEFAULT_HERO}
        alt="筋棧店內環境"
        fill
        priority
        className="object-cover"
        sizes="100vw"
        onError={(e) => {
          const img = e.target as HTMLImageElement;
          img.style.display = 'none';
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-background" />

      <div className="relative z-10 flex min-h-svh flex-col">
        <header className="flex justify-center px-6 pt-10">
          <AppLogo size="lg" priority />
        </header>

        <div className="flex flex-1 flex-col items-center justify-end px-6 pb-16 text-center">
          <p className="mb-3 font-logo-url text-sm tracking-[0.35em] text-white/80 uppercase">
            The Muscle Inn
          </p>
          <h1 className="max-w-lg text-4xl font-bold leading-tight text-white md:text-5xl">
            專業運動按摩
          </h1>
          <p className="mt-4 max-w-md text-base text-white/75">
            針對性的深層肌肉放鬆，找回身體平衡
          </p>

          <button
            type="button"
            onClick={scrollToStores}
            className="mt-10 rounded-full border border-white/25 bg-white/15 px-10 py-4 text-base font-bold tracking-wide text-white backdrop-blur-md transition-all hover:border-white/40 hover:bg-white/25"
          >
            立即預約
          </button>

          <button
            type="button"
            onClick={scrollToStores}
            className="mt-12 flex flex-col items-center gap-1 text-white/50 transition-colors hover:text-white/80"
            aria-label="往下滑動選擇分店"
          >
            <span className="text-xs tracking-widest">選擇分店</span>
            <ChevronDown className="size-5 animate-bounce" />
          </button>
        </div>
      </div>
    </section>
  );
}
