import type { NextConfig } from "next";

const ngrokHost = process.env.NGROK_HOST?.trim();

const noStoreHeaders = [
  { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
  { key: 'Pragma', value: 'no-cache' },
];

const nextConfig: NextConfig = {
  // ngrok 轉發時 Next.js dev 需要允許該 host，否則 LIFF 內可能卡住
  ...(ngrokHost ? { allowedDevOrigins: [ngrokHost] } : {}),
  async headers() {
    return [
      { source: '/api/portal/:path*', headers: noStoreHeaders },
      { source: '/admin/:path*', headers: noStoreHeaders },
      { source: '/manager/:path*', headers: noStoreHeaders },
      { source: '/:store/admin/:path*', headers: noStoreHeaders },
      { source: '/login', headers: noStoreHeaders },
      { source: '/:store/book', headers: noStoreHeaders },
      { source: '/:store/book/:path*', headers: noStoreHeaders },
    ];
  },
  async redirects() {
    return [
      { source: '/bind', destination: '/store1/book/bind', permanent: false },
      { source: '/wallet', destination: '/store1/book/wallet', permanent: false },
      { source: '/booking', destination: '/store1/book/booking', permanent: false },
      // 舊 /admin/import 捷徑直接轉到 manager
      { source: '/admin/import', destination: '/manager/store1/import', permanent: false },
      {
        source: '/:store/book/admin/import',
        destination: '/manager/:store/import',
        permanent: false,
      },
      { source: '/staff/login', destination: '/login', permanent: false },
      { source: '/:store/staff/login', destination: '/login', permanent: false },
      { source: '/:store/admin/login', destination: '/login', permanent: false },
      // 舊 /storeN/admin/* 書籤永久轉往新 /manager 路由
      { source: '/:store/admin/reports', destination: '/manager/:store/reports', permanent: true },
      { source: '/:store/admin/team', destination: '/manager/:store/team', permanent: true },
      { source: '/:store/admin/clients', destination: '/manager/:store/clients', permanent: true },
      { source: '/:store/admin/import', destination: '/manager/:store/import', permanent: true },
      { source: '/:store/admin', destination: '/manager/:store', permanent: true },
    ];
  },
};

export default nextConfig;
