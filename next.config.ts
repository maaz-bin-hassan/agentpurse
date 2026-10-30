import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node:sqlite is a Node built-in. Keep it out of the client bundle.
  serverExternalPackages: [],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({ "node:sqlite": "commonjs node:sqlite" });
    }
    return config;
  },
};

export default nextConfig;
