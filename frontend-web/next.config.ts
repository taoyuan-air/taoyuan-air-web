import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  basePath: "/tyair",
  assetPrefix: "/tyair",
  transpilePackages: ["@taoyuan-air/shared"],
  turbopack: {
    root: path.resolve(__dirname, ".."),
    resolveAlias: {
      zustand: "./node_modules/zustand",
    },
  },
};

export default nextConfig;
