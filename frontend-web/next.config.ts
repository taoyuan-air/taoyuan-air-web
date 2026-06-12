import type { NextConfig } from "next";
import path from "node:path";

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
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
};

export default nextConfig;