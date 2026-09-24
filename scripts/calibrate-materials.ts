/**
 * Подбор геометрии трасс по эталонным КП.
 * Спуск 3 м и запас 4% заданы заказчиком и не подбираются — меняются только
 * средние длины, которые в правилах не названы.
 *
 *   npx tsx scripts/calibrate-materials.ts
 *
 * Скрипт ничего не записывает: печатает лучшую комбинацию, её переносят
 * руками в config/calculation-rules.json → geometry.
 */
import { calculateOffer } from "../src/lib/calculator";
import { loadCalculationRules } from "../src/lib/catalog";
import type { ExtractedProject } from "../src/lib/types";

interface Case {
  name: string;
  project: ExtractedProject;
  materials: number;
  /** Объект вне нормы для своей площади — в счёт качества не идёт. */
  outlier?: boolean;
}

const base = { warmFloorCircuits: 0, notes: [] as string[] };

const CASES: Case[] = [
  {
    name: "Aididar 90",
    project: { projectName: "Aididar", totalAreaSqM: 90, outlets: 55, switches: 25, lightPoints: 13, utpPoints: 4, ...base },
    materials: 743_775,
  },
  {
    name: "Shabyt 100",
    project: { projectName: "Shabyt", totalAreaSqM: 100, outlets: 65, switches: 30, lightPoints: 15, utpPoints: 5, ...base },
    materials: 895_505,
  },
  {
    name: "Tansu 70",
    project: { projectName: "Tansu", totalAreaSqM: 70, outlets: 45, switches: 20, lightPoints: 10, utpPoints: 3, ...base },
    materials: 698_300,
  },
  {
    name: "Офис 120",
    project: { projectName: "Офис", totalAreaSqM: 120, outlets: 55, switches: 25, lightPoints: 13, utpPoints: 8, ...base },
    materials: 940_015,
  },
  {
    name: "VIVALDI 110",
    project: { projectName: "VIVALDI", totalAreaSqM: 110, outlets: 80, switches: 35, lightPoints: 18, utpPoints: 6, ...base },
    materials: 1_219_690,
  },
  {
    name: "София 86",
    project: { projectName: "София", totalAreaSqM: 86, outlets: 50, switches: 25, lightPoints: 15, utpPoints: 4, warmFloorCircuits: 1, notes: [] },
    materials: 918_605,
    outlier: true,
  },
];

function materialsTotal(project: ExtractedProject): number {
  return calculateOffer(project).materials.reduce((s, i) => s + i.total, 0);
}

function score(): { err: number; worst: number } {
  let err = 0;
  let worst = 0;
  let n = 0;
  for (const c of CASES) {
    if (c.outlier) continue;
    const diff = Math.abs(materialsTotal(c.project) - c.materials) / c.materials;
    err += diff;
    worst = Math.max(worst, diff);
    n += 1;
  }
  return { err: err / n, worst };
}

const rules = loadCalculationRules();
const g = rules.geometry;
const original = { ...g };

const grid = {
  panelToRoomBaseM: [2, 3, 4, 5, 6],
  panelToRoomPerSqrtAreaM: [0.3, 0.45, 0.55, 0.7, 0.85, 1],
  inRoomRunPerPointM: [0.8, 1, 1.2, 1.5, 1.8, 2.2],
};

let best = { err: Infinity, worst: Infinity, combo: original };
for (const a of grid.panelToRoomBaseM) {
  for (const b of grid.panelToRoomPerSqrtAreaM) {
    for (const c of grid.inRoomRunPerPointM) {
      g.panelToRoomBaseM = a;
      g.panelToRoomPerSqrtAreaM = b;
      g.inRoomRunPerPointM = c;
      const s = score();
      // При равной средней ошибке выигрывает вариант с меньшим худшим случаем.
      if (s.err < best.err - 0.0005 || (Math.abs(s.err - best.err) <= 0.0005 && s.worst < best.worst)) {
        best = { err: s.err, worst: s.worst, combo: { ...g } };
      }
    }
  }
}

Object.assign(g, best.combo);

console.log("Лучшая геометрия:");
console.log(`  panelToRoomBaseM        ${best.combo.panelToRoomBaseM}`);
console.log(`  panelToRoomPerSqrtAreaM ${best.combo.panelToRoomPerSqrtAreaM}`);
console.log(`  inRoomRunPerPointM      ${best.combo.inRoomRunPerPointM}`);
console.log(`  средняя |ошибка| по материалам ${(best.err * 100).toFixed(1)}%, худший случай ${(best.worst * 100).toFixed(1)}%\n`);

for (const c of CASES) {
  const mat = materialsTotal(c.project);
  const diff = ((mat - c.materials) / c.materials) * 100;
  console.log(
    `  ${c.name.padEnd(13)} ${mat.toLocaleString("ru-RU").padStart(10)} vs ${c.materials.toLocaleString("ru-RU").padStart(10)}  ${diff > 0 ? "+" : ""}${diff.toFixed(1)}%${c.outlier ? "  (вне нормы, не учитывается)" : ""}`,
  );
}

console.log(`\nВ конфиге сейчас: base ${original.panelToRoomBaseM}, perSqrt ${original.panelToRoomPerSqrtAreaM}, inRoom ${original.inRoomRunPerPointM}`);
