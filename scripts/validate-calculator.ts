import { calculateOffer } from "../src/lib/calculator";
import type { ExtractedProject } from "../src/lib/types";

const fixtures: { name: string; project: ExtractedProject; expectedTotal?: number }[] = [
  {
    name: "Aididar ~90m²",
    project: { projectName: "ЖК Aididar", totalAreaSqM: 90, outlets: 55, switches: 25, lightPoints: 13, utpPoints: 4, warmFloorCircuits: 0, notes: [] },
    expectedTotal: 1471715,
  },
  {
    name: "Shabyt ~100m²",
    project: { projectName: "ЖК Shabyt", totalAreaSqM: 100, outlets: 65, switches: 30, lightPoints: 15, utpPoints: 5, warmFloorCircuits: 0, notes: [] },
    expectedTotal: 1796445,
  },
  {
    name: "Tansu ~70m²",
    project: { projectName: "ЖК Tansu", totalAreaSqM: 70, outlets: 45, switches: 20, lightPoints: 10, utpPoints: 3, warmFloorCircuits: 0, notes: [] },
    expectedTotal: 1389240,
  },
  {
    name: "Аyan ~75m²",
    project: { projectName: "Аyan", totalAreaSqM: 75, outlets: 50, switches: 22, lightPoints: 13, utpPoints: 3, warmFloorCircuits: 1, notes: [] },
    expectedTotal: 1394570,
  },
  {
    name: "Office ~120m²",
    project: { projectName: "Офис", totalAreaSqM: 120, outlets: 55, switches: 25, lightPoints: 13, utpPoints: 8, warmFloorCircuits: 0, notes: [] },
    expectedTotal: 2198655,
  },
];

for (const f of fixtures) {
  const result = calculateOffer(f.project);
  const diff = f.expectedTotal ? Math.abs(result.grandTotal - f.expectedTotal) / f.expectedTotal : 0;
  const pct = (diff * 100).toFixed(1);
  const ok = !f.expectedTotal || diff <= 0.15;
  console.log(`${ok ? "✓" : "✗"} ${f.name}: ${result.grandTotal.toLocaleString("ru-RU")} ₸ (labor ${result.laborPrice.toLocaleString("ru-RU")})${f.expectedTotal ? ` — expected ~${f.expectedTotal.toLocaleString("ru-RU")}, diff ${pct}%` : ""}`);
}
