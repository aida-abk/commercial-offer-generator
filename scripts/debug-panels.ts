import { planForProject } from "../src/lib/calculator";
import type { ExtractedProject } from "../src/lib/types";

const cases: [string, Partial<ExtractedProject>][] = [
  ["Aididar 90", { totalAreaSqM: 90, outlets: 55, switches: 25, lightPoints: 13, utpPoints: 4 }],
  ["Shabyt 100", { totalAreaSqM: 100, outlets: 65, switches: 30, lightPoints: 15, utpPoints: 5 }],
  ["Tansu 70", { totalAreaSqM: 70, outlets: 45, switches: 20, lightPoints: 10, utpPoints: 3 }],
  ["Офис 120", { totalAreaSqM: 120, outlets: 55, switches: 25, lightPoints: 13, utpPoints: 8 }],
  ["Республика 32", { totalAreaSqM: 32, outlets: 24, switches: 14, lightPoints: 8, utpPoints: 2 }],
  ["VIVALDI 110", { totalAreaSqM: 110, outlets: 80, switches: 35, lightPoints: 18, utpPoints: 6 }],
];

for (const [name, p] of cases) {
  const plan = planForProject({
    projectName: name, warmFloorCircuits: 0, notes: [],
    outlets: 0, switches: 0, lightPoints: 0, utpPoints: 0, totalAreaSqM: 0, ...p,
  } as ExtractedProject);
  const rcdGroups = plan.circuits.filter((c) => c.needsRcd).length;
  console.log(
    `${name.padEnd(15)} комнат ${String(plan.rooms.length).padStart(2)} | 10А ${String(plan.breakers10a).padStart(2)} | 16А ${String(plan.breakers16a).padStart(2)} | 32А ${plan.breakers32a} | розет.групп ${String(rcdGroups).padStart(2)} → УЗО ${plan.rcdCount} | модулей ${String(plan.panelModules).padStart(2)} (+12) → корпус ${plan.panelSize}`,
  );
}
