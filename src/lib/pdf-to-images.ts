import fs from "fs";
import os from "os";
import path from "path";

export interface PdfPageImage {
  pageNumber: number;
  mimeType: "image/png";
  base64: string;
  width: number;
  height: number;
}

export interface PdfToImagesOptions {
  maxPages?: number;
  scale?: number;
  pageNumbers?: number[];
}

const PDFJS_DIR = path.join(process.cwd(), "node_modules/pdfjs-dist/build");

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  );
  return pdfjs;
}

/** Какие страницы рендерить: явный список или первые maxPages. */
async function resolvePageNumbers(
  pdfBuffer: Buffer,
  options: PdfToImagesOptions,
): Promise<number[]> {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  }).promise;
  const numPages = pdf.numPages;
  await pdf.destroy();

  if (options.pageNumbers?.length) {
    return options.pageNumbers.filter((n) => n >= 1 && n <= numPages);
  }
  return Array.from({ length: Math.min(options.maxPages ?? 12, numPages) }, (_, i) => i + 1);
}

const RENDER_PAGE_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body style="margin:0">
<script type="module">
  import * as pdfjs from "./pdf.min.mjs";
  pdfjs.GlobalWorkerOptions.workerSrc = "./pdf.worker.min.mjs";
  window.renderPages = async (pageNumbers, scale) => {
    const doc = await pdfjs.getDocument({ url: "./doc.pdf" }).promise;
    const out = [];
    for (const pageNumber of pageNumbers) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      out.push({
        pageNumber,
        dataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
      });
      canvas.width = 0;
      canvas.height = 0;
    }
    return out;
  };
  window.pdfReady = true;
</script>
</body></html>`;

/**
 * Рендер страниц в Chrome: pdf.js исполняется на странице, где есть настоящий
 * canvas. Нативные canvas-биндинги в Node с pdf.js 4 не работают — node-canvas
 * падает на inline-картинках, @napi-rs/canvas роняет процесс.
 */
async function renderInChrome(
  pdfBuffer: Buffer,
  pageNumbers: number[],
  scale: number,
): Promise<PdfPageImage[]> {
  const { launchBrowser } = await import("./puppeteer-browser");
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "kp-pdf-render-"));

  try {
    fs.copyFileSync(path.join(PDFJS_DIR, "pdf.min.mjs"), path.join(workDir, "pdf.min.mjs"));
    fs.copyFileSync(
      path.join(PDFJS_DIR, "pdf.worker.min.mjs"),
      path.join(workDir, "pdf.worker.min.mjs"),
    );
    fs.writeFileSync(path.join(workDir, "doc.pdf"), pdfBuffer);
    fs.writeFileSync(path.join(workDir, "index.html"), RENDER_PAGE_HTML);

    // Страница читает pdf.js и сам PDF из соседних файлов — для file:// это
    // требует явного разрешения.
    const browser = await launchBrowser(["--allow-file-access-from-files"]);
    try {
      const page = await browser.newPage();
      await page.goto(`file://${path.join(workDir, "index.html")}`, { waitUntil: "load" });
      await page.waitForFunction("window.pdfReady === true", { timeout: 30_000 });

      const rendered = (await page.evaluate(
        (nums: number[], s: number) =>
          (window as unknown as {
            renderPages: (n: number[], s: number) => Promise<
              { pageNumber: number; dataUrl: string; width: number; height: number }[]
            >;
          }).renderPages(nums, s),
        pageNumbers,
        scale,
      )) as { pageNumber: number; dataUrl: string; width: number; height: number }[];

      return rendered.map((r) => ({
        pageNumber: r.pageNumber,
        mimeType: "image/png" as const,
        base64: r.dataUrl.replace(/^data:image\/png;base64,/, ""),
        width: r.width,
        height: r.height,
      }));
    } finally {
      await browser.close();
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/** Convert PDF buffer to base64 PNG page images (рендер в Chrome через pdf.js). */
export async function pdfBufferToImages(
  pdfBuffer: Buffer,
  options: PdfToImagesOptions = {},
): Promise<PdfPageImage[]> {
  const pageNumbers = await resolvePageNumbers(pdfBuffer, options);
  if (pageNumbers.length === 0) return [];
  return renderInChrome(pdfBuffer, pageNumbers, options.scale ?? 2);
}

export function selectRelevantPages(images: PdfPageImage[]): PdfPageImage[] {
  return images;
}
