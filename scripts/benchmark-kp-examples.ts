import fs from "fs";
import path from "path";
import { calculateOffer } from "../src/lib/calculator";
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

const FIXTURES: KpFixture[] = [
  {
    name: "ЖК Aididar",
    project: {
      projectName: "ЖК Aididar",
      totalAreaSqM: 90,
      outlets: 55,
      switches: 25,
      lightPoints: 13,
      utpPoints: 4,
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
      outlets: 65,
      switches: 30,
      lightPoints: 15,
      utpPoints: 5,
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
      outlets: 45,
      switches: 20,
      lightPoints: 10,
      utpPoints: 3,
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
      outlets: 55,
      switches: 25,
      lightPoints: 13,
      utpPoints: 8,
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
      outlets: 24,
      switches: 14,
      lightPoints: 8,
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
      outlets: 80,
      switches: 35,
      lightPoints: 18,
      utpPoints: 6,
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
      outlets: 50,
      switches: 25,
      lightPoints: 15,
      utpPoints: 4,
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

import { loadCalculationRules } from "../src/lib/catalog";

const rules = loadCalculationRules();

console.log("=== Benchmark: calculator vs «Примеры КП» ===\n");
console.log(
  `Работы по умолчанию: ${rules.laborPerSqM} ₸/м², округление до ${rules.laborRoundTo} ₸.\n` +
    "Сравнение materials/panel/grand идёт при исторической цене работ из КП,\n" +
    "иначе смена ставки маскирует расхождения по материалам и щиту.\n",
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
  // Историческая цена работ из самого КП: ставка изменилась (7000 ₸/м²),
  // поэтому для сравнения материалов и щита она подставляется как есть.
  const historicalLabor =
    f.expected.labor ??
    (f.expected.grand !== undefined &&
    f.expected.materials !== undefined &&
    f.expected.panel !== undefined
      ? f.expected.grand - f.expected.materials - f.expected.panel
      : undefined);

  const result = calculateOffer(f.project, historicalLabor, f.brand ?? "schneider-easy9");
  const defaultLabor = calculateOffer(f.project, undefined, f.brand ?? "schneider-easy9").laborPrice;
  const actual = {
    labor: result.laborPrice,
    materials: sumSection(result.materials),
    panel: sumSection(result.panel),
    grand: result.grandTotal,
  };

  console.log(
    `--- ${f.name} (${f.project.totalAreaSqM} m², ${f.project.outlets} роз / ${f.project.switches} выкл / ${f.project.lightPoints} свет) ---`,
  );

  for (const section of ["materials", "panel", "grand"] as const) {
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
  if (historicalLabor !== undefined) {
    console.log(
      `  ${"работы".padEnd(10)} в КП было ${historicalLabor.toLocaleString("ru-RU").padStart(9)} | по новой ставке ${defaultLabor.toLocaleString("ru-RU").padStart(9)} | ${pctDiff(defaultLabor, historicalLabor).padStart(7)} (справочно)`,
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
