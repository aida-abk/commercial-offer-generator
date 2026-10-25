/**
 * Вытаскивает из готовых КП фактические количества по кабелю, подрозетникам,
 * коробкам и автоматам. Нужен как источник истины для проверки замера по трассе:
 * суммы в тенге зависят от цен, а метры — только от алгоритма.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const EXAMPLES_DIR = path.join(process.cwd(), "Примеры КП");

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  );
  return pdfjs;
}

/**
 * Собирает текст PDF по строкам. Позиции КП лежат в таблице, и без группировки
 * по вертикальной координате название, количество и цена склеиваются в одну строку.
 */
async function extractPdfLines(file: string): Promise<string[]> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(readFileSync(file));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const lines: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string }[]>();

    for (const item of content.items) {
      if (typeof item !== "object" || item === null || !("str" in item)) continue;
      const cell = item as { str?: string; transform?: number[] };
      const str = String(cell.str ?? "");
      if (!str.trim()) continue;
      const x = cell.transform?.[4] ?? 0;
      const y = Math.round((cell.transform?.[5] ?? 0) / 3) * 3;
      const row = rows.get(y) ?? [];
      row.push({ x, str });
      rows.set(y, row);
    }

    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const row = rows.get(y)!;
      lines.push(
        row
          .sort((a, b) => a.x - b.x)
          .map((c) => c.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    }
  }

  return lines;
}

/**
 * Автоматы в КП подписаны по-разному: «RX3 4,5KA 16A 1П С», «1Р Easy9 C16A»,
 * «1Р NXB-63 C10A». Номинал стоит то до обозначения полюсов, то после марки,
 * поэтому ищем просто число с «A» и отдельно смотрим число полюсов.
 */
function isBreaker(name: string, amps: number): boolean {
  if (!/автомат/.test(name)) return false;
  return new RegExp(`(?:^|[^\\d])${amps}\\s*[aа](?![0-9а-яё])`, "i").test(name);
}

/** Однополюсный автомат — рабочая группа. Двух- и четырёхполюсный — вводной. */
function isSinglePole(name: string): boolean {
  return !/\b[24]\s*[пpр]\b|[^\d][24][пpр](?![а-яё])/i.test(name);
}

/** Позиции, по которым сверяем количества. Ключ — что ищем в названии строки КП. */
interface Target {
  key: string;
  test: (name: string) => boolean;
  /** Своя разборка количества, если оно записано не как «12 шт». */
  parse?: (line: string) => number | undefined;
  /** Позиция может встречаться несколькими строками (например, колодки РБД двух цветов). */
  sum?: boolean;
}

const TARGETS: Target[] = [
  { key: "cable2x1.5", test: (n) => /ввгнг/.test(n) && /2[*х×]1[.,]?5/.test(n) },
  { key: "cable3x1.5", test: (n) => /ввгнг/.test(n) && /3[*х×]1[.,]?5/.test(n) },
  { key: "cable3x2.5", test: (n) => /ввгнг/.test(n) && /3[*х×]2[.,]?5/.test(n) },
  { key: "cable3x4", test: (n) => /ввгнг/.test(n) && /3[*х×]4/.test(n) },
  { key: "cable3x6", test: (n) => /ввгнг/.test(n) && /3[*х×]6/.test(n) },
  { key: "cableUtp", test: (n) => /utp|утп/.test(n) },
  { key: "pugnp", test: (n) => /пугнп/.test(n) },
  { key: "conduit", test: (n) => /гофр/.test(n) },
  { key: "socketBoxes", test: (n) => /подрозетник/.test(n) && !/крышка/.test(n) },
  { key: "junctionBoxes", test: (n) => /коробка\s*распределительная|распред.*коробка/.test(n) },
  { key: "lamps", test: (n) => /лампочк/.test(n) },
  { key: "breaker10", test: (n) => isBreaker(n, 10) && isSinglePole(n) },
  { key: "breaker16", test: (n) => isBreaker(n, 16) && isSinglePole(n) },
  { key: "breaker25", test: (n) => isBreaker(n, 25) && isSinglePole(n) },
  { key: "breaker32", test: (n) => isBreaker(n, 32) && isSinglePole(n) },
  {
    key: "breakerInput",
    test: (n) => /автомат/.test(n) && !isSinglePole(n),
  },
  { key: "rcd", test: (n) => /узо|дифф/.test(n), sum: true },
  { key: "contactor", test: (n) => /контактор/.test(n) },
  { key: "voltageRelay", test: (n) => /реле\s*(?:контроля\s*)?напряжен/.test(n) },
  { key: "terminalBlock", test: (n) => /рбд|колодка\s*соед/.test(n), sum: true },
  {
    key: "panelModules",
    // «Эл.щит 54 модуль/стекло», «Эл.щит ЩРВ 72 модуль», «Эл.щит ТОРО 36м».
    test: (n) => /эл[.\s]*щит|щрв/.test(n) && !/wi-?fi|блок\s*питания/.test(n),
    parse: (line) => {
      const match = line.match(/(\d{2,3})\s*(?:модул|м[,\s])/i);
      if (!match) return undefined;
      const value = Number.parseInt(match[1], 10);
      return Number.isFinite(value) ? value : undefined;
    },
  },
];

/** Число полюсов вводного автомата: от него зависит, сколько модулей он занимает. */
function parseInputPoles(line: string): number | undefined {
  const match = line.match(/(?:^|[^\d])([24])\s*[пpр](?![а-яё])/i);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

export interface KpActuals {
  file: string;
  laborPrice?: number;
  items: Record<string, number>;
}

/**
 * Строка КП выглядит как «3 Кабель ВВГнг 3*6мм2 22,0 м 1910,0 38 500,0»:
 * количество стоит перед единицей измерения, а не после.
 */
function parseQuantity(line: string): number | undefined {
  // \b в JavaScript не знает кириллицы, поэтому конец единицы проверяем явно.
  const match = line.match(
    /(\d+(?:[.,]\d+)?)\s+(?:м|шт|метр|м2|уп|компл)(?![а-яё\d])/i,
  );
  if (!match) return undefined;
  const value = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

function parseLaborPrice(text: string): number | undefined {
  const match = text
    .toLowerCase()
    .match(/(?:черновые|эл[.\s]*монтажные)[^\n]*?([\d]{3}[\d\s]{3,})/);
  if (!match) return undefined;
  const value = Number.parseInt(match[1].replace(/\s/g, ""), 10);
  return Number.isFinite(value) ? value : undefined;
}

export async function extractKpActuals(file: string): Promise<KpActuals> {
  const lines = await extractPdfLines(path.join(EXAMPLES_DIR, file));
  const items: Record<string, number> = {};

  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const target of TARGETS) {
      if (!target.sum && items[target.key] !== undefined) continue;
      if (!target.test(lower)) continue;
      const qty = (target.parse ?? parseQuantity)(line);
      if (qty === undefined) continue;
      items[target.key] = target.sum ? (items[target.key] ?? 0) + qty : qty;
      if (target.key === "breakerInput" && items.inputPoles === undefined) {
        const poles = parseInputPoles(line);
        if (poles !== undefined) items.inputPoles = poles;
      }
    }
  }

  return { file, laborPrice: parseLaborPrice(lines.join("\n")), items };
}

async function main() {
  const files = readdirSync(EXAMPLES_DIR).filter(
    (f) => f.toLowerCase().endsWith(".pdf") && /кп/i.test(f),
  );

  const rows: KpActuals[] = [];
  for (const file of files) {
    try {
      rows.push(await extractKpActuals(file));
    } catch (error) {
      console.error(`  ! ${file}: ${(error as Error).message}`);
    }
  }

  const keys = [...TARGETS.map((t) => t.key), "inputPoles"];
  console.log(["файл", "работы", ...keys].join("\t"));
  for (const row of rows) {
    console.log(
      [
        row.file.replace(/\.pdf$/i, ""),
        row.laborPrice ?? "-",
        ...keys.map((k) => row.items[k] ?? "-"),
      ].join("\t"),
    );
  }
}

if (process.argv[1]?.includes("extract-kp-cables")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
