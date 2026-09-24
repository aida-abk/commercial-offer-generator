import fs from "fs";

const LAUNCH_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];

function fileExists(candidate: string): boolean {
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}

function resolveSystemChrome(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((value): value is string => Boolean(value));

  return candidates.find(fileExists);
}

export async function launchBrowser(extraArgs: string[] = []) {
  const puppeteer = await import("puppeteer");
  const args = [...LAUNCH_ARGS, ...extraArgs];

  const systemChrome = resolveSystemChrome();
  if (systemChrome) {
    return puppeteer.default.launch({
      headless: true,
      executablePath: systemChrome,
      args,
    });
  }

  try {
    return puppeteer.default.launch({
      headless: true,
      args,
    });
  } catch (error) {
    const hint =
      "Установите Chrome: npx puppeteer browsers install chrome " +
      "или задайте PUPPETEER_EXECUTABLE_PATH в .env";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n\n${hint}`);
  }
}
