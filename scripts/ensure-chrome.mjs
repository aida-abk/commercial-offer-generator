import fs from "fs";
import { execSync } from "child_process";

const systemChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (fs.existsSync(systemChrome)) {
  console.log("Chrome found:", systemChrome);
  process.exit(0);
}

try {
  console.log("Installing Puppeteer Chrome...");
  execSync("npx puppeteer browsers install chrome", { stdio: "inherit" });
} catch {
  console.warn("Could not install Puppeteer Chrome automatically.");
}
