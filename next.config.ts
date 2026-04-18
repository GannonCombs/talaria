import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['mppx', 'viem', 'keytar', 'pdf-parse'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
