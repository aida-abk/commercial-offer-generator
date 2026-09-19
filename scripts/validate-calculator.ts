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
  const mat = result.materials.reduce((s, i) => s + i.total, 0);
  const diff = f.expectedTotal ? Math.abs(result.grandTotal - f.expectedTotal) / f.expectedTotal : 0;
  const pct = (diff * 100).toFixed(1);
  const ok = !f.expectedTotal || diff <= 0.15;
  console.log(`${ok ? "✓" : "✗"} ${f.name}: ${result.grandTotal.toLocaleString("ru-RU")} ₸ (labor ${result.laborPrice.toLocaleString("ru-RU")}, materials ${mat.toLocaleString("ru-RU")})${f.expectedTotal ? ` — expected ~${f.expectedTotal.toLocaleString("ru-RU")}, diff ${pct}%` : ""}`);
}

/**
 * Расшифровка замера кабеля по трассе на одном объекте: щит у входа, техника
 * с отдельными группами. По этим строкам инженер может проверить сам принцип
 * подсчёта — от щита по потолку и стенам до коробки, затем спуск к каждой точке.
 */
const routingDemo: ExtractedProject = {
  projectName: "Пример: 3-комнатная, щит у входа",
  totalAreaSqM: 86,
  outlets: 50,
  switches: 25,
  lightPoints: 15,
  utpPoints: 4,
  warmFloorCircuits: 0,
  ceilingHeightMeters: 2.7,
  panelLocation: "у входа в квартиру",
  rooms: [
    { name: "Прихожая", widthMeters: 2.4, lengthMeters: 4.2, panelToBoxMeters: 3, outlets: 4, switches: 4, lightPoints: 2, utpPoints: 0 },
    { name: "Кухня", widthMeters: 3.2, lengthMeters: 4.4, panelToBoxMeters: 7, outlets: 14, switches: 4, lightPoints: 3, utpPoints: 1 },
    { name: "Гостиная", widthMeters: 4.3, lengthMeters: 5.2, panelToBoxMeters: 12, outlets: 12, switches: 5, lightPoints: 4, utpPoints: 1 },
    { name: "Спальня", widthMeters: 3.4, lengthMeters: 4.3, panelToBoxMeters: 16, outlets: 8, switches: 4, lightPoints: 3, utpPoints: 1 },
    { name: "Детская", widthMeters: 3.1, lengthMeters: 4.0, panelToBoxMeters: 18, outlets: 6, switches: 4, lightPoints: 2, utpPoints: 1 },
    { name: "Санузел и ванная", widthMeters: 2.0, lengthMeters: 4.6, panelToBoxMeters: 9, outlets: 2, switches: 4, lightPoints: 1, utpPoints: 0 },
  ],
  dedicatedCircuits: {
    fridge: 1,
    hob: 1,
    ovenMicrowave: 1,
    airConditioners: 2,
    warmFloor: 1,
  },
  notes: [],
};

const demo = calculateOffer(routingDemo);
const route = demo.cableRoute;

console.log(`\n=== Замер кабеля по трассе: ${routingDemo.projectName} ===`);
console.log(`Помещения взяты с чертежа: ${route?.roomsEstimated ? "нет, синтезированы из площади" : "да"}\n`);
console.log(
  `${"Участок".padEnd(34)}${"щит→коробка".padStart(12)}${"по стенам".padStart(11)}${"спуски".padStart(9)}${"точек".padStart(7)}${"итого, м".padStart(10)}`,
);
for (const leg of route?.legs ?? []) {
  console.log(
    `${leg.label.slice(0, 33).padEnd(34)}${leg.panelToBoxMeters.toFixed(1).padStart(12)}${leg.horizontalMeters.toFixed(1).padStart(11)}${leg.dropMeters.toFixed(1).padStart(9)}${String(leg.pointCount).padStart(7)}${leg.totalMeters.toFixed(1).padStart(10)}`,
  );
}

console.log("\nИтог по кабелям (с запасом на разделку, до округления):");
console.log(`  ВВГнг 3*1,5 (свет и выключатели): ${route?.cable15.toFixed(1)} м`);
console.log(`  ВВГнг 3*2,5 (розетки и отдельные группы): ${route?.cable25.toFixed(1)} м`);
console.log(`  ВВГнг 3*6 (варочная поверхность): ${route?.cable6.toFixed(1)} м`);
console.log(`  UTP: ${route?.cableUtp.toFixed(1)} м`);

console.log("\nВ смете после округления:");
for (const item of demo.materials) {
  if (/Кабель|Провод|Подрозетник/.test(item.name)) {
    console.log(`  ${item.name.padEnd(34)}${String(item.quantity).padStart(6)} ${item.unit}`);
  }
}

console.log("\nАвтоматы в щите:");
for (const item of demo.panel) {
  if (/Автоматич/.test(item.name)) {
    console.log(`  ${item.name.padEnd(38)}${String(item.quantity).padStart(4)} шт`);
  }
}
const points = routingDemo.outlets + routingDemo.switches + routingDemo.utpPoints;
console.log(
  `\nПодрозетники: ${routingDemo.outlets} розеток + ${routingDemo.switches} выключателей + ${routingDemo.utpPoints} UTP = ${points} шт`,
);
