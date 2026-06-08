import type { NextConfig } from "next";

const ngrokHost = process.env.NGROK_HOST?.trim();

const nextConfig: NextConfig = {
  // ngrok 轉發時 Next.js dev 需要允許該 host，否則 LIFF 內可能卡住
  ...(ngrokHost ? { allowedDevOrigins: [ngrokHost] } : {}),
  async redirects() {
    return [
      { source: '/bind', destination: '/store1/book/bind', permanent: false },
      { source: '/wallet', destination: '/store1/book/wallet', permanent: false },
      { source: '/booking', destination: '/store1/book/booking', permanent: false },
      { source: '/admin/import', destination: '/store1/admin/import', permanent: false },
      {
        source: '/:store/book/admin/import',
        destination: '/:store/admin/import',
        permanent: false,
      },
      { source: '/staff/login', destination: '/login', permanent: false },
      { source: '/:store/staff/login', destination: '/login', permanent: false },
      { source: '/:store/admin/login', destination: '/login', permanent: false },
    ];
  },
};

export default nextConfig;
