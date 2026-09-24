import path from "path";
import type { AnalyzedPdfPage } from "./types";

interface PageKeywordRule {
  pattern: RegExp;
  weight: number;
  label: string;
}

const PAGE_KEYWORD_RULES: PageKeywordRule[] = [
  { pattern: /план\s*электр/i, weight: 20, label: "план электрики" },
  { pattern: /электроприбор|сводн.*электр/i, weight: 18, label: "электроприборы" },
  { pattern: /розетк|roзетк/i, weight: 16, label: "розетки" },
  { pattern: /\bсвет\b|освещен|светильник/i, weight: 16, label: "освещение" },
  { pattern: /выключ|выкл\.|выкл,/i, weight: 16, label: "выключатели" },
  { pattern: /схема\s*освещ/i, weight: 14, label: "схема освещения" },
  { pattern: /электрик|электр\.|electr/i, weight: 12, label: "электрика" },
  { pattern: /тепл.*пол|тёпл.*пол/i, weight: 10, label: "тёплый пол" },
  { pattern: /utp|интернет|слаботоч/i, weight: 10, label: "слаботочные" },
  // Экспликация помещений — единственный источник площадей и списка комнат,
  // поэтому она в приоритете наравне с планами.
  { pattern: /экспликац|ведомост.*помещен|площад.*м2|общ.*площад/i, weight: 15, label: "экспликация" },
  { pattern: /обмерн|планировоч/i, weight: 6, label: "обмерный план" },
  { pattern: /рабоч.*проект|дизайн.*проект/i, weight: 4, label: "общие данные" },
];

const MIN_SCORE = 8;
const MAX_SELECTED_PAGES = 12;
/** В альбомах без текстового слоя оценка у всех страниц нулевая — тогда
 *  модели нужно показать хотя бы это количество страниц, иначе она додумывает. */
const MIN_SELECTED_PAGES = 8;

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerSrc = path.join(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  );
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  return pdfjs;
}

async function extractPageText(page: {
  getTextContent: () => Promise<{ items: unknown[] }>;
}): Promise<string> {
  const content = await page.getTextContent();
  return content.items
    .map((item) => {
      if (typeof item === "object" && item !== null && "str" in item) {
        return String((item as { str?: string }).str ?? "");
      }
      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function scorePageText(text: string): { score: number; matchedKeywords: string[]; title?: string } {
  const normalized = text.toLowerCase();
  let score = 0;
  const matchedKeywords: string[] = [];
  let title: string | undefined;

  for (const rule of PAGE_KEYWORD_RULES) {
    if (rule.pattern.test(normalized) || rule.pattern.test(text)) {
      score += rule.weight;
      matchedKeywords.push(rule.label);
      if (!title || rule.weight > 10) {
        title = rule.label;
      }
    }
  }

  return { score, matchedKeywords, title };
}

export interface PdfAnalysis {
  pages: AnalyzedPdfPage[];
  /** Полный текст выбранных страниц — экспликацию выгоднее отдать моделью текстом,
   *  чем надеяться, что она прочитает таблицу с картинки. */
  texts: Record<number, string>;
}

export async function analyzePdfPages(pdfBuffer: Buffer): Promise<PdfAnalysis> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(pdfBuffer);
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  const analyzed: AnalyzedPdfPage[] = [];
  const texts: Record<number, string> = {};

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const text = await extractPageText(page);
    const { score, matchedKeywords, title } = scorePageText(text);
    texts[pageNumber] = text;

    analyzed.push({
      pageNumber,
      textPreview: text.slice(0, 200),
      score,
      matchedKeywords,
      selected: false,
      title,
    });
  }

  const ranked = [...analyzed].sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber);
  const selectedNumbers = new Set<number>();

  for (const page of ranked) {
    if (page.score >= MIN_SCORE && selectedNumbers.size < MAX_SELECTED_PAGES) {
      selectedNumbers.add(page.pageNumber);
    }
  }

  // Сканы и альбомы без текстового слоя дают нулевые оценки: добираем страницы
  // по порядку, иначе модель получает одну случайную страницу вместо проекта.
  if (selectedNumbers.size < MIN_SELECTED_PAGES) {
    for (const page of ranked) {
      if (selectedNumbers.size >= Math.min(MIN_SELECTED_PAGES, analyzed.length)) break;
      selectedNumbers.add(page.pageNumber);
    }
  }

  return {
    pages: analyzed
      .map((page) => ({
        ...page,
        selected: selectedNumbers.has(page.pageNumber),
      }))
      .sort((a, b) => a.pageNumber - b.pageNumber),
    texts,
  };
}

export function getSelectedPageNumbers(pages: AnalyzedPdfPage[]): number[] {
  return pages.filter((p) => p.selected).map((p) => p.pageNumber);
}

export function summarizePageAnalysis(pages: AnalyzedPdfPage[]): string[] {
  return pages
    .filter((p) => p.selected)
    .map((p) => {
      const label = p.title ?? p.matchedKeywords[0] ?? "страница";
      return `Стр. ${p.pageNumber}: ${label} (оценка ${p.score})`;
    });
}
