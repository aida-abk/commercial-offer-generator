import { loadCalculationRules } from "./catalog";
import { resolveRooms } from "./rooms";
import type {
  CableType,
  Circuit,
  CircuitPlan,
  ExtractedProject,
  RouteGeometry,
  Room,
} from "./types";

const EMPTY_CABLE: Record<CableType, number> = {
  "2x1.5": 0,
  "3x1.5": 0,
  "3x2.5": 0,
  "3x6": 0,
  utp: 0,
};

/**
 * Трасса от щита до комнаты: кабель идёт по потолку, поэтому длина растёт
 * как корень из площади объекта, а не линейно.
 */
function panelToRoomM(g: RouteGeometry, totalAreaSqM: number): number {
  return g.panelToRoomBaseM + g.panelToRoomPerSqrtAreaM * Math.sqrt(Math.max(1, totalAreaSqM));
}

/** Кабель до одной точки: разводка по комнате + спуск с потолка (всегда 3 м). */
function pointRunM(g: RouteGeometry): number {
  return g.inRoomRunPerPointM + g.dropToPointM;
}

function lightCircuit(room: Room, g: RouteGeometry, toRoom: number): Circuit | null {
  if (room.lightPoints <= 0) return null;
  const switchPlaces = room.switchesSingle + room.switchesTwoWay + room.switchesThreeWay;
  const groups = Math.max(1, Math.min(room.lightGroups, room.lightPoints));
  // Проходные: между местами управления тянется дополнительный участок.
  const twoWayLinks =
    Math.max(0, room.switchesTwoWay - 1) + Math.max(0, room.switchesThreeWay - 1);

  const meters =
    toRoom +
    switchPlaces * pointRunM(g) +
    twoWayLinks * g.twoWayLinkM +
    groups * g.inRoomRunPerPointM;

  return {
    kind: "light",
    label: `Освещение — ${room.name}`,
    roomName: room.name,
    breakerAmps: 10,
    cableType: "3x1.5",
    cableMeters: meters,
    needsRcd: false,
  };
}

/** Шлейф софит–софит внутри группы: точек в группе минус одна связь на группу. */
function lightChainM(room: Room, g: RouteGeometry): number {
  const groups = Math.max(1, Math.min(room.lightGroups, room.lightPoints));
  return Math.max(0, room.lightPoints - groups) * g.spotToSpotM;
}

/** Розетки без шлейфа — каждая своей трассой от распредкоробки. */
function socketRun(count: number, g: RouteGeometry): number {
  return Math.max(0, count) * pointRunM(g);
}

function kitchenCircuits(room: Room, g: RouteGeometry, toRoom: number): Circuit[] {
  // Кухня всегда 4 группы: варочная, холодильник, духовой шкаф + СВЧ, прочие розетки.
  const rest = Math.max(1, room.outlets - 4);
  const appliance = toRoom + g.kitchenApplianceExtraM;
  return [
    {
      kind: "kitchenHob",
      label: `Варочная поверхность — ${room.name}`,
      roomName: room.name,
      breakerAmps: 32,
      cableType: "3x6",
      cableMeters: appliance + pointRunM(g),
      needsRcd: false,
    },
    {
      kind: "kitchenFridge",
      label: `Холодильник — ${room.name}`,
      roomName: room.name,
      breakerAmps: 16,
      cableType: "3x2.5",
      cableMeters: appliance + pointRunM(g),
      needsRcd: true,
    },
    {
      kind: "kitchenOven",
      label: `Духовой шкаф + СВЧ — ${room.name}`,
      roomName: room.name,
      breakerAmps: 16,
      cableType: "3x2.5",
      cableMeters: appliance + socketRun(2, g),
      needsRcd: true,
    },
    {
      kind: "kitchenSockets",
      label: `Розетки — ${room.name}`,
      roomName: room.name,
      breakerAmps: 16,
      cableType: "3x2.5",
      cableMeters: toRoom + socketRun(rest, g),
      needsRcd: true,
    },
  ];
}

interface MergeRule {
  types: string[];
  maxPoints: number;
}

/**
 * Балкон/гардероб с парой точек не получают отдельный автомат — их кабель
 * доводится от соседней группы, поэтому линия остаётся, а автомат снимается.
 */
function mergesIntoNeighbour(room: Room, rule: MergeRule | undefined): boolean {
  if (!rule) return false;
  if (!rule.types.includes(room.type)) return false;
  return Math.max(room.outlets, room.lightPoints) <= rule.maxPoints;
}

/** Собирает все линии от щита по покомнатному составу проекта. */
export function buildCircuits(rooms: Room[], project: ExtractedProject): Circuit[] {
  const rules = loadCalculationRules();
  const g = rules.geometry;
  const mergeRule = rules.formulas.mergeSmallRooms as MergeRule | undefined;
  const area =
    project.totalAreaSqM > 0
      ? project.totalAreaSqM
      : rooms.reduce((s, r) => s + r.areaSqM, 0);
  const toRoom = panelToRoomM(g, area);
  const circuits: Circuit[] = [];

  for (const room of rooms) {
    const merged = mergesIntoNeighbour(room, mergeRule);
    const light = lightCircuit(room, g, toRoom);
    if (light) circuits.push(merged ? { ...light, breakerAmps: null, needsRcd: false } : light);

    if (room.type === "kitchen") {
      circuits.push(...kitchenCircuits(room, g, toRoom));
    } else if (room.outlets > 0) {
      // Одна комната — один автомат 16А и один кабель ВВГнг 3*2,5.
      circuits.push({
        kind: "socket",
        label: `Розетки — ${room.name}`,
        roomName: room.name,
        breakerAmps: merged ? null : 16,
        cableType: "3x2.5",
        cableMeters: toRoom + socketRun(room.outlets, g),
        needsRcd: !merged,
      });
    }

    for (let i = 0; i < room.airConditioners; i += 1) {
      circuits.push({
        kind: "airCon",
        label: `Кондиционер — ${room.name}${room.airConditioners > 1 ? ` №${i + 1}` : ""}`,
        roomName: room.name,
        breakerAmps: 16,
        cableType: "3x2.5",
        // Трасса считается до внутреннего блока.
        cableMeters: toRoom + g.airConExtraM + g.dropToPointM,
        needsRcd: true,
      });
    }

    for (let i = 0; i < room.warmFloorLoops; i += 1) {
      circuits.push({
        kind: "warmFloor",
        label: `Тёплый пол — ${room.name}${room.warmFloorLoops > 1 ? ` №${i + 1}` : ""}`,
        roomName: room.name,
        breakerAmps: 16,
        cableType: "3x2.5",
        // На каждый контур тёплого пола — отдельная группа.
        cableMeters: toRoom + g.warmFloorExtraM + pointRunM(g),
        needsRcd: true,
      });
    }

    for (let i = 0; i < room.utpPoints; i += 1) {
      circuits.push({
        kind: "utp",
        label: `UTP — ${room.name}${room.utpPoints > 1 ? ` №${i + 1}` : ""}`,
        roomName: room.name,
        breakerAmps: null,
        cableType: "utp",
        // Слаботочный щиток рядом с силовым, трасса считается от эл.щитка.
        cableMeters: toRoom + pointRunM(g),
        needsRcd: false,
      });
    }
  }

  // «Нептун» (датчик протечки воды) — отдельная линия от щита.
  if (project.leakSensor !== false) {
    circuits.push({
      kind: "leakSensor",
      label: "Датчик протечки воды («Нептун»)",
      breakerAmps: 16,
      cableType: "3x2.5",
      cableMeters: toRoom + g.leakSensorExtraM + g.dropToPointM,
      needsRcd: true,
    });
  }

  return circuits;
}

function roundMeters(value: number, step: number): number {
  if (step <= 0) return Math.round(value);
  const rounded = Math.round(value / step) * step;
  if (rounded === 0 && value > 0) return step;
  return rounded;
}

/** Временные лампочки на время стройки — 3–4 на комнату. */
function tempBulbCount(rooms: Room[]): number {
  return rooms.reduce((sum, r) => {
    if (r.lightPoints <= 0) return sum;
    return sum + (r.lightPoints >= 4 ? 4 : 3);
  }, 0);
}

/** Собирает щит: автоматы, УЗО, ширина корпуса в модулях. */
function buildPanel(circuits: Circuit[]) {
  const rules = loadCalculationRules();
  const w = rules.panelModuleWidths;

  const breakers10a = circuits.filter((c) => c.breakerAmps === 10).length;
  const breakers16a = circuits.filter((c) => c.breakerAmps === 16).length;
  const breakers32a = circuits.filter((c) => c.breakerAmps === 32).length;
  const rcdGroups = circuits.filter((c) => c.needsRcd).length;

  // На одно УЗО подвязываются 3–4 автомата 16А.
  const rcdRule = rules.formulas.rcd as { perSocketGroups?: number; min?: number } | undefined;
  const perRcd = rcdRule?.perSocketGroups ?? 4;
  const rcdCount = Math.max(rcdRule?.min ?? 1, Math.ceil(rcdGroups / perRcd));

  const rbdCount =
    (rules.fixedItems.terminalRed ?? 0) + (rules.fixedItems.terminalBlue ?? 0);

  const usedModules =
    w.inputBreaker2p +
    w.voltageRelay +
    w.contactor +
    rcdCount * w.rcd +
    (breakers10a + breakers16a + breakers32a) * w.breaker1p +
    rbdCount * w.terminalRbd;

  // Корпус подбирается по факту + свободный запас.
  const needed = Math.ceil(usedModules + w.spare);
  const panelSize = w.sizes.find((size) => size >= needed) ?? w.sizes[w.sizes.length - 1];

  return {
    breakers10a,
    breakers16a,
    breakers32a,
    rcdCount,
    panelModules: Math.ceil(usedModules),
    panelSize,
  };
}

export function buildCircuitPlan(project: ExtractedProject): CircuitPlan {
  const rules = loadCalculationRules();
  const g = rules.geometry;
  const r = rules.rounding;
  const rooms = resolveRooms(project);
  const circuits = buildCircuits(rooms, project);

  const raw: Record<CableType, number> = { ...EMPTY_CABLE };
  for (const circuit of circuits) {
    raw[circuit.cableType] += circuit.cableMeters;
  }
  // Шлейф софит–софит идёт кабелем 2*1,5.
  raw["2x1.5"] += rooms.reduce((sum, room) => sum + lightChainM(room, g), 0);

  const waste = 1 + g.wasteFactor;
  const cableMeters: Record<CableType, number> = {
    "2x1.5": roundMeters(raw["2x1.5"] * waste, r.cableMeters),
    "3x1.5": roundMeters(raw["3x1.5"] * waste, r.cableMeters),
    "3x2.5": roundMeters(raw["3x2.5"] * waste, r.cableMeters),
    "3x6": roundMeters(raw["3x6"] * waste, r.cable6Meters ?? 1),
    utp: roundMeters(raw.utp * waste, r.utpMeters ?? r.cableMeters),
  };

  const panel = buildPanel(circuits);

  const socketPoints = rooms.reduce((s, r2) => s + r2.outlets, 0);
  const switchPoints = rooms.reduce(
    (s, r2) => s + r2.switchesSingle + r2.switchesTwoWay + r2.switchesThreeWay,
    0,
  );

  return {
    rooms,
    circuits,
    cableMeters,
    ...panel,
    inputBreakers: 1,
    socketPoints,
    switchPoints,
    lightPoints: rooms.reduce((s, r2) => s + r2.lightPoints, 0),
    utpPoints: rooms.reduce((s, r2) => s + r2.utpPoints, 0),
    tempBulbs: tempBulbCount(rooms),
  };
}
