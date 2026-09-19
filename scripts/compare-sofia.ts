import { calculateOffer } from "../src/lib/calculator";
import type { ExtractedProject } from "../src/lib/types";

/** Actual «КП ЖК София.pdf» line items (materials + panel) for line-by-line diff. */
const ACTUAL_MATERIALS: { name: string; qty: number; price: number }[] = [
  { name: "Кабель ВВГнг 2*1,5мм2", qty: 100, price: 302 },
  { name: "Кабель ВВГнг 3*1,5мм2", qty: 400, price: 423 },
  { name: "Кабель ВВГнг 3*2,5мм2", qty: 500, price: 680 },
  { name: "Кабель ВВГнг 3*6мм2", qty: 20, price: 1910 },
  { name: "Кабель UTP кат. 5е", qty: 100, price: 280 },
  { name: "Провод ПУГНП 2*1,5мм2", qty: 40, price: 360 },
  { name: "Гвозди 19мм", qty: 2, price: 11700 },
  { name: "Нейлоновые хомуты 150мм", qty: 25, price: 1350 },
  { name: "Коробка распределительная", qty: 30, price: 850 },
  { name: "Площадка монтажного пистолета д20", qty: 28, price: 2800 },
  { name: "Подрозетники", qty: 75, price: 159 },
  { name: "Крышка для подрозетника", qty: 75, price: 105 },
  { name: "Гильзы ГМЛ 4-3", qty: 60, price: 110 },
  { name: "Гильзы ГМЛ 6-4", qty: 50, price: 150 },
  { name: "Гильзы ГМЛ 10-5", qty: 35, price: 260 },
  { name: "Гильзы ГМЛ 16-6", qty: 35, price: 273 },
  { name: "Мешки для мусора", qty: 20, price: 70 },
  { name: "Изолента", qty: 7, price: 800 },
  { name: "Патрон Е27", qty: 15, price: 280 },
  { name: "Лампочки LED", qty: 15, price: 1450 },
  { name: "Дюбел хомут", qty: 2, price: 900 },
  { name: "Диски по камню 125мм", qty: 2, price: 6500 },
  { name: "Алмазный коронка д72", qty: 1, price: 25000 },
  { name: "Розетка наружн двойная", qty: 2, price: 1350 },
  { name: "Ротбанд 25кг", qty: 1, price: 4000 },
];

const ACTUAL_PANEL: { name: string; qty: number; price: number }[] = [
  { name: "Автоматич выкл. 1Р NB1-63 C10A (CHINT)", qty: 6, price: 2160 },
  { name: "Автоматич выкл. 1Р NB1-63 C16A (CHINT)", qty: 15, price: 2171 },
  { name: "Автоматич выкл. NB1-63 1Р С32А (CHINT)", qty: 1, price: 2430 },
  { name: "Модульный контактор", qty: 1, price: 31300 },
  { name: "Автоматич выкл. 2Р NB1-63 C63A (CHINT)", qty: 1, price: 6720 },
  { name: "Реле напряжения Welrok D2-63", qty: 1, price: 29740 },
  { name: "УЗО 63А 2п", qty: 4, price: 14300 },
  { name: "Кабель маркировка", qty: 3, price: 3100 },
  { name: "ПУГВ 1*6 зеленый", qty: 4, price: 640 },
  { name: "ПУГВ 1*6 синий", qty: 7, price: 640 },
  { name: "Нейлоновый хомут 4*150мм", qty: 4, price: 800 },
  { name: "Ншви 6-12", qty: 1, price: 1250 },
  { name: "Площадка самокл 20*20", qty: 1, price: 1700 },
  { name: "Шина соеденит 1 фазный 1 метр BSB", qty: 1, price: 8140 },
  { name: "Эл.щит 54 модуль/стекло", qty: 1, price: 90000 },
  { name: "Колодка соед. РБД 125А на дин рейку", qty: 4, price: 4100 },
];

const ACTUAL = {
  labor: 560_000,
  materials: 918_605,
  panel: 309_945,
  grand: 1_788_550,
};

// Восстановлено из КП: подрозетники 75 = розетки + выключатели, лампочки 15 —
// точки света, работы 560 000 ₸ / 6500 ≈ 86 м². Наличие строки кабеля 3*6
// означает варочную поверхность, остальная техника для квартиры типовая.
const PROJECT: ExtractedProject = {
  projectName: "ЖК София",
  totalAreaSqM: 86,
  outlets: 50,
  switches: 25,
  lightPoints: 15,
  utpPoints: 4,
  warmFloorCircuits: 0,
  dedicatedCircuits: {
    fridge: 1,
    hob: 1,
    ovenMicrowave: 1,
    airConditioners: 1,
    warmFloor: 1,
  },
  notes: [],
};

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function pct(actual: number, expected: number): string {
  const d = ((actual - expected) / expected) * 100;
  return `${d > 0 ? "+" : ""}${d.toFixed(1)}%`;
}

const result = calculateOffer(PROJECT, undefined, "chint");
const calcMaterials = result.materials;
const calcPanel = result.panel;
const matTotal = calcMaterials.reduce((s, i) => s + i.total, 0);
const panelTotal = calcPanel.reduce((s, i) => s + i.total, 0);

console.log("=== ЖК София: наш расчёт vs фактическое КП ===\n");
console.log(`Вход: ${PROJECT.totalAreaSqM} м², ${PROJECT.outlets} роз, ${PROJECT.switches} выкл, ${PROJECT.lightPoints} свет, ${PROJECT.utpPoints} UTP\n`);

console.log("--- ИТОГИ ---");
const summary = [
  ["Работы", result.laborPrice, ACTUAL.labor],
  ["Материалы", matTotal, ACTUAL.materials],
  ["Щит (CHINT)", panelTotal, ACTUAL.panel],
  ["ВСЕГО", result.grandTotal, ACTUAL.grand],
] as const;
for (const [label, calc, act] of summary) {
  console.log(
    `${label.padEnd(14)} наш ${fmt(calc).padStart(11)} | КП ${fmt(act).padStart(11)} | ${pct(calc, act).padStart(8)}`,
  );
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^а-яa-z0-9]/gi, "");
}

function matchLine(
  actualName: string,
  calcRows: { name: string; quantity: number; unitPrice: number; total: number }[],
) {
  const keys: [string, string][] = [
    ["ввгнг215", "ввгнг215"],
    ["ввгнг315", "ввгнг315"],
    ["ввгнг325", "ввгнг325"],
    ["ввгнг36", "ввгнг36"],
    ["utp", "utp"],
    ["пугнп", "пугнп"],
    ["гвозди", "гвозди"],
    ["нейлоновыехомуты", "нейлоновыехомуты"],
    ["коробкараспределительная", "коробкараспределительная"],
    ["площадкамонтажного", "площадкамонтажного"],
    ["подрозетники", "подрозетники"],
    ["крышка", "крышка"],
    ["гмл43", "гмл43"],
    ["гмл64", "гмл64"],
    ["гмл105", "гмл105"],
    ["гмл166", "гмл166"],
    ["мешки", "мешки"],
    ["изолента", "изолента"],
    ["патрон", "патрон"],
    ["лампочки", "лампочки"],
    ["дюбел", "дюбел"],
    ["диски", "диски"],
    ["коронка", "коронка"],
    ["розетканаружн", "розетканаружн"],
    ["ротбанд", "ротбанд"],
  ];
  const a = norm(actualName);
  const pair = keys.find(([k]) => a.includes(k));
  if (!pair) return undefined;
  return calcRows.find((r) => norm(r.name).includes(pair[1]));
}

console.log("\n--- МАТЕРИАЛЫ ПОСТРОЧНО ---");
console.log(
  `${"Позиция".padEnd(36)}${"КП кол".padStart(8)}${"наш кол".padStart(9)}${"КП цена".padStart(9)}${"наша".padStart(8)}${"КП сумма".padStart(11)}${"наша сумма".padStart(12)}`,
);
let missing: string[] = [];
for (const a of ACTUAL_MATERIALS) {
  const c = matchLine(a.name, calcMaterials);
  const actTotal = a.qty * a.price;
  if (!c) {
    missing.push(a.name);
    console.log(
      `${a.name.slice(0, 35).padEnd(36)}${String(a.qty).padStart(8)}${"—".padStart(9)}${fmt(a.price).padStart(9)}${"—".padStart(8)}${fmt(actTotal).padStart(11)}${"НЕТ".padStart(12)}`,
    );
    continue;
  }
  console.log(
    `${a.name.slice(0, 35).padEnd(36)}${String(a.qty).padStart(8)}${String(c.quantity).padStart(9)}${fmt(a.price).padStart(9)}${fmt(c.unitPrice).padStart(8)}${fmt(actTotal).padStart(11)}${fmt(c.total).padStart(12)}`,
  );
}

const extra = calcMaterials.filter((c) => !ACTUAL_MATERIALS.some((a) => matchLine(a.name, [c])));
if (extra.length) {
  console.log("\n--- ЛИШНИЕ У НАС (нет в КП) ---");
  for (const e of extra) {
    console.log(`${e.name.slice(0, 35).padEnd(36)} кол ${e.quantity}  ×${fmt(e.unitPrice)} = ${fmt(e.total)}`);
  }
}
if (missing.length) {
  console.log("\n--- ОТСУТСТВУЮТ У НАС (есть в КП) ---");
  for (const m of missing) console.log(`  ${m}`);
}

console.log("\n--- ЩИТ: НАШ СОСТАВ ---");
for (const p of calcPanel) {
  console.log(
    `${p.name.slice(0, 45).padEnd(47)}${String(p.quantity).padStart(4)} ×${fmt(p.unitPrice).padStart(7)} = ${fmt(p.total).padStart(9)}`,
  );
}
console.log(`${"ИТОГО".padEnd(47)}${" ".repeat(14)}   ${fmt(panelTotal).padStart(9)}`);

console.log("\n--- ЩИТ: КП СОСТАВ ---");
for (const p of ACTUAL_PANEL) {
  console.log(
    `${p.name.slice(0, 45).padEnd(47)}${String(p.qty).padStart(4)} ×${fmt(p.price).padStart(7)} = ${fmt(p.qty * p.price).padStart(9)}`,
  );
}
console.log(`${"ИТОГО".padEnd(47)}${" ".repeat(14)}   ${fmt(ACTUAL.panel).padStart(9)}`);

console.log("\n--- ЩИТ: ЦЕНЫ КАТАЛОГА vs КП ---");
for (const a of ACTUAL_PANEL) {
  const c = calcPanel.find((r) => {
    const n = norm(r.name);
    const an = norm(a.name);
    if (an.includes("c10a")) return n.includes("c10a") || n.includes("10a");
    if (an.includes("c16a")) return n.includes("c16a") || n.includes("16a");
    if (an.includes("с32а") || an.includes("c32a")) return n.includes("32a") || n.includes("с32а");
    if (an.includes("контактор")) return n.includes("контактор");
    if (an.includes("c63a")) return n.includes("63a") && n.includes("выкл");
    if (an.includes("реле")) return n.includes("реле");
    if (an.includes("узо")) return n.includes("узо");
    if (an.includes("маркировка")) return n.includes("маркировка");
    if (an.includes("элщит")) return n.includes("элщит");
    if (an.includes("шина")) return n.includes("шина");
    if (an.includes("колодка")) return n.includes("колодка");
    if (an.includes("ншви")) return n.includes("ншви");
    if (an.includes("пугв16зеленый")) return n.includes("пугв16зеленый");
    if (an.includes("пугв16синий")) return n.includes("пугв16синий");
    if (an.includes("хомут4150")) return n.includes("хомут4150");
    if (an.includes("площадкасамокл")) return n.includes("площадкасамокл");
    return false;
  });
  const priceDiff = c ? pct(c.unitPrice, a.price) : "—";
  console.log(
    `${a.name.slice(0, 40).padEnd(42)}КП ${fmt(a.price).padStart(7)} | наш ${c ? fmt(c.unitPrice).padStart(7) : "  НЕТ"} | ${priceDiff.padStart(8)}`,
  );
}
