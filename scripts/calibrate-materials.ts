import { calculateOffer } from "../src/lib/calculator";
import type { ExtractedProject } from "../src/lib/types";

const CASES: { name: string; project: ExtractedProject; materials: number }[] = [
  {
    name: "Aididar",
    project: { projectName: "Aididar", totalAreaSqM: 90, outlets: 55, switches: 25, lightPoints: 13, utpPoints: 4, warmFloorCircuits: 0, notes: [] },
    materials: 743_775,
  },
  {
    name: "Shabyt",
    project: { projectName: "Shabyt", totalAreaSqM: 100, outlets: 65, switches: 30, lightPoints: 15, utpPoints: 5, warmFloorCircuits: 0, notes: [] },
    materials: 895_505,
  },
  {
    name: "Tansu",
    project: { projectName: "Tansu", totalAreaSqM: 70, outlets: 45, switches: 20, lightPoints: 10, utpPoints: 3, warmFloorCircuits: 0, notes: [] },
    materials: 698_300,
  },
  {
    name: "Office",
    project: { projectName: "Office", totalAreaSqM: 120, outlets: 55, switches: 25, lightPoints: 13, utpPoints: 8, warmFloorCircuits: 0, notes: [] },
    materials: 940_015,
  },
  {
    name: "Republic",
    project: { projectName: "Republic", totalAreaSqM: 32, outlets: 24, switches: 14, lightPoints: 8, utpPoints: 2, warmFloorCircuits: 0, notes: [] },
    materials: 309_100,
  },
];

function scoreRules(): number {
  let err = 0;
  for (const c of CASES) {
    const r = calculateOffer(c.project);
    const mat = r.materials.reduce((s, i) => s + i.total, 0);
    err += Math.abs(mat - c.materials) / c.materials;
  }
  return err;
}

console.log("Current score:", scoreRules().toFixed(3));
for (const c of CASES) {
  const r = calculateOffer(c.project);
  const mat = r.materials.reduce((s, i) => s + i.total, 0);
  const diff = ((mat - c.materials) / c.materials) * 100;
  console.log(`${c.name}: ${mat.toLocaleString()} vs ${c.materials.toLocaleString()} (${diff > 0 ? "+" : ""}${diff.toFixed(1)}%)`);
}
