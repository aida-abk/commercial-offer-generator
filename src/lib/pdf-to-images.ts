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

type CanvasModule = {
  createCanvas: (width: number, height: number) => {
    getContext: (type: "2d") => unknown;
    toBuffer: (mime: string) => Buffer;
  };
};

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerSrc = path.join(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  );
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  return pdfjs;
}

async function tryLoadCanvas(): Promise<CanvasModule | null> {
  try {
    const mod = (await import(
      /* webpackIgnore: true */ "canvas"
    )) as unknown as CanvasModule;
    return mod;
  } catch {
    return null;
  }
}

async function renderWithPdfJs(
  pdfBuffer: Buffer,
  options: PdfToImagesOptions,
): Promise<PdfPageImage[]> {
  const pdfjs = await loadPdfJs();
  const canvasLib = await tryLoadCanvas();
  if (!canvasLib) {
    throw new Error(
      "Native canvas module not installed; use Puppeteer fallback for PDF rendering.",
    );
  }

  const data = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const scale = options.scale ?? 2;

  const pagesToRender =
    options.pageNumbers?.length && options.pageNumbers.length > 0
      ? options.pageNumbers.filter((n) => n >= 1 && n <= pdf.numPages)
      : Array.from(
          { length: Math.min(options.maxPages ?? 15, pdf.numPages) },
          (_, i) => i + 1,
        );

  const images: PdfPageImage[] = [];

  for (const pageNumber of pagesToRender) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = canvasLib.createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");
    await page.render({
      canvasContext: context as never,
      viewport,
    }).promise;
    const pngBuffer = canvas.toBuffer("image/png");
    images.push({
      pageNumber,
      mimeType: "image/png",
      base64: pngBuffer.toString("base64"),
      width: viewport.width,
      height: viewport.height,
    });
  }

  return images;
}

async function renderWithPuppeteer(
  pdfBuffer: Buffer,
  options: PdfToImagesOptions,
): Promise<PdfPageImage[]> {
  const { launchBrowser } = await import("./puppeteer-browser");
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    const b64 = pdfBuffer.toString("base64");
    await page.setContent(
      `<!DOCTYPE html><html><body style="margin:0"><embed type="application/pdf" src="data:application/pdf;base64,${b64}" width="100%" height="100%" /></body></html>`,
      { waitUntil: "load" },
    );
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
    const screenshot = await page.screenshot({ type: "png", fullPage: true });
    const buf = Buffer.isBuffer(screenshot) ? screenshot : Buffer.from(screenshot);
    const image: PdfPageImage = {
      pageNumber: 1,
      mimeType: "image/png",
      base64: buf.toString("base64"),
      width: 1200,
      height: 1600,
    };
    const maxPages = options.maxPages ?? 1;
    return maxPages >= 1 ? [image] : [];
  } finally {
    await browser.close();
  }
}

/** Convert PDF buffer to base64 PNG page images (pdfjs + optional canvas, Puppeteer fallback). */
export async function pdfBufferToImages(
  pdfBuffer: Buffer,
  options: PdfToImagesOptions = {},
): Promise<PdfPageImage[]> {
  try {
    return await renderWithPdfJs(pdfBuffer, options);
  } catch {
    return renderWithPuppeteer(pdfBuffer, options);
  }
}

export function selectRelevantPages(images: PdfPageImage[]): PdfPageImage[] {
  return images;
}
