import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server external packages: these libraries use native dependencies
  // (sharp) or complex module structures that should not be bundled
  // by webpack/turbopack in server-side route handlers.
  serverExternalPackages: ["unpdf", "mammoth", "xlsx"],
};

export default nextConfig;
