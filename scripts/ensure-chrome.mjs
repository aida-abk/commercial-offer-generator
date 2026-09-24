import fs from "fs";
import { execSync } from "child_process";

// В образе Chromium ставится системным пакетом — скачивать второй не нужно.
const candidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean);

const found = candidates.find((candidate) => fs.existsSync(candidate));
if (found) {
  console.log("Chrome found:", found);
  process.exit(0);
}

try {
  console.log("Installing Puppeteer Chrome...");
  execSync("npx puppeteer browsers install chrome", { stdio: "inherit" });
} catch {
  console.warn("Could not install Puppeteer Chrome automatically.");
}
