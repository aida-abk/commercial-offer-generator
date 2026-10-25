import fs from "fs";
import path from "path";
import { calculateOffer } from "../src/lib/calculator";
import { loadCalculationRules } from "../src/lib/catalog";
import type { ExtractedProject, PanelBrandId } from "../src/lib/types";

interface KpFixture {
  name: string;
  project: ExtractedProject;
  brand?: PanelBrandId;
  skipMaterials?: boolean;
  expected: {
    labor?: number;
    materials?: number;
    panel?: number;
    grand?: number;
  };
}

// Отдельные группы восстановлены по самим КП: строка кабеля 3*6 есть у всех
// квартир и означает варочную поверхность. В офисе такой строки нет — и группы
// варочной поверхности там тоже нет. Остальной набор техники для квартиры типовой.
//
// Число помещений взято из самих КП: инженеры ставят один автомат 10А на
// комнату, поэтому их количество в щите и есть число помещений.
//
// Точки приведены к той же договорённости, что и в стенде по метрам
// (scripts/benchmark-cable-routing.ts): подрозетники берутся из КП, выключателей
// 15% от них, точек UTP одна-три, световых точек 0,55 на м². «Лампочки» в КП —
// это временный свет на время монтажа, а не софиты с чертежа, поэтому брать их
// как световые точки нельзя.
//
// Работы сравнивать не с чем: инженеры подняли цену по умолчанию до 7000 ₸/м²,
// а суммы в готовых КП считались примерно по 6500 ₸/м². Расхождение по строке
// работ ожидаемо и в итог по сумме заложено.
const FIXTURES: KpFixture[] = [
  {
    name: "ЖК Aididar",
    project: {
      projectName: "ЖК Aididar",
      totalAreaSqM: 90,
      roomCount: 5,
      dedicatedCircuits: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 1 },
      outlets: 62,
      switches: 11,
      lightPoints: 50,
      utpPoints: 2,
      warmFloorCircuits: 0,
      notes: [],
    },
    expected: { materials: 743_775, panel: 277_940, grand: 1_471_715 },
  },
  {
    name: "ЖК Shabyt",
    project: {
      projectName: "ЖК Shabyt",
      totalAreaSqM: 100,
      roomCount: 5,
      dedicatedCircuits: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 2 },
      outlets: 62,
      switches: 11,
      lightPoints: 55,
      utpPoints: 2,
      warmFloorCircuits: 0,
      notes: [],
    },
    expected: { materials: 895_505, panel: 300_940, grand: 1_796_445 },
  },
  {
    name: "ЖК Tansu",
    project: {
      projectName: "ЖК Tansu",
      totalAreaSqM: 70,
      roomCount: 5,
      dedicatedCircuits: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 1 },
      outlets: 53,
      switches: 10,
      lightPoints: 39,
      utpPoints: 2,
      warmFloorCircuits: 0,
      notes: [],
    },
    expected: { materials: 698_300, panel: 300_940, grand: 1_389_240 },
  },
  {
    name: "Офис",
    project: {
      projectName: "Офис",
      totalAreaSqM: 120,
      roomCount: 5,
      dedicatedCircuits: {},
      outlets: 49,
      switches: 9,
      lightPoints: 66,
      utpPoints: 2,
      warmFloorCircuits: 0,
      notes: [],
    },
    expected: { materials: 940_015, panel: 258_640, grand: 2_198_655 },
  },
  {
    name: "ЖK Республика",
    project: {
      projectName: "ЖK Республика",
      totalAreaSqM: 32,
      roomCount: 3,
      dedicatedCircuits: { fridge: 1, hob: 1, ovenMicrowave: 1 },
      outlets: 32,
      switches: 6,
      lightPoints: 18,
      utpPoints: 2,
      warmFloorCircuits: 0,
      notes: [],
    },
    expected: { materials: 309_100, panel: 186_216, grand: 705_316 },
    skipMaterials: true,
  },
  {
    name: "ЖК VIVALDI (Legrand)",
    brand: "legrand",
    project: {
      projectName: "ЖК VIVALDI",
      totalAreaSqM: 110,
      roomCount: 8,
      dedicatedCircuits: { fridge: 1, freezer: 1, hob: 1, ovenMicrowave: 1, airConditioners: 2 },
      outlets: 78,
      switches: 14,
      lightPoints: 61,
      utpPoints: 3,
      warmFloorCircuits: 0,
      notes: [],
    },
    expected: { materials: 1_219_690, panel: 650_700, grand: 3_070_390 },
  },
  {
    // Розетки/выключатели восстановлены из КП: подрозетников 75 = розетки + выключатели.
    // По материалам объект выше нормы для своей площади: кабель 3*2,5 — 500 м при
    // 300-400 м у сопоставимых 70-100 м², и UTP 100 м.
    name: "ЖК София (CHINT)",
    brand: "chint",
    project: {
      projectName: "ЖК София",
      totalAreaSqM: 86,
      roomCount: 5,
      dedicatedCircuits: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 1, warmFloor: 1 },
      outlets: 53,
      switches: 10,
      lightPoints: 47,
      utpPoints: 2,
      warmFloorCircuits: 1,
      notes: [],
    },
    expected: { labor: 560_000, materials: 918_605, panel: 309_945, grand: 1_788_550 },
  },
];

function pctDiff(actual: number, expected: number): string {
  const diff = ((actual - expected) / expected) * 100;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(1)}%`;
}

function sumSection(items: { total: number }[]): number {
  return items.reduce((s, i) => s + i.total, 0);
}

console.log("=== Benchmark: calculator vs «Примеры КП» ===\n");
const laborRules = loadCalculationRules();
console.log(
  `Работы: ${laborRules.laborPerSqM} ₸/м², округление до ${laborRules.laborRoundTo} ₸. ` +
    "В готовых КП работы считались примерно по 6500 ₸/м², поэтому строка работ и " +
    "итог по сумме заведомо расходятся.\n",
);

const rows: {
  name: string;
  section: string;
  expected: number;
  actual: number;
  diffPct: number;
  ok: boolean;
}[] = [];

for (const f of FIXTURES) {
  const result = calculateOffer(f.project, undefined, f.brand ?? "schneider-easy9");
  const actual = {
    labor: result.laborPrice,
    materials: sumSection(result.materials),
    panel: sumSection(result.panel),
    grand: result.grandTotal,
  };

  console.log(
    `--- ${f.name} (${f.project.totalAreaSqM} m², ${f.project.outlets} роз / ${f.project.switches} выкл / ${f.project.lightPoints} свет) ---`,
  );

  for (const section of ["materials", "panel", "labor", "grand"] as const) {
    if (section === "materials" && f.skipMaterials) continue;
    const exp = f.expected[section];
    if (exp === undefined) continue;
    const act = actual[section];
    const diff = ((act - exp) / exp) * 100;
    const ok = Math.abs(diff) <= 15;
    rows.push({ name: f.name, section, expected: exp, actual: act, diffPct: diff, ok });
    console.log(
      `  ${section.padEnd(10)} expected ${exp.toLocaleString("ru-RU").padStart(12)} | actual ${act.toLocaleString("ru-RU").padStart(12)} | ${pctDiff(act, exp).padStart(7)} ${ok ? "✓" : "✗"}`,
    );
  }
  console.log("");
}

function summarize(label: string, subset: typeof rows) {
  if (subset.length === 0) return;
  const avg = subset.reduce((s, r) => s + Math.abs(r.diffPct), 0) / subset.length;
  const fails = subset.filter((r) => !r.ok).length;
  console.log(`${label}: avg |error| ${avg.toFixed(1)}%, ${fails}/${subset.length} outside ±15%`);
}

console.log("=== Summary ===");
summarize("Materials", rows.filter((r) => r.section === "materials"));
summarize("Panel", rows.filter((r) => r.section === "panel"));
summarize("Grand total", rows.filter((r) => r.section === "grand"));

fs.writeFileSync(
  path.join(process.cwd(), "scripts/benchmark-last-run.txt"),
  rows.map((r) => `${r.name}\t${r.section}\t${r.expected}\t${r.actual}\t${r.diffPct.toFixed(1)}%\t${r.ok ? "OK" : "FAIL"}`).join("\n"),
);
