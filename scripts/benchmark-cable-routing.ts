/**
 * Проверка точности замера кабеля по трассе против готовых КП.
 *
 * Сравниваем метры, а не тенге: суммы зависят от прайса, метраж — только от
 * алгоритма. Количество точек берём из самого КП (подрозетники и лампочки —
 * это факт), поэтому проверяется именно трассировка, а не угадывание точек.
 */
import { estimateCableRoute, resolveDedicatedCircuits } from "../src/lib/cable-routing";
import { loadCalculationRules } from "../src/lib/catalog";
import type { DedicatedCircuits, ExtractedProject } from "../src/lib/types";

/** Факт из КП: метраж кабеля и количество точек. Прочерк — позиции в КП нет. */
interface Fixture {
  name: string;
  areaSqM: number;
  /** Подрозетники из КП — суммарное число розеток, выключателей и точек UTP. */
  socketBoxes: number;
  /** Лампочки из КП — число точек света. */
  lamps: number;
  /** Отдельные группы. 3*6 в КП есть почти всегда, значит варочная поверхность стоит. */
  dedicated: DedicatedCircuits;
  actual: {
    cable15: number;
    cable25: number;
    cable6?: number;
    cableUtp?: number;
  };
}

/**
 * Разбивка подрозетников на розетки, выключатели и UTP.
 * Отношение подрозетников к лампочкам по всем примерам держится около 5,6,
 * что даёт примерно полтора выключателя и треть точки UTP на светильник.
 */
const SWITCHES_PER_LAMP = 1.5;
const UTP_PER_LAMP = 0.3;

const FIXTURES: Fixture[] = [
  {
    name: "ЖК Aididar",
    areaSqM: 90,
    socketBoxes: 75,
    lamps: 13,
    dedicated: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 1 },
    actual: { cable15: 350, cable25: 300, cable6: 22 },
  },
  {
    name: "ЖК Shabyt",
    areaSqM: 100,
    socketBoxes: 75,
    lamps: 15,
    dedicated: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 2 },
    actual: { cable15: 450, cable25: 400, cable6: 25, cableUtp: 70 },
  },
  {
    name: "ЖК Tansu",
    areaSqM: 70,
    socketBoxes: 65,
    lamps: 10,
    dedicated: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 1 },
    actual: { cable15: 400, cable25: 300, cable6: 20, cableUtp: 40 },
  },
  {
    name: "Офис",
    areaSqM: 120,
    socketBoxes: 60,
    lamps: 13,
    dedicated: {},
    actual: { cable15: 600, cable25: 400, cableUtp: 180 },
  },
  {
    name: "ЖК Республика",
    areaSqM: 32,
    socketBoxes: 40,
    lamps: 6,
    dedicated: { fridge: 1, hob: 1, ovenMicrowave: 1 },
    actual: { cable15: 120, cable25: 150, cable6: 17, cableUtp: 20 },
  },
  {
    name: "ЖК VIVALDI",
    areaSqM: 110,
    socketBoxes: 95,
    lamps: 18,
    dedicated: { fridge: 1, freezer: 1, hob: 1, ovenMicrowave: 1, airConditioners: 2 },
    actual: { cable15: 600, cable25: 600, cable6: 25, cableUtp: 100 },
  },
  {
    name: "ЖК София",
    areaSqM: 86,
    socketBoxes: 75,
    lamps: 15,
    dedicated: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 1, warmFloor: 1 },
    actual: { cable15: 400, cable25: 500, cable6: 20, cableUtp: 100 },
  },
  {
    name: "ЖК Монако",
    areaSqM: 130,
    socketBoxes: 90,
    lamps: 16,
    dedicated: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 2 },
    actual: { cable15: 500, cable25: 500, cable6: 25, cableUtp: 100 },
  },
  {
    name: "ЖК Тумар",
    areaSqM: 74,
    socketBoxes: 65,
    lamps: 10,
    dedicated: { fridge: 1, hob: 1, ovenMicrowave: 1, airConditioners: 1 },
    actual: { cable15: 300, cable25: 300, cable6: 25, cableUtp: 50 },
  },
  {
    name: "ЖК Кербез",
    areaSqM: 60,
    socketBoxes: 60,
    lamps: 9,
    dedicated: { fridge: 1, hob: 1, ovenMicrowave: 1 },
    actual: { cable15: 250, cable25: 250, cable6: 20, cableUtp: 60 },
  },
];

function toProject(f: Fixture): ExtractedProject {
  const switches = Math.round(f.lamps * SWITCHES_PER_LAMP);
  const utpPoints = Math.round(f.lamps * UTP_PER_LAMP);
  const outlets = Math.max(0, f.socketBoxes - switches - utpPoints);
  return {
    projectName: f.name,
    totalAreaSqM: f.areaSqM,
    outlets,
    switches,
    lightPoints: f.lamps,
    utpPoints,
    warmFloorCircuits: 0,
    dedicatedCircuits: f.dedicated,
    notes: [],
  };
}

function pct(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : 100;
  return ((actual - expected) / expected) * 100;
}

function fmtPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(0)}%`;
}

interface Row {
  key: "cable15" | "cable25" | "cable6" | "cableUtp";
  label: string;
}

const ROWS: Row[] = [
  { key: "cable15", label: "3*1,5" },
  { key: "cable25", label: "3*2,5" },
  { key: "cable6", label: "3*6" },
  { key: "cableUtp", label: "UTP" },
];

/**
 * Насколько сами КП согласованы между собой.
 *
 * Если метраж в готовых КП задавался пропорционально площади, то метры на
 * квадратный метр будут близки по всем объектам, а их разброс задаёт предел
 * точности: точнее собственного разброса источника попасть невозможно.
 */
function diagnoseSourceSpread() {
  console.log("\n=== Разброс самих КП: метров кабеля на м² площади ===");

  for (const row of ROWS) {
    const ratios = FIXTURES.map((f) => {
      const actual = f.actual[row.key];
      return actual === undefined ? undefined : actual / f.areaSqM;
    }).filter((v): v is number => v !== undefined);
    if (ratios.length < 3) continue;

    const mean = ratios.reduce((s, v) => s + v, 0) / ratios.length;
    const sd = Math.sqrt(
      ratios.reduce((s, v) => s + (v - mean) ** 2, 0) / ratios.length,
    );
    console.log(
      `${row.label.padEnd(7)}в среднем ${mean.toFixed(2)} м/м², от ${Math.min(...ratios).toFixed(2)} до ${Math.max(...ratios).toFixed(2)}, собственный разброс ±${((sd / mean) * 100).toFixed(0)}%`,
    );
  }
}

function main() {
  const rules = loadCalculationRules();
  const routing = rules.cableRouting;
  const labels = rules.dedicatedCircuits?.labels;
  if (!routing || !labels) {
    throw new Error("В config/calculation-rules.json нет cableRouting или dedicatedCircuits");
  }

  console.log("=== Замер кабеля по трассе против готовых КП ===\n");
  console.log(
    `${"Проект".padEnd(16)}${"кабель".padStart(8)}${"КП".padStart(7)}${"наш".padStart(7)}${"ошибка".padStart(9)}`,
  );

  const errors: Record<Row["key"], number[]> = {
    cable15: [],
    cable25: [],
    cable6: [],
    cableUtp: [],
  };

  for (const fixture of FIXTURES) {
    const project = toProject(fixture);
    const route = estimateCableRoute(project, routing, labels);
    let first = true;

    for (const row of ROWS) {
      const expected = fixture.actual[row.key];
      if (expected === undefined) continue;
      const got = route[row.key];
      const error = pct(got, expected);
      errors[row.key].push(error);
      console.log(
        `${(first ? fixture.name : "").padEnd(16)}${row.label.padStart(8)}${String(expected).padStart(7)}${got.toFixed(0).padStart(7)}${fmtPct(error).padStart(9)}`,
      );
      first = false;
    }

    const circuits = resolveDedicatedCircuits(project);
    const dedicatedCount = Object.values(circuits).reduce((s, v) => s + (v ?? 0), 0);
    console.log(
      `${"".padEnd(16)}${"вход".padStart(8)}  ${project.outlets} роз / ${project.switches} выкл / ${project.lightPoints} свет / ${project.utpPoints} UTP / ${dedicatedCount} отд. групп`,
    );
  }

  console.log("\n=== Точность по позициям ===");
  for (const row of ROWS) {
    const list = errors[row.key];
    if (!list.length) continue;
    const avgAbs = list.reduce((s, e) => s + Math.abs(e), 0) / list.length;
    const bias = list.reduce((s, e) => s + e, 0) / list.length;
    const outside = list.filter((e) => Math.abs(e) > 15).length;
    console.log(
      `${row.label.padEnd(7)} средняя |ошибка| ${avgAbs.toFixed(0).padStart(3)}%  систематический сдвиг ${fmtPct(bias).padStart(5)}  вне ±15%: ${outside}/${list.length}`,
    );
  }

  console.log("\n=== Главный кабель целиком (3*1,5 + 3*2,5) ===");
  const mainErrors: number[] = [];
  for (const fixture of FIXTURES) {
    const route = estimateCableRoute(toProject(fixture), routing, labels);
    const expected = fixture.actual.cable15 + fixture.actual.cable25;
    const got = route.cable15 + route.cable25;
    const error = pct(got, expected);
    mainErrors.push(error);
    console.log(
      `${fixture.name.padEnd(16)}КП ${String(expected).padStart(5)} м   наш ${got.toFixed(0).padStart(5)} м   ${fmtPct(error).padStart(6)}`,
    );
  }
  const mainAvgAbs = mainErrors.reduce((s, e) => s + Math.abs(e), 0) / mainErrors.length;
  const mainBias = mainErrors.reduce((s, e) => s + e, 0) / mainErrors.length;
  console.log(
    `Средняя |ошибка| ${mainAvgAbs.toFixed(0)}%, систематический сдвиг ${fmtPct(mainBias)}, вне ±15%: ${mainErrors.filter((e) => Math.abs(e) > 15).length}/${mainErrors.length}`,
  );

  diagnoseSourceSpread();
}

main();
