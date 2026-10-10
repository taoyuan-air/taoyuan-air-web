import type { NextConfig } from "next";
import path from "node:path";

// 本機開發預設 no base path；Production（例如 /tyair）由 NEXT_PUBLIC_BASE_PATH 設定。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
// Backend 位址預設本機開發用的 127.0.0.1:8001；VM 上如果 backend 監聽位址/port 不同，
// 用 BACKEND_ORIGIN 覆寫，不要直接改這個檔案。
const backendOrigin = process.env.BACKEND_ORIGIN || 'http://127.0.0.1:8001';

const nextConfig: NextConfig = {
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  transpilePackages: ['@taoyuan-air/shared'],
  turbopack: {
    root: path.resolve(__dirname, '..'),
    resolveAlias: {
      zustand: './node_modules/zustand',
    },
  },

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
