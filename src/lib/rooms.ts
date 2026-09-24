import type { ExtractedProject, Room, RoomType } from "./types";

/** Профиль помещения: как оно ведёт себя при восстановлении состава из агрегатов. */
interface RoomProfile {
  /** Вес при распределении розеток (умножается на площадь). */
  outletWeight: number;
  /** Точек света на м². */
  lightPerSqM: number;
  /** Минимум точек света. */
  minLights: number;
  /** Групп света (мест управления). */
  lightGroups: number;
  /** Проходные выключатели — коридор и спальня. */
  twoWay: boolean;
  /** Эл. тёплый пол по умолчанию. */
  warmFloorLoops: number;
  /** Точки UTP (ТВ-зоны и кабинет). */
  utpPoints: number;
  /** Внутренние блоки кондиционера. */
  airConditioners: number;
}

const PROFILES: Record<RoomType, RoomProfile> = {
  kitchen: { outletWeight: 1.6, lightPerSqM: 0.22, minLights: 4, lightGroups: 2, twoWay: false, warmFloorLoops: 1, utpPoints: 0, airConditioners: 0 },
  living: { outletWeight: 1.4, lightPerSqM: 0.2, minLights: 4, lightGroups: 2, twoWay: false, warmFloorLoops: 0, utpPoints: 1, airConditioners: 1 },
  bedroom: { outletWeight: 1.2, lightPerSqM: 0.18, minLights: 3, lightGroups: 2, twoWay: true, warmFloorLoops: 0, utpPoints: 0, airConditioners: 1 },
  office: { outletWeight: 1.3, lightPerSqM: 0.18, minLights: 3, lightGroups: 1, twoWay: false, warmFloorLoops: 0, utpPoints: 1, airConditioners: 0 },
  hallway: { outletWeight: 0.5, lightPerSqM: 0.25, minLights: 3, lightGroups: 1, twoWay: true, warmFloorLoops: 0, utpPoints: 0, airConditioners: 0 },
  bathroom: { outletWeight: 0.5, lightPerSqM: 0.3, minLights: 2, lightGroups: 1, twoWay: false, warmFloorLoops: 1, utpPoints: 0, airConditioners: 0 },
  balcony: { outletWeight: 0.3, lightPerSqM: 0.15, minLights: 1, lightGroups: 1, twoWay: false, warmFloorLoops: 0, utpPoints: 0, airConditioners: 0 },
  utility: { outletWeight: 0.4, lightPerSqM: 0.2, minLights: 1, lightGroups: 1, twoWay: false, warmFloorLoops: 0, utpPoints: 0, airConditioners: 0 },
  other: { outletWeight: 1, lightPerSqM: 0.18, minLights: 2, lightGroups: 1, twoWay: false, warmFloorLoops: 0, utpPoints: 0, airConditioners: 0 },
};

export function roomProfile(type: RoomType): RoomProfile {
  return PROFILES[type] ?? PROFILES.other;
}

const NAME_PATTERNS: [RegExp, RoomType][] = [
  [/кухн|kitchen|ас\s?уй|асхана/i, "kitchen"],
  [/гостин|зал|living|қонақ/i, "living"],
  [/спальн|детск|bedroom|жатын/i, "bedroom"],
  [/кабинет|office|рабоч/i, "office"],
  [/коридор|прихож|холл|тамбур|hall|проход/i, "hallway"],
  [/санузел|с\.?у\.?|ванн|туалет|душев|bath|wc/i, "bathroom"],
  [/балкон|лодж|терас|balcon/i, "balcony"],
  [/гардероб|кладов|постир|котель|техн|склад|utility/i, "utility"],
];

/** Нормализация типа комнаты по названию из дизайн-проекта. */
export function roomTypeFromName(name: string, fallback: RoomType = "other"): RoomType {
  for (const [pattern, type] of NAME_PATTERNS) {
    if (pattern.test(name)) return type;
  }
  return fallback;
}

let roomIdCounter = 0;
export function nextRoomId(): string {
  roomIdCounter += 1;
  return `room-${Date.now().toString(36)}-${roomIdCounter}`;
}

export function makeRoom(init: Partial<Room> & { name: string; type: RoomType; areaSqM: number }): Room {
  const profile = roomProfile(init.type);
  const lightPoints =
    init.lightPoints ?? Math.max(profile.minLights, Math.round(init.areaSqM * profile.lightPerSqM));
  const lightGroups = init.lightGroups ?? Math.min(profile.lightGroups, Math.max(1, lightPoints));
  const twoWay = init.switchesTwoWay ?? (profile.twoWay ? 2 : 0);
  const single = init.switchesSingle ?? Math.max(0, lightGroups - (twoWay > 0 ? 1 : 0));
  return {
    id: init.id ?? nextRoomId(),
    name: init.name,
    type: init.type,
    areaSqM: init.areaSqM,
    outlets: init.outlets ?? Math.max(1, Math.round(init.areaSqM * profile.outletWeight * 0.45)),
    lightPoints,
    lightGroups,
    switchesSingle: single,
    switchesTwoWay: twoWay,
    switchesThreeWay: init.switchesThreeWay ?? 0,
    warmFloorLoops: init.warmFloorLoops ?? profile.warmFloorLoops,
    airConditioners: init.airConditioners ?? profile.airConditioners,
    utpPoints: init.utpPoints ?? profile.utpPoints,
  };
}

/** Типовой состав квартиры по общей площади (включая балконы, санузлы, тех.помещения). */
function planComposition(totalAreaSqM: number): { name: string; type: RoomType; share: number }[] {
  const bedrooms = totalAreaSqM < 45 ? 0 : totalAreaSqM < 70 ? 1 : totalAreaSqM < 95 ? 2 : totalAreaSqM < 140 ? 3 : 4;
  const rooms: { name: string; type: RoomType; share: number }[] = [
    { name: "Кухня", type: "kitchen", share: 0.14 },
    { name: "Гостиная", type: "living", share: 0.22 },
    { name: "Коридор", type: "hallway", share: 0.12 },
    { name: "Санузел", type: "bathroom", share: 0.07 },
  ];
  for (let i = 0; i < bedrooms; i += 1) {
    rooms.push({ name: bedrooms > 1 ? `Спальня ${i + 1}` : "Спальня", type: "bedroom", share: 0.15 });
  }
  if (totalAreaSqM >= 95) rooms.push({ name: "Санузел 2", type: "bathroom", share: 0.05 });
  if (totalAreaSqM >= 60) rooms.push({ name: "Балкон", type: "balcony", share: 0.05 });
  if (totalAreaSqM >= 110) rooms.push({ name: "Гардеробная", type: "utility", share: 0.05 });
  return rooms;
}

/** Пропорционально подгоняет набор чисел под заданную сумму, сохраняя минимум 0. */
function scaleToTotal(values: number[], target: number): number[] {
  const current = values.reduce((s, v) => s + v, 0);
  if (target <= 0 || current <= 0) return values;
  const scaled = values.map((v) => Math.max(0, Math.round((v * target) / current)));
  let diff = target - scaled.reduce((s, v) => s + v, 0);
  // Остаток раскидываем по самым крупным помещениям.
  const order = values.map((v, i) => i).sort((a, b) => values[b] - values[a]);
  let cursor = 0;
  while (diff !== 0 && order.length > 0) {
    const idx = order[cursor % order.length];
    if (diff > 0) {
      scaled[idx] += 1;
      diff -= 1;
    } else if (scaled[idx] > 0) {
      scaled[idx] -= 1;
      diff += 1;
    }
    cursor += 1;
    if (cursor > order.length * 200) break;
  }
  return scaled;
}

/**
 * Восстанавливает покомнатный состав из агрегатов — для КП, сохранённых до
 * перехода на покомнатную модель, и для ручного ввода без разбивки по комнатам.
 */
export function synthesizeRooms(project: ExtractedProject): Room[] {
  const area = project.totalAreaSqM > 0 ? project.totalAreaSqM : 60;
  const composition = planComposition(area);
  const shareSum = composition.reduce((s, r) => s + r.share, 0);

  const rooms = composition.map((r) =>
    makeRoom({ name: r.name, type: r.type, areaSqM: Math.round((area * r.share) / shareSum) }),
  );

  if (project.outlets > 0) {
    const weights = rooms.map((r) => r.areaSqM * roomProfile(r.type).outletWeight);
    const scaled = scaleToTotal(weights, project.outlets);
    rooms.forEach((r, i) => {
      r.outlets = Math.max(r.type === "balcony" || r.type === "utility" ? 0 : 1, scaled[i]);
    });
  }

  if (project.lightPoints > 0) {
    const scaled = scaleToTotal(rooms.map((r) => r.lightPoints), project.lightPoints);
    rooms.forEach((r, i) => {
      r.lightPoints = Math.max(1, scaled[i]);
      r.lightGroups = Math.min(r.lightGroups, r.lightPoints);
    });
  }

  if (project.switches > 0) {
    const current = rooms.reduce((s, r) => s + r.switchesSingle + r.switchesTwoWay + r.switchesThreeWay, 0);
    let extra = project.switches - current;
    // Недостающие/лишние места управления добавляем обычными выключателями.
    const order = rooms.map((_, i) => i).sort((a, b) => rooms[b].lightPoints - rooms[a].lightPoints);
    let cursor = 0;
    while (extra !== 0 && cursor < order.length * 200) {
      const room = rooms[order[cursor % order.length]];
      if (extra > 0) {
        room.switchesSingle += 1;
        // Групп света не может быть больше, чем самих точек.
        room.lightGroups = Math.min(room.lightPoints, room.lightGroups + 1);
        extra -= 1;
      } else if (room.switchesSingle > 0) {
        room.switchesSingle -= 1;
        room.lightGroups = Math.max(1, room.lightGroups - 1);
        extra += 1;
      }
      cursor += 1;
    }
  }

  rooms.forEach((r) => {
    r.lightGroups = Math.max(1, Math.min(r.lightGroups, r.lightPoints));
  });

  const utpTarget = project.utpPoints;
  if (utpTarget >= 0) {
    const preferred = rooms
      .map((r, i) => ({ i, rank: r.type === "living" ? 0 : r.type === "office" ? 1 : r.type === "bedroom" ? 2 : 3 }))
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.i);
    rooms.forEach((r) => {
      r.utpPoints = 0;
    });
    for (let n = 0; n < utpTarget; n += 1) {
      rooms[preferred[n % preferred.length]].utpPoints += 1;
    }
  }

  if (project.warmFloorCircuits > 0) {
    const bathrooms = rooms.filter((r) => r.type === "bathroom" || r.type === "kitchen");
    rooms.forEach((r) => {
      r.warmFloorLoops = 0;
    });
    for (let n = 0; n < project.warmFloorCircuits; n += 1) {
      const target = bathrooms[n % Math.max(1, bathrooms.length)] ?? rooms[0];
      target.warmFloorLoops += 1;
    }
  }

  if (typeof project.airConditioners === "number") {
    const preferred = rooms.filter((r) => r.type === "living" || r.type === "bedroom" || r.type === "office");
    rooms.forEach((r) => {
      r.airConditioners = 0;
    });
    for (let n = 0; n < project.airConditioners; n += 1) {
      const target = preferred[n % Math.max(1, preferred.length)] ?? rooms[0];
      target.airConditioners += 1;
    }
  }

  return rooms;
}

/** Комнаты проекта: из дизайн-проекта, иначе восстановленные из агрегатов. */
export function resolveRooms(project: ExtractedProject): Room[] {
  if (project.rooms && project.rooms.length > 0) return project.rooms;
  return synthesizeRooms(project);
}

export interface RoomAggregates {
  totalAreaSqM: number;
  outlets: number;
  switches: number;
  lightPoints: number;
  utpPoints: number;
  warmFloorCircuits: number;
  airConditioners: number;
}

/** Агрегаты из покомнатного состава — для совместимости с прежним форматом КП. */
export function aggregateRooms(rooms: Room[]): RoomAggregates {
  return rooms.reduce<RoomAggregates>(
    (acc, r) => ({
      totalAreaSqM: acc.totalAreaSqM + r.areaSqM,
      outlets: acc.outlets + r.outlets,
      switches: acc.switches + r.switchesSingle + r.switchesTwoWay + r.switchesThreeWay,
      lightPoints: acc.lightPoints + r.lightPoints,
      utpPoints: acc.utpPoints + r.utpPoints,
      warmFloorCircuits: acc.warmFloorCircuits + r.warmFloorLoops,
      airConditioners: acc.airConditioners + r.airConditioners,
    }),
    { totalAreaSqM: 0, outlets: 0, switches: 0, lightPoints: 0, utpPoints: 0, warmFloorCircuits: 0, airConditioners: 0 },
  );
}

/** Синхронизирует агрегаты проекта с покомнатным составом. */
export function withRoomAggregates(project: ExtractedProject): ExtractedProject {
  if (!project.rooms || project.rooms.length === 0) return project;
  const agg = aggregateRooms(project.rooms);
  return {
    ...project,
    outlets: agg.outlets,
    switches: agg.switches,
    lightPoints: agg.lightPoints,
    utpPoints: agg.utpPoints,
    warmFloorCircuits: agg.warmFloorCircuits,
    airConditioners: agg.airConditioners,
    // Площадь объекта берётся общая — если из проекта пришла своя, она приоритетнее.
    totalAreaSqM: project.totalAreaSqM > 0 ? project.totalAreaSqM : agg.totalAreaSqM,
  };
}
