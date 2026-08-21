import type { NextConfig } from "next";
import path from "node:path";

const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:5050";

const nextConfig: NextConfig = {
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
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
