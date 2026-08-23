import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer", "@prisma/client", "pdfjs-dist"],
};

export default nextConfig;
