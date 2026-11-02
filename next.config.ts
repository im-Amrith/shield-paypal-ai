import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Every page is dynamic, so a few build workers are plenty; 15 of them can exhaust memory on smaller machines.
  experimental: { cpus: Number(process.env.NEXT_BUILD_CPUS) || 4 },
};

export default nextConfig;
