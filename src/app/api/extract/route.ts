import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { calculateAllVariants } from "@/lib/calculator";
import {
  estimateExtractDurationMs,
  progressForStage,
  stageMessage,
  type ExtractStage,
  type ExtractStreamEvent,
} from "@/lib/extract-progress";
import {
  analyzePdfPages,
  getSelectedPageNumbers,
  summarizePageAnalysis,
} from "@/lib/pdf-page-analyzer";
import { pdfBufferToImages } from "@/lib/pdf-to-images";
import {
  extractProjectFromImages,
  usageCostUsd,
  type ExtractionUsage,
} from "@/lib/vision-extract";

// Листы уходят пачками, а при упоре в лимит токенов ещё и с паузами на повтор.
export const maxDuration = 600;
export const runtime = "nodejs";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

function ndjsonLine(event: ExtractStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Ожидается multipart/form-data с PDF-файлом" },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        error:
          "Не удалось прочитать файл. Попробуйте PDF меньше 50 МБ или используйте «Ввести вручную».",
      },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "PDF файл не загружен" }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Файл слишком большой (макс. 100 МБ)." },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const startedAt = Date.now();
  const estimatedTotalMs = estimateExtractDurationMs(file.size);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ExtractStreamEvent) => {
        controller.enqueue(ndjsonLine(event));
      };

      const tick = (stage: ExtractStage) => {
        const elapsedSeconds = (Date.now() - startedAt) / 1000;
        const progress = progressForStage(stage);
        const etaSeconds = Math.max(0, estimatedTotalMs / 1000 - elapsedSeconds);
        emit({
          type: "progress",
          stage,
          progress,
          message: stageMessage(stage),
          etaSeconds,
          elapsedSeconds,
        });
      };

      try {
        tick("analyze");
        const { pages: analyzedPages, texts } = await analyzePdfPages(buffer);
        const selectedPageNumbers = getSelectedPageNumbers(analyzedPages);
        const pageSummary = summarizePageAnalysis(analyzedPages);

        tick("render");
        const images = await pdfBufferToImages(buffer, {
          pageNumbers: selectedPageNumbers,
        });

        tick("vision");
        // Текст отдаём только по выбранным страницам: экспликацию модель читает
        // текстом, а не по картинке.
        const selectedTexts = Object.fromEntries(
          selectedPageNumbers.map((n) => [n, texts[n] ?? ""]),
        );
        let usage: ExtractionUsage = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          requests: 0,
        };
        const extracted = await extractProjectFromImages(
          images,
          selectedTexts,
          (done, total, batchUsage) => {
            usage = batchUsage;
            if (total <= 1) return;
            const elapsedSeconds = (Date.now() - startedAt) / 1000;
            emit({
              type: "progress",
              stage: "vision",
              // Внутри стадии распознавания двигаемся по пачкам листов.
              progress: Math.min(
                99,
                Math.round(progressForStage("vision") + (done / total) * 20),
              ),
              message: `AI считает точки по листам — пачка ${done} из ${total}…`,
              etaSeconds: Math.max(0, estimatedTotalMs / 1000 - elapsedSeconds),
              elapsedSeconds,
            });
          },
        );
        extracted.notes = [
          ...pageSummary.map((s) => `[Анализ PDF] ${s}`),
          ...(extracted.notes ?? []),
        ];

        tick("calculate");
        const calc = calculateAllVariants(extracted);

        tick("done");
        emit({
          type: "complete",
          extracted,
          analyzedPages,
          selectedPages: selectedPageNumbers,
          sourceFileName: file.name,
          usage: { ...usage, costUsd: usageCostUsd(usage) },
          variants: Object.fromEntries(
            Object.entries(calc.variants).map(([brand, v]) => [
              brand,
              { totalAmount: v.totalAmount, panelCount: v.panel.length },
            ]),
          ),
        });
      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : "Ошибка обработки PDF",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
