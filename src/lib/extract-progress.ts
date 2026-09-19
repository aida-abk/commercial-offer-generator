export type ExtractStage =
  | "upload"
  | "analyze"
  | "render"
  | "vision"
  | "calculate"
  | "done";

export interface ExtractProgressEvent {
  type: "progress";
  stage: ExtractStage;
  progress: number;
  message: string;
  etaSeconds: number;
  elapsedSeconds: number;
}

export interface ExtractCompleteEvent {
  type: "complete";
  extracted: import("./types").ExtractedProject;
  analyzedPages: import("./types").AnalyzedPdfPage[];
  selectedPages: number[];
  variants: Record<string, { totalAmount: number; panelCount: number }>;
  sourceFileName: string;
}

export interface ExtractErrorEvent {
  type: "error";
  message: string;
}

export type ExtractStreamEvent =
  | ExtractProgressEvent
  | ExtractCompleteEvent
  | ExtractErrorEvent;

const STAGE_WEIGHTS: Record<ExtractStage, number> = {
  upload: 0.05,
  analyze: 0.1,
  render: 0.15,
  vision: 0.55,
  calculate: 0.1,
  done: 0.05,
};

/** Rough ETA from file size (bytes) and expected page count. */
export function estimateExtractDurationMs(fileSizeBytes: number, pageCount = 10): number {
  const baseMs = 12_000;
  const sizeMs = Math.min(fileSizeBytes / 80_000, 30_000);
  const pagesMs = pageCount * 2_500;
  const visionMs = 35_000 + pageCount * 3_000;
  return baseMs + sizeMs + pagesMs + visionMs;
}

export function progressForStage(stage: ExtractStage): number {
  const order: ExtractStage[] = ["upload", "analyze", "render", "vision", "calculate", "done"];
  let sum = 0;
  for (const s of order) {
    if (s === stage) {
      sum += STAGE_WEIGHTS[s] * 0.5;
      break;
    }
    sum += STAGE_WEIGHTS[s];
  }
  return Math.min(99, Math.round(sum * 100));
}

export function stageMessage(stage: ExtractStage): string {
  switch (stage) {
    case "upload":
      return "Загрузка PDF…";
    case "analyze":
      return "Анализ страниц — выбор нужных листов…";
    case "render":
      return "Подготовка изображений для AI…";
    case "vision":
      return "AI считает розетки, выключатели и площадь…";
    case "calculate":
      return "Расчёт сметы (3 варианта бренда)…";
    case "done":
      return "Готово";
    default:
      return "Обработка…";
  }
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `≈ ${s} сек`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `≈ ${m} мин ${r} сек` : `≈ ${m} мин`;
}
