'use client';

import { Suspense } from 'react';
import { BookingFlow } from '@/components/booking/booking-flow';
import { LiffStatusGate } from '@/components/liff-status-gate';
import { LoadingScreen } from '@/components/loading-screen';

export default function BookingPage() {
  return (
    <LiffStatusGate>
      <Suspense fallback={<LoadingScreen />}>
        <BookingFlow />
      </Suspense>
    </LiffStatusGate>
  );
}
