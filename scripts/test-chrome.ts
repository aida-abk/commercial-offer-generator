import { launchBrowser } from "../src/lib/puppeteer-browser";

async function main() {
  const browser = await launchBrowser();
  console.log("Chrome launched successfully");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
