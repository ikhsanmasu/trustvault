import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server external packages: unpdf bundles pdfjs-dist which has native
  // dependencies. Mark it external to avoid bundling issues in route handlers.
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
