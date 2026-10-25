import type {
  CableRouteEstimate,
  CableRouteLeg,
  CableRoutingRules,
  DedicatedCircuits,
  DedicatedCircuitRules,
  ExtractedProject,
  RoomKind,
  RoomSpec,
} from "./types";

/**
 * Замер кабеля по трассе, как считает электрик на объекте.
 *
 * От щита кабель идёт по потолку и вдоль стен до распределительной коробки
 * помещения, оттуда по стенам до точки и спуск вниз, дальше до следующей точки
 * и снова спуск. Прокладка только по двум осям — диагоналей не бывает, поэтому
 * все расстояния складываются, а не берутся по гипотенузе.
 *
 * Кабели группируются по помещениям: в каждом своя распределительная коробка.
 */

/**
 * Трасса от щита до распределительной коробки помещения, когда её нет на чертеже.
 *
 * Щит стоит у входа, поэтому в любой трассе есть постоянная часть — подъём от
 * щита к потолку и выход из прихожей, — и часть, растущая с линейным размером
 * квартиры. Обе части откалиброваны по кабелю 3*6 из готовых КП: это одна
 * группа варочной поверхности, то есть прямой замер одной трассы без примесей.
 */
function estimatePanelToRoom(totalAreaSqM: number, rules: CableRoutingRules): number {
  const span = Math.sqrt(Math.max(totalAreaSqM, 1));
  const length =
    rules.panelToRoomBaseMeters + rules.panelToRoomPerSpanMeters * span;
  return clamp(length, rules.panelToRoomMinMeters, rules.panelToRoomMaxMeters);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roomPerimeter(room: RoomSpec, fallbackAreaSqM: number): number {
  if (room.widthMeters && room.lengthMeters) {
    return 2 * (room.widthMeters + room.lengthMeters);
  }
  const area = room.areaSqM ?? fallbackAreaSqM;
  return 4 * Math.sqrt(Math.max(area, 1));
}

/**
 * Разбрасывает общее количество точек по помещениям, когда поэтажной разбивки нет.
 * Остаток отдаём первым помещениям, чтобы сумма совпала с исходной.
 */
function spread(total: number, buckets: number): number[] {
  if (buckets <= 0) return [];
  const base = Math.floor(total / buckets);
  const remainder = total - base * buckets;
  return Array.from({ length: buckets }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Типовой состав квартиры, когда помещения восстанавливаются из площади.
 * Кухня, коридор и санузел есть всегда, дальше добавляются гостиная и спальни.
 * Тип важен: на кухню уходит четыре розеточные группы, а в коридоре и спальне
 * проектируют проходные выключатели.
 */
function synthesizeRoomKinds(count: number): RoomKind[] {
  const kinds: RoomKind[] = ["kitchen", "corridor", "bathroom", "living"];
  while (kinds.length < count) {
    kinds.push(kinds.length % 3 === 0 ? "bathroom" : "bedroom");
  }
  return kinds.slice(0, count);
}

function synthesizeRooms(
  project: ExtractedProject,
  rules: CableRoutingRules,
  genericOutlets: number,
): RoomSpec[] {
  const count = Math.max(
    rules.minRooms,
    Math.round(project.totalAreaSqM / rules.defaultRoomAreaSqM) || rules.minRooms,
  );
  const outlets = spread(genericOutlets, count);
  const switches = spread(project.switches, count);
  const lights = spread(project.lightPoints, count);
  const utp = spread(project.utpPoints, count);
  const roomArea = project.totalAreaSqM / count;
  const kinds = synthesizeRoomKinds(count);

  return Array.from({ length: count }, (_, i) => ({
    name: `Помещение ${i + 1}`,
    kind: kinds[i],
    areaSqM: roomArea,
    outlets: outlets[i],
    switches: switches[i],
    lightPoints: lights[i],
    utpPoints: utp[i],
  }));
}

/**
 * Длина разводки внутри помещения. Точки стоят вдоль стен, поэтому шлейф на
 * pointsForFullLap точек обходит помещение по периметру, а для меньшего числа
 * точек трасса пропорционально короче.
 */
function lapLength(perimeter: number, points: number, pointsForFullLap: number): number {
  if (points <= 0) return 0;
  return perimeter * Math.min(1, points / Math.max(pointsForFullLap, 1));
}

/**
 * Шлейф по софитам: от светильника к светильнику.
 *
 * В отличие от розеток, софиты не разнесены по периметру, а идут цепочкой, и
 * цепочка тем длиннее, чем больше светильников. Поэтому ограничения одним
 * обходом помещения здесь нет: двадцать софитов — это вдвое больше кабеля, чем
 * десять.
 */
function chainLength(step: number, points: number): number {
  return points <= 0 ? 0 : step * points;
}

/**
 * Блоки точек и метраж спусков к ним.
 *
 * Розетки и выключатели ставят блоками по несколько штук в ряд. Спуск с
 * потолка на такой блок один, а внутри блока подрозетники соединены короткими
 * перемычками. Поэтому подрозетников в смете всегда больше, чем спусков.
 */
function blockDrops(
  points: number,
  dropMeters: number,
  rules: CableRoutingRules,
): { blocks: number; meters: number } {
  if (points <= 0) return { blocks: 0, meters: 0 };
  const blocks = Math.ceil(points / Math.max(rules.socketsPerDrop, 1));
  return {
    blocks,
    meters: blocks * dropMeters + (points - blocks) * rules.blockJumpMeters,
  };
}

/**
 * Сколько розеток из общего количества занято потребителями с отдельной группой.
 * Варочная поверхность и тёплый пол подключаются напрямую, розетки не занимают,
 * поэтому в вычет не идут.
 */
export function outletBackedDedicatedCount(circuits: DedicatedCircuits): number {
  return (
    (circuits.fridge ?? 0) +
    (circuits.freezer ?? 0) +
    (circuits.airConditioners ?? 0) +
    (circuits.ovenMicrowave ?? 0)
  );
}

/**
 * Кухонные потребители, которые уже уехали в отдельные группы: варочная
 * поверхность, холодильник и духовой шкаф со СВЧ. Вместе с группой остальных
 * кухонных розеток они дают те четыре кабеля, которые всегда идут на кухню.
 */
function kitchenDedicatedCount(circuits: DedicatedCircuits): number {
  return (circuits.hob ?? 0) + (circuits.fridge ?? 0) + (circuits.ovenMicrowave ?? 0);
}

/**
 * Сколько розеточных линий уходит от щита в помещение.
 *
 * В обычной комнате одна. На кухню идут всегда четыре кабеля, но часть из них
 * — это отдельные группы техники. Если на чертеже нашли не всю кухонную
 * технику, недостающие линии добираются группами кухонных розеток, иначе кухня
 * оказалась бы недосчитана.
 *
 * Правило включается только при признаках кухни — хотя бы одном найденном
 * кухонном потребителе. Иначе в офисе, где кухни нет, помещение, восстановленное
 * из площади, получило бы четыре лишние линии.
 */
function socketLegsForRoom(
  room: RoomSpec,
  circuits: DedicatedCircuits,
  rules: CableRoutingRules,
): number {
  const kitchenDedicated = kitchenDedicatedCount(circuits);
  if (room.kind === "kitchen" && kitchenDedicated > 0) {
    return Math.max(1, rules.kitchenSocketGroups - kitchenDedicated);
  }
  return Math.max(1, room.socketGroups ?? 1);
}

/**
 * Приводит проект к набору отдельных групп. Тёплый пол исторически задавался
 * полем warmFloorCircuits, поэтому подхватываем и его.
 */
export function resolveDedicatedCircuits(project: ExtractedProject): DedicatedCircuits {
  const explicit = project.dedicatedCircuits ?? {};
  return {
    ...explicit,
    warmFloor: explicit.warmFloor ?? project.warmFloorCircuits ?? 0,
  };
}

/** Перечисляет отдельные группы построчно — для щита и для расшифровки. */
export function listDedicatedCircuits(
  circuits: DedicatedCircuits,
  labels: DedicatedCircuitRules["labels"],
): { key: keyof DedicatedCircuits; label: string; count: number; cable6: boolean }[] {
  // Порядок как в щите: сначала кухня, затем климат, протечка и тёплый пол.
  const order: (keyof DedicatedCircuits)[] = [
    "hob",
    "fridge",
    "ovenMicrowave",
    "freezer",
    "airConditioners",
    "leakSensor",
    "warmFloor",
  ];
  return order
    .map((key) => ({
      key,
      label: labels[key] ?? key,
      count: circuits[key] ?? 0,
      cable6: key === "hob",
    }))
    .filter((row) => row.count > 0);
}

export function estimateCableRoute(
  project: ExtractedProject,
  rules: CableRoutingRules,
  dedicatedLabels: DedicatedCircuitRules["labels"],
): CableRouteEstimate {
  const providedRooms = project.rooms?.filter(
    (r) => r.outlets + r.switches + r.lightPoints + r.utpPoints > 0,
  );
  const roomsEstimated = !providedRooms?.length;
  // Розетки потребителей с отдельной группой уходят в свои линии от щита,
  // поэтому из шлейфов по помещениям их надо вычесть.
  const genericOutlets = Math.max(
    0,
    project.outlets - outletBackedDedicatedCount(resolveDedicatedCircuits(project)),
  );
  const rooms = roomsEstimated
    ? synthesizeRooms(project, rules, genericOutlets)
    : providedRooms!;
  const fallbackRoomArea = project.totalAreaSqM / Math.max(rooms.length, 1);
  const defaultPanelToRoom = estimatePanelToRoom(project.totalAreaSqM, rules);

  const circuits = resolveDedicatedCircuits(project);
  const legs: CableRouteLeg[] = [];
  let cable15 = 0;
  let cable25 = 0;
  let cableUtp = 0;
  let socketLegCount = 0;
  let lightLegCount = 0;

  for (const room of rooms) {
    const perimeter = roomPerimeter(room, fallbackRoomArea);
    const step = perimeter / Math.max(rules.pointsForFullLap, 1);
    const panelToBox = room.panelToBoxMeters ?? defaultPanelToRoom;
    const drop = room.dropMeters ?? rules.defaultDropMeters;

    if (room.outlets > 0) {
      // Розетки идут не шлейфом, а от распределительных коробок: коробки связаны
      // между собой по стенам, а к каждой розетке от коробки свой спуск.
      // Каждая розеточная линия — своя трасса от щита, поэтому кухня с её
      // несколькими группами считается по каждой линии отдельно.
      const legCount = socketLegsForRoom(room, circuits, rules);
      const perLeg = spread(room.outlets, legCount).filter((n) => n > 0);

      for (const [index, outlets] of perLeg.entries()) {
        const { blocks, meters: drops } = blockDrops(outlets, drop, rules);
        const horizontal = lapLength(perimeter, blocks, rules.pointsForFullLap);
        const total = panelToBox + horizontal + drops;
        cable25 += total;
        socketLegCount += 1;
        legs.push({
          label:
            perLeg.length > 1
              ? `${room.name}: розетки, группа ${index + 1}`
              : `${room.name}: розетки`,
          panelToBoxMeters: panelToBox,
          horizontalMeters: horizontal,
          dropMeters: drops,
          pointCount: outlets,
          totalMeters: total,
        });
      }
    }

    if (room.lightPoints > 0 || room.switches > 0) {
      // Софиты одной группы связаны шлейфом от светильника к светильнику, спуск
      // на подключение минимальный. Выключатели на стене — полный спуск.
      // В коридоре и спальне ставят проходные выключатели: второй добавляет
      // подъём от первого, трассу по потолку и спуск к себе.
      const twoWay =
        room.switches > 0 &&
        room.kind !== undefined &&
        rules.twoWaySwitchRoomKinds.includes(room.kind);

      // Выключатели тоже ставят блоками: на двухклавишный блок спуск один.
      const switchBlocks = blockDrops(room.switches, drop, rules);

      const horizontal =
        chainLength(step, room.lightPoints) +
        switchBlocks.blocks * step +
        (twoWay ? step : 0);
      const drops =
        room.lightPoints * rules.lightDropMeters +
        switchBlocks.meters +
        (twoWay ? 2 * drop : 0);
      const total = panelToBox + horizontal + drops;
      cable15 += total;
      lightLegCount += 1;
      legs.push({
        label: `${room.name}: свет и выключатели${twoWay ? " (проходные)" : ""}`,
        panelToBoxMeters: panelToBox,
        horizontalMeters: horizontal,
        dropMeters: drops,
        pointCount: room.lightPoints + room.switches,
        totalMeters: total,
      });
    }

    if (room.utpPoints > 0) {
      // Слаботочка разводится звездой: своя линия на каждую розетку. Обхода по
      // помещению у такой линии нет — трасса до помещения уже ведёт к точке.
      const horizontal = rules.utpHomeRun
        ? 0
        : lapLength(perimeter, room.utpPoints, rules.pointsForFullLap);
      const drops = room.utpPoints * drop;
      const total = rules.utpHomeRun
        ? room.utpPoints * panelToBox + drops
        : panelToBox + horizontal + drops;
      cableUtp += total;
      legs.push({
        label: `${room.name}: UTP`,
        panelToBoxMeters: rules.utpHomeRun ? room.utpPoints * panelToBox : panelToBox,
        horizontalMeters: horizontal,
        dropMeters: drops,
        pointCount: room.utpPoints,
        totalMeters: total,
      });
    }
  }

  // Отдельные группы идут от щита напрямую к потребителю.
  let cable6 = 0;
  for (const row of listDedicatedCircuits(circuits, dedicatedLabels)) {
    // Кабель 3*6 берут куском: трасса до кухни короче минимального заказа.
    const runLength = row.cable6
      ? Math.max(
          defaultPanelToRoom + rules.defaultDropMeters,
          rules.cable6MinMetersPerCircuit,
        )
      : defaultPanelToRoom + rules.defaultDropMeters;
    const total = row.count * runLength;
    if (row.cable6) cable6 += total;
    else cable25 += total;
    legs.push({
      label: `Отдельная группа: ${row.label}`,
      panelToBoxMeters: row.count * defaultPanelToRoom,
      horizontalMeters: 0,
      dropMeters: row.count * rules.defaultDropMeters,
      pointCount: row.count,
      totalMeters: total,
    });
  }

  const waste = rules.wasteFactor;
  return {
    cable15: cable15 * waste,
    cable25: cable25 * waste,
    cable6: cable6 * waste,
    cableUtp: cableUtp * waste,
    legs,
    roomsEstimated,
    roomCount: rooms.length,
    socketGroups: socketLegCount,
    lightGroups: lightLegCount,
  };
}
