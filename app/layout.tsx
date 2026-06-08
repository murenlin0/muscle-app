import type { Metadata } from 'next';
import { Geist_Mono, Josefin_Sans, Noto_Sans_TC } from 'next/font/google';
import './globals.css';

const notoSansTC = Noto_Sans_TC({
  variable: '--font-noto-tc',
  weight: ['500', '600', '700', '800', '900'],
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const josefinSans = Josefin_Sans({
  variable: '--font-josefin',
  weight: ['300', '400'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '筋棧｜專業運動按摩',
  description: '筋棧 The Muscle Inn — 專業運動按摩、肌骨平衡',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${notoSansTC.variable} ${geistMono.variable} ${josefinSans.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
