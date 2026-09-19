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

// Отдельные группы восстановлены по самим КП: строка кабеля 3*6 есть у всех
// квартир и означает варочную поверхность. В офисе такой строки нет — и группы
// варочной поверхности там тоже нет. Остальной набор техники для квартиры типовой.
const FIXTURES: KpFixture[] = [
  {
    name: "ЖК Aididar",
    project: {
      projectName: "ЖК Aididar",
      totalAreaSqM: 90,
      dedicatedCircuits: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 1 },
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
      dedicatedCircuits: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 2 },
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
      dedicatedCircuits: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 1 },
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
      dedicatedCircuits: {},
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
      dedicatedCircuits: { fridge: 1, hob: 1, ovenMicrowave: 1 },
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
      dedicatedCircuits: { fridge: 1, freezer: 1, hob: 1, ovenMicrowave: 1, airConditioners: 2 },
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
      dedicatedCircuits: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 1, warmFloor: 1 },
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

console.log("=== Benchmark: calculator vs «Примеры КП» ===\n");
console.log("Labor: 6500 ₸/m², округление до 10 000 ₸\n");

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
