import type {
  CableRouteEstimate,
  CableRouteLeg,
  CableRoutingRules,
  DedicatedCircuits,
  DedicatedCircuitRules,
  ExtractedProject,
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

  return Array.from({ length: count }, (_, i) => ({
    name: `Помещение ${i + 1}`,
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
  const order: (keyof DedicatedCircuits)[] = [
    "fridge",
    "freezer",
    "airConditioners",
    "hob",
    "ovenMicrowave",
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

  const legs: CableRouteLeg[] = [];
  let cable15 = 0;
  let cable25 = 0;
  let cableUtp = 0;

  for (const room of rooms) {
    const perimeter = roomPerimeter(room, fallbackRoomArea);
    const step = perimeter / Math.max(rules.pointsForFullLap, 1);
    const panelToBox = room.panelToBoxMeters ?? defaultPanelToRoom;
    const drop = room.dropMeters ?? rules.defaultDropMeters;

    if (room.outlets > 0) {
      const horizontal = lapLength(perimeter, room.outlets, rules.pointsForFullLap);
      const drops = room.outlets * drop;
      const total = panelToBox + horizontal + drops;
      cable25 += total;
      legs.push({
        label: `${room.name}: розетки`,
        panelToBoxMeters: panelToBox,
        horizontalMeters: horizontal,
        dropMeters: drops,
        pointCount: room.outlets,
        totalMeters: total,
      });
    }

    if (room.lightPoints > 0 || room.switches > 0) {
      // Светильники на потолке — спуск минимальный, выключатели на стене — полный.
      const horizontal =
        lapLength(perimeter, room.lightPoints, rules.pointsForFullLap) +
        room.switches * step;
      const drops = room.lightPoints * rules.lightDropMeters + room.switches * drop;
      const total = panelToBox + horizontal + drops;
      cable15 += total;
      legs.push({
        label: `${room.name}: свет и выключатели`,
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
  const circuits = resolveDedicatedCircuits(project);
  let cable6 = 0;
  for (const row of listDedicatedCircuits(circuits, dedicatedLabels)) {
    const runLength = defaultPanelToRoom + rules.defaultDropMeters;
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
  };
}
