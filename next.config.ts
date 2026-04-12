import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'mppx', 'viem', 'keytar'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
