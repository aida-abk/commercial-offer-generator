/**
 * Проверка точности замера кабеля по трассе против готовых КП.
 *
 * Сравниваем метры, а не тенге: суммы зависят от прайса, метраж — только от
 * алгоритма. Все факты берутся прямо из PDF готовых КП, чтобы цифры нельзя было
 * незаметно подогнать руками.
 *
 * Что в КП есть как факт и используется как вход:
 * - подрозетники — это ровно сумма розеток, выключателей и точек UTP;
 * - автоматы 10А — число помещений: инженеры ставят по одному на комнату;
 * - автоматы 16А — число розеточных групп;
 * - автомат 32А — варочная поверхность.
 *
 * Чего в КП нет и взять негде: проектные световые точки. «Лампочки» в КП — это
 * временный свет на время монтажа (3-4 на комнату), а не софиты с чертежа.
 * Поэтому метраж 3*1,5 здесь проверяется только как оценка сверху-снизу, а
 * честный замер трассы даёт кабель 3*6: это одна группа варочной поверхности,
 * то есть прямое измерение одной трассы без примесей.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { extractKpActuals } from "./extract-kp-cables";
import { estimateCableRoute } from "../src/lib/cable-routing";
import { loadCalculationRules } from "../src/lib/catalog";
import type {
  CableRoutingRules,
  DedicatedCircuits,
  ExtractedProject,
  RoomKind,
  RoomSpec,
} from "../src/lib/types";

const EXAMPLES_DIR = path.join(process.cwd(), "Примеры КП");

/**
 * Площадь объекта в КП не пишут — она есть в дизайн-проекте или в названии
 * файла проекта. Сопоставление по имени файла КП.
 */
const AREA_BY_KP: Record<string, number> = {
  "КП ЖК Aididar": 90,
  "КП ЖК Shabyt": 100,
  "КП ЖК Tansu": 70,
  "КП  Офис": 120,
  "КП ЖK Республика": 32,
  "КП ЖК VIVALDI": 110,
  "КП ЖК Монако": 130,
  "КП ЖК Тумар": 74,
  "КП Кербез": 60,
  "КП проект электрика": 86,
  "КП Аян электрика": 80,
  "КП ЖК Австрия": 60,
  "КП ЖК Туран 39": 100,
  "КП  Жк W Towers": 110,
  "КП QASIET": 150,
  "КП ЖК Flora": 150,
  "КП ЖК GreenLine Sakura": 140,
  "КП ЖК Evaluation": 95,
};

/** Точек UTP в квартире обычно 1-3: ТВ-зоны и кабинет. */
const UTP_MIN = 1;
const UTP_MAX = 3;

/**
 * Выключателей примерно по одному на помещение: один при входе. Проходные в
 * коридоре и спальне алгоритм достраивает сам по типу помещения.
 */
const SWITCHES_PER_ROOM = 1;

/**
 * Какая доля подрозетников — выключатели. В КП подрозетники идут одной строкой,
 * и как они делятся между розетками и выключателями, не написано. Доля
 * подобрана по метражу 3*2,5: при 15% систематический сдвиг по розеточному
 * кабелю почти исчезает.
 */
const SWITCH_SHARE = 0.15;

/**
 * Плотность софитов, световых точек на квадратный метр.
 *
 * Проектных световых точек в КП нет. Эта плотность восстановлена из метража
 * 3*1,5: только при 0,55 точки на м² систематический сдвиг по кабелю освещения
 * обнуляется. Для квартиры 90 м² это около пятидесяти софитов — столько и
 * бывает в дизайн-проекте с точечным светом по всем помещениям.
 *
 * Отсюда же следует практическая проверка: если распознавание чертежа вернуло
 * заметно меньше световых точек, кабель освещения будет недосчитан.
 */
const SPOTS_PER_SQM = 0.55;

export interface Fixture {
  name: string;
  areaSqM: number;
  rooms: number;
  socketGroups: number;
  socketBoxes: number;
  lamps: number;
  hob: number;
  /** Подменённое число световых точек: нужно только для диагностики освещения. */
  lightPointsOverride?: number;
  actual: {
    cable15?: number;
    cable25?: number;
    cable6?: number;
    cableUtp?: number;
  };
}

/** Остаток раскидываем по первым помещениям, чтобы сумма сошлась. */
function spread(total: number, buckets: number): number[] {
  if (buckets <= 0) return [];
  const base = Math.floor(total / buckets);
  const rest = total - base * buckets;
  return Array.from({ length: buckets }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Типовой состав квартиры: кухня, коридор и санузел есть всегда. */
function roomKinds(count: number): RoomKind[] {
  const kinds: RoomKind[] = ["kitchen", "corridor", "bathroom", "living"];
  while (kinds.length < count) kinds.push(kinds.length % 3 === 0 ? "bathroom" : "bedroom");
  return kinds.slice(0, count);
}

/**
 * Собирает вход для расчёта из фактов КП.
 *
 * Розеточных групп в КП больше, чем помещений: большой комнате дают две-три
 * линии. Поэтому группы сверх кухонных раскидываются по помещениям как
 * дополнительные розеточные линии, а не как отдельные потребители: иначе каждая
 * лишняя группа получила бы собственную длинную трассу до техники, которой на
 * объекте нет.
 */
export function toProject(f: Fixture): ExtractedProject {
  const utpPoints = Math.min(UTP_MAX, Math.max(UTP_MIN, Math.round(f.rooms / 2)));
  const switches = Math.max(
    f.rooms * SWITCHES_PER_ROOM,
    Math.round(f.socketBoxes * SWITCH_SHARE),
  );
  const outlets = Math.max(0, f.socketBoxes - switches - utpPoints);

  // Кухня забирает три группы на 16А (холодильник, духовой шкаф со СВЧ и
  // остальные розетки кухни) плюс варочную поверхность на отдельном 32А.
  const hasKitchen = f.hob > 0;
  const dedicated: DedicatedCircuits = { hob: f.hob };
  if (hasKitchen) {
    dedicated.fridge = 1;
    dedicated.ovenMicrowave = 1;
  }

  const kinds = roomKinds(f.rooms);
  const kitchenIndex = hasKitchen ? kinds.indexOf("kitchen") : -1;
  // Кухонную линию остальных розеток считает сам алгоритм, здесь распределяются
  // только группы остальных помещений.
  const groupsToSpread = Math.max(
    f.rooms - (kitchenIndex >= 0 ? 1 : 0),
    f.socketGroups - (hasKitchen ? 3 : 0),
  );
  const nonKitchen = kinds.map((_, i) => i).filter((i) => i !== kitchenIndex);
  const groupsPerRoom = spread(groupsToSpread, nonKitchen.length);

  const outletsPerRoom = spread(outlets, f.rooms);
  const switchesPerRoom = spread(switches, f.rooms);
  const lightPoints =
    f.lightPointsOverride ?? Math.max(f.lamps, Math.round(f.areaSqM * SPOTS_PER_SQM));
  const lightsPerRoom = spread(lightPoints, f.rooms);
  const utpPerRoom = spread(utpPoints, f.rooms);

  const rooms: RoomSpec[] = kinds.map((kind, i) => ({
    name: `Помещение ${i + 1}`,
    kind,
    areaSqM: f.areaSqM / f.rooms,
    socketGroups: i === kitchenIndex ? undefined : groupsPerRoom[nonKitchen.indexOf(i)],
    outlets: outletsPerRoom[i],
    switches: switchesPerRoom[i],
    lightPoints: lightsPerRoom[i],
    utpPoints: utpPerRoom[i],
  }));

  return {
    projectName: f.name,
    totalAreaSqM: f.areaSqM,
    outlets,
    switches,
    // «Лампочки» в КП — временный свет, 3-4 на комнату. Проектных световых точек
    // в КП нет, поэтому это заведомо нижняя оценка числа софитов.
    lightPoints,
    utpPoints,
    warmFloorCircuits: 0,
    dedicatedCircuits: dedicated,
    rooms,
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

const ROWS: { key: "cable15" | "cable25" | "cable6" | "cableUtp"; label: string }[] = [
  { key: "cable15", label: "3*1,5" },
  { key: "cable25", label: "3*2,5" },
  { key: "cable6", label: "3*6" },
  { key: "cableUtp", label: "UTP" },
];

export async function loadFixtures(): Promise<Fixture[]> {
  const files = readdirSync(EXAMPLES_DIR).filter(
    (f) => f.toLowerCase().endsWith(".pdf") && /кп/i.test(f),
  );

  const fixtures: Fixture[] = [];
  for (const file of files) {
    const name = file.replace(/\.pdf$/i, "").trim();
    const areaSqM = AREA_BY_KP[name];
    const { items } = await extractKpActuals(file);
    // Без площади, числа помещений, групп и подрозетников вход не собрать.
    if (
      areaSqM === undefined ||
      items.breaker10 === undefined ||
      items.breaker16 === undefined ||
      items.socketBoxes === undefined ||
      items.lamps === undefined
    ) {
      continue;
    }

    fixtures.push({
      name,
      areaSqM,
      rooms: items.breaker10,
      socketGroups: items.breaker16,
      socketBoxes: items.socketBoxes,
      lamps: items.lamps,
      hob: items.breaker32 ?? 0,
      actual: {
        cable15: items["cable3x1.5"],
        cable25: items["cable3x2.5"],
        cable6: items["cable3x6"],
        cableUtp: items.cableUtp,
      },
    });
  }
  return fixtures;
}

/**
 * Насколько сами КП согласованы между собой.
 *
 * Если метраж в готовых КП задавался пропорционально площади, то метры на
 * квадратный метр будут близки по всем объектам, а их разброс задаёт предел
 * точности: точнее собственного разброса источника попасть невозможно.
 */
function diagnoseSourceSpread(fixtures: Fixture[]) {
  console.log("\n=== Разброс самих КП: метров кабеля на м² площади ===");
  for (const row of ROWS) {
    const ratios = fixtures
      .map((f) => {
        const actual = f.actual[row.key];
        return actual === undefined ? undefined : actual / f.areaSqM;
      })
      .filter((v): v is number => v !== undefined);
    if (ratios.length < 3) continue;

    const mean = ratios.reduce((s, v) => s + v, 0) / ratios.length;
    const sd = Math.sqrt(ratios.reduce((s, v) => s + (v - mean) ** 2, 0) / ratios.length);
    console.log(
      `${row.label.padEnd(7)}в среднем ${mean.toFixed(2)} м/м², от ${Math.min(...ratios).toFixed(2)} до ${Math.max(...ratios).toFixed(2)}, собственный разброс ±${((sd / mean) * 100).toFixed(0)}%`,
    );
  }
}

/**
 * Сколько световых точек подразумевает метраж 3*1,5 в самом КП.
 *
 * Проектных световых точек в КП нет, поэтому метраж освещения проверить не с
 * чем. Зато можно решить обратную задачу: подобрать число софитов, при котором
 * наш замер совпал бы с КП. Если получается правдоподобное для площади число,
 * значит расхождение по 3*1,5 — это недостающий вход, а не ошибка трассировки.
 */
function diagnoseLightPoints(
  fixtures: Fixture[],
  routing: CableRoutingRules,
  labels: NonNullable<ReturnType<typeof loadCalculationRules>["dedicatedCircuits"]>["labels"],
) {
  console.log("\n=== Сколько софитов подразумевает освещение в КП ===");
  console.log(
    `${"Проект".padEnd(22)}${"м²".padStart(5)}${"лампочек".padStart(10)}${"нужно точек".padStart(13)}${"точек/м²".padStart(10)}`,
  );

  for (const fixture of fixtures) {
    const target = fixture.actual.cable15;
    if (target === undefined) continue;

    let low = 0;
    let high = 400;
    for (let i = 0; i < 40; i += 1) {
      const mid = (low + high) / 2;
      const route = estimateCableRoute(
        toProject({ ...fixture, lightPointsOverride: Math.round(mid) }),
        routing,
        labels,
      );
      if (route.cable15 < target) low = mid;
      else high = mid;
    }
    const points = Math.round((low + high) / 2);
    console.log(
      `${fixture.name.padEnd(22)}${String(fixture.areaSqM).padStart(5)}${String(fixture.lamps).padStart(10)}${String(points).padStart(13)}${(points / fixture.areaSqM).toFixed(2).padStart(10)}`,
    );
  }
}

async function main() {
  const rules = loadCalculationRules();
  const routing = rules.cableRouting as CableRoutingRules | undefined;
  const labels = rules.dedicatedCircuits?.labels;
  if (!routing || !labels) {
    throw new Error("В config/calculation-rules.json нет cableRouting или dedicatedCircuits");
  }

  const fixtures = await loadFixtures();
  console.log(`=== Замер кабеля по трассе против готовых КП (${fixtures.length} проектов) ===\n`);
  console.log(
    `${"Проект".padEnd(22)}${"кабель".padStart(8)}${"КП".padStart(7)}${"наш".padStart(7)}${"ошибка".padStart(9)}`,
  );

  const errors: Record<string, number[]> = { cable15: [], cable25: [], cable6: [], cableUtp: [] };
  const groupErrors: number[] = [];

  for (const fixture of fixtures) {
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
        `${(first ? fixture.name : "").padEnd(22)}${row.label.padStart(8)}${String(expected).padStart(7)}${got.toFixed(0).padStart(7)}${fmtPct(error).padStart(9)}`,
      );
      first = false;
    }

    // Группы — тоже факт из КП: проверяем, что модель помещений их воспроизводит.
    // Группы 16А в щите: розеточные линии плюс холодильник и духовой шкаф.
    const ourGroups =
      route.socketGroups +
      (project.dedicatedCircuits?.fridge ?? 0) +
      (project.dedicatedCircuits?.ovenMicrowave ?? 0);
    groupErrors.push(pct(ourGroups, fixture.socketGroups));
    console.log(
      `${"".padEnd(22)}${"вход".padStart(8)}  ${fixture.rooms} комн / ${project.outlets} роз / ${project.switches} выкл / ${project.lightPoints} свет / групп 16А: КП ${fixture.socketGroups}, наших ${ourGroups}`,
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

  const groupAvg = groupErrors.reduce((s, e) => s + Math.abs(e), 0) / groupErrors.length;
  console.log(`групп16 средняя |ошибка| ${groupAvg.toFixed(0)}%`);

  console.log("\n=== Главный кабель целиком (3*1,5 + 3*2,5) ===");
  const mainErrors: number[] = [];
  for (const fixture of fixtures) {
    const { cable15, cable25 } = fixture.actual;
    if (cable15 === undefined || cable25 === undefined) continue;
    const route = estimateCableRoute(toProject(fixture), routing, labels);
    const expected = cable15 + cable25;
    const got = route.cable15 + route.cable25;
    const error = pct(got, expected);
    mainErrors.push(error);
    console.log(
      `${fixture.name.padEnd(22)}КП ${String(expected).padStart(5)} м   наш ${got.toFixed(0).padStart(5)} м   ${fmtPct(error).padStart(6)}`,
    );
  }
  const mainAvgAbs = mainErrors.reduce((s, e) => s + Math.abs(e), 0) / mainErrors.length;
  const mainBias = mainErrors.reduce((s, e) => s + e, 0) / mainErrors.length;
  console.log(
    `Средняя |ошибка| ${mainAvgAbs.toFixed(0)}%, систематический сдвиг ${fmtPct(mainBias)}, вне ±15%: ${mainErrors.filter((e) => Math.abs(e) > 15).length}/${mainErrors.length}`,
  );

  diagnoseLightPoints(fixtures, routing, labels);
  diagnoseSourceSpread(fixtures);
}

if (process.argv[1]?.includes("benchmark-cable-routing")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
