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
};

export default nextConfig;