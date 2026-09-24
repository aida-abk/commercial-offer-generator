/**
 * Проверка правил расчёта на контрольном объекте: каждое правило из ТЗ
 * проверяется отдельно, чтобы правка конфигурации не ломала логику групп.
 *
 *   npx tsx scripts/validate-calculator.ts
 */
import { calculateOffer, planForProject } from "../src/lib/calculator";
import { loadCalculationRules } from "../src/lib/catalog";
import { makeRoom, nextRoomId } from "../src/lib/rooms";
import type { ExtractedProject, Room, RoomType } from "../src/lib/types";

const rules = loadCalculationRules();

function room(name: string, type: RoomType, areaSqM: number, patch: Partial<Room> = {}): Room {
  return makeRoom({ id: nextRoomId(), name, type, areaSqM, ...patch });
}

/** Типовая трёшка 90 м² с полным набором инженерии. */
const project: ExtractedProject = {
  projectName: "Контрольная квартира 90 м²",
  totalAreaSqM: 90,
  outlets: 0,
  switches: 0,
  lightPoints: 0,
  utpPoints: 0,
  warmFloorCircuits: 0,
  leakSensor: true,
  rooms: [
    room("Кухня", "kitchen", 14, { outlets: 12, lightPoints: 8, lightGroups: 2, switchesSingle: 2, warmFloorLoops: 1 }),
    room("Гостиная", "living", 22, { outlets: 14, lightPoints: 10, lightGroups: 2, switchesSingle: 2, airConditioners: 1, utpPoints: 1 }),
    room("Спальня 1", "bedroom", 15, { outlets: 8, lightPoints: 6, lightGroups: 2, switchesSingle: 1, switchesTwoWay: 2, airConditioners: 1 }),
    room("Спальня 2", "bedroom", 14, { outlets: 8, lightPoints: 6, lightGroups: 2, switchesSingle: 1, switchesTwoWay: 2, airConditioners: 1 }),
    room("Коридор", "hallway", 11, { outlets: 3, lightPoints: 6, lightGroups: 1, switchesSingle: 0, switchesTwoWay: 2 }),
    room("Санузел", "bathroom", 6, { outlets: 2, lightPoints: 4, lightGroups: 1, switchesSingle: 1, warmFloorLoops: 1 }),
    room("Балкон", "balcony", 5, { outlets: 1, lightPoints: 1, lightGroups: 1, switchesSingle: 1 }),
    room("Гардеробная", "utility", 3, { outlets: 0, lightPoints: 1, lightGroups: 1, switchesSingle: 1 }),
  ],
  notes: [],
};

const plan = planForProject(project);
const kitchen = plan.circuits.filter((c) => c.roomName === "Кухня" && c.kind !== "light" && c.kind !== "utp" && c.kind !== "warmFloor");

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures += 1;
  console.log(`${ok ? "✓" : "✗"} ${label} — ${detail}`);
}

console.log("=== Правила групп ===");

check(
  "Кухня: 4 группы",
  kitchen.length === 4,
  `${kitchen.length} шт: ${kitchen.map((c) => c.kind).join(", ")}`,
);

check(
  "Варочная поверхность: ВВГнг 3*6 и отдельный автомат 32А",
  kitchen.some((c) => c.kind === "kitchenHob" && c.cableType === "3x6" && c.breakerAmps === 32),
  kitchen.find((c) => c.kind === "kitchenHob")?.cableType ?? "нет линии",
);

const lightCircuits = plan.circuits.filter((c) => c.kind === "light");
check(
  "Освещение: одна комната — одна группа 10А, кабель 3*1,5",
  lightCircuits.length === project.rooms!.length &&
    lightCircuits.every((c) => c.cableType === "3x1.5") &&
    lightCircuits.filter((c) => c.breakerAmps === 10).length === project.rooms!.length - 2,
  `${lightCircuits.length} линий, автоматов 10А ${plan.breakers10a} (балкон и гардеробная идут от соседней группы)`,
);

const socketCircuits = plan.circuits.filter((c) => c.kind === "socket");
check(
  "Розетки: одна комната — один автомат 16А, кабель 3*2,5",
  socketCircuits.every((c) => c.cableType === "3x2.5" && (c.breakerAmps === 16 || c.breakerAmps === null)),
  `${socketCircuits.length} комнатных розеточных линий`,
);

check(
  "Кондиционеры: отдельная группа на внутренний блок",
  plan.circuits.filter((c) => c.kind === "airCon").length === 3,
  `${plan.circuits.filter((c) => c.kind === "airCon").length} шт`,
);

check(
  "Тёплый пол: отдельная группа на контур",
  plan.circuits.filter((c) => c.kind === "warmFloor").length === 2,
  `${plan.circuits.filter((c) => c.kind === "warmFloor").length} шт`,
);

check(
  "«Нептун»: отдельная группа",
  plan.circuits.some((c) => c.kind === "leakSensor"),
  plan.circuits.find((c) => c.kind === "leakSensor")?.label ?? "нет",
);

const rcdGroups = plan.circuits.filter((c) => c.needsRcd).length;
const perRcd = rcdGroups / plan.rcdCount;
check(
  "УЗО: 3–4 розеточные группы на один аппарат",
  perRcd >= 3 && perRcd <= 4.01,
  `${rcdGroups} групп / ${plan.rcdCount} УЗО = ${perRcd.toFixed(1)}`,
);

const w = rules.panelModuleWidths;
check(
  "Корпус щита: модули по факту + запас",
  plan.panelSize >= plan.panelModules + w.spare,
  `${plan.panelModules} модулей + ${w.spare} запас → корпус ${plan.panelSize}`,
);

check(
  "Спуск до точки — 3 м",
  rules.geometry.dropToPointM === 3,
  `${rules.geometry.dropToPointM} м`,
);

check(
  "Запас кабеля на срезы — 4%",
  Math.abs(rules.geometry.wasteFactor - 0.04) < 1e-9,
  `${(rules.geometry.wasteFactor * 100).toFixed(0)}%`,
);

const bulbsPerRoom = plan.tempBulbs / project.rooms!.length;
check(
  "Временные лампочки: 3–4 на комнату",
  bulbsPerRoom >= 3 && bulbsPerRoom <= 4,
  `${plan.tempBulbs} на ${project.rooms!.length} комнат = ${bulbsPerRoom.toFixed(1)}`,
);

check(
  "Работы по умолчанию — 7000 ₸/м²",
  rules.laborPerSqM === 7000,
  `${rules.laborPerSqM} ₸/м²`,
);

console.log("\n=== Щит ===");
console.log(
  `Автоматы: 10А ${plan.breakers10a}, 16А ${plan.breakers16a}, 32А ${plan.breakers32a}, ввод 2п ${plan.inputBreakers}`,
);
console.log(`УЗО ${plan.rcdCount}, модулей ${plan.panelModules}, корпус ${plan.panelSize} мод.`);

console.log("\n=== Кабель, м ===");
for (const [type, meters] of Object.entries(plan.cableMeters)) {
  if (meters > 0) console.log(`  ${type.padEnd(6)} ${meters}`);
}

const calc = calculateOffer(project);
console.log("\n=== Смета ===");
console.log(`  работы     ${calc.laborPrice.toLocaleString("ru-RU")} ₸`);
console.log(`  материалы  ${calc.materials.reduce((s, i) => s + i.total, 0).toLocaleString("ru-RU")} ₸`);
console.log(`  щит        ${calc.panel.reduce((s, i) => s + i.total, 0).toLocaleString("ru-RU")} ₸`);
console.log(`  итого      ${calc.grandTotal.toLocaleString("ru-RU")} ₸`);

if (failures > 0) {
  console.error(`\n${failures} правил нарушено`);
  process.exit(1);
}
console.log("\nВсе правила выполняются.");
