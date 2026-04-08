import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'agentcash', 'mppx', 'viem'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
