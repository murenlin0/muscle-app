import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '店內系統 · 筋棧',
  description: '師傅貼上 LINE 預約訊息，建立日曆與預約紀錄',
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return children;
}
