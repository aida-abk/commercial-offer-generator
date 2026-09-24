import { planForProject, calculateOffer } from "../src/lib/calculator";
import type { ExtractedProject } from "../src/lib/types";

const project: ExtractedProject = {
  projectName: "ЖК Aididar",
  totalAreaSqM: 90,
  outlets: 55,
  switches: 25,
  lightPoints: 13,
  utpPoints: 4,
  warmFloorCircuits: 0,
  notes: [],
};

const plan = planForProject(project);
console.log("Комнаты:");
for (const r of plan.rooms) {
  console.log(`  ${r.name} (${r.type}) ${r.areaSqM} м²: роз ${r.outlets}, свет ${r.lightPoints}/${r.lightGroups} гр, выкл ${r.switchesSingle}+${r.switchesTwoWay}, тп ${r.warmFloorLoops}, кондер ${r.airConditioners}, utp ${r.utpPoints}`);
}
console.log("\nГруппы:");
for (const c of plan.circuits) {
  console.log(`  ${c.breakerAmps ?? "—"}А ${c.cableType.padEnd(6)} ${c.cableMeters.toFixed(1).padStart(6)} м  ${c.label}`);
}
console.log("\nКабель:", plan.cableMeters);
console.log(`Автоматы: 10А ${plan.breakers10a}, 16А ${plan.breakers16a}, 32А ${plan.breakers32a}, ввод ${plan.inputBreakers}`);
console.log(`УЗО: ${plan.rcdCount}, модулей ${plan.panelModules} → корпус ${plan.panelSize}`);
console.log(`Лампочки: ${plan.tempBulbs}`);

const calc = calculateOffer(project);
console.log("\nЩит:");
for (const i of calc.panel) console.log(`  ${i.quantity}×${i.name} = ${i.total.toLocaleString("ru-RU")}`);
console.log("\nМатериалы:");
for (const i of calc.materials) console.log(`  ${i.quantity} ${i.unit} ${i.name} = ${i.total.toLocaleString("ru-RU")}`);
