import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'agentcash'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
