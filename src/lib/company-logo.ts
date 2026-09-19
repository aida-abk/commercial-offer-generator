import fs from "fs";
import path from "path";

let cachedLogoDataUri: string | null = null;

/** Inline logo for Puppeteer HTML (prefers white-header crop from reference КП). */
export function getCompanyLogoDataUri(): string {
  if (cachedLogoDataUri) return cachedLogoDataUri;

  const candidates = [
    path.join(process.cwd(), "public/branding/jt-electrics-logo.jpg"),
    path.join(process.cwd(), "public/branding/jt-electrics-logo-header.png"),
  ];

  for (const logoPath of candidates) {
    if (!fs.existsSync(logoPath)) continue;
    const buffer = fs.readFileSync(logoPath);
    const mime = logoPath.endsWith(".png") ? "image/png" : "image/jpeg";
    cachedLogoDataUri = `data:${mime};base64,${buffer.toString("base64")}`;
    return cachedLogoDataUri;
  }

  throw new Error("Company logo not found in public/branding/");
}
