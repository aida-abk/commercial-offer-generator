import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer", "@prisma/client", "pdfjs-dist"],
  experimental: {
    // Middleware buffers the body; default 10MB breaks PDF uploads.
    middlewareClientMaxBodySize: "100mb",
  },
  serverActions: {
    bodySizeLimit: "100mb",
  },
};

export default nextConfig;
