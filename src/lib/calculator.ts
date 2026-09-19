import {
  estimateCableRoute,
  listDedicatedCircuits,
  outletBackedDedicatedCount,
  resolveDedicatedCircuits,
} from "./cable-routing";
import {
  findCatalogItem,
  loadCalculationRules,
  loadPanelBrands,
  loadPriceCatalog,
} from "./catalog";
import type {
  BrandVariants,
  CableRouteEstimate,
  CableRoutingRules,
  CalculationResult,
  DedicatedCircuitRules,
  ExtractedProject,
  LineItem,
  MultiBrandCalculationResult,
  PanelBrandConfig,
  PanelBrandId,
} from "./types";
import { PANEL_BRAND_IDS } from "./types";

export function roundTo(value: number, step: number): number {
  if (step <= 0) return Math.round(value);
  return Math.ceil(value / step) * step;
}

/** Round to nearest step (used for cable meters in КП examples). */
export function roundNearest(value: number, step: number): number {
  if (step <= 0) return Math.round(value);
  const rounded = Math.round(value / step) * step;
  if (rounded === 0 && value > 0) return step;
  return rounded;
}

const DEFAULT_ROUTING: CableRoutingRules = {
  enabled: true,
  defaultDropMeters: 3,
  lightDropMeters: 0.5,
  defaultRoomAreaSqM: 18,
  minRooms: 3,
  pointsForFullLap: 4,
  defaultCeilingHeightMeters: 2.7,
  panelToRoomMinMeters: 5,
  panelToRoomMaxMeters: 25,
  wasteFactor: 1.1,
  utpHomeRun: true,
};

const DEFAULT_DEDICATED: DedicatedCircuitRules = {
  standardAmps: 16,
  hobAmps: 32,
  labels: {
    fridge: "Холодильник",
    freezer: "Морозильник",
    airConditioners: "Кондиционер",
    hob: "Варочная поверхность",
    ovenMicrowave: "Духовой шкаф + СВЧ",
    warmFloor: "Тёплый пол",
  },
};

function lineFromCatalog(
  section: "materials" | "panel",
  catalogId: string,
  quantity: number,
): LineItem | null {
  const item = findCatalogItem(section, catalogId);
  if (!item || quantity <= 0) return null;
  const qty = quantity;
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    quantity: qty,
    unitPrice: item.price,
    total: qty * item.price,
    section,
  };
}

function laborPriceForArea(areaSqM: number): number {
  const rules = loadCalculationRules();
  if (rules.laborPerSqM) {
    const step = rules.laborRoundTo ?? 10_000;
    const raw = areaSqM * rules.laborPerSqM;
    return Math.round(raw / step) * step;
  }
  const { laborTiers } = rules;
  const tier = laborTiers.find((t) => areaSqM <= t.maxAreaSqM);
  return tier?.price ?? laborTiers[laborTiers.length - 1]?.price ?? 0;
}

type NumericRecord = Record<string, number>;

function num(obj: unknown, key: string, fallback = 0): number {
  if (typeof obj !== "object" || obj === null) return fallback;
  const v = (obj as NumericRecord)[key];
  return typeof v === "number" ? v : fallback;
}

function computeQuantities(project: ExtractedProject) {
  const rules = loadCalculationRules();
  const f = rules.formulas;
  const r = rules.rounding;
  const area = project.totalAreaSqM;
  const outlets = project.outlets;
  const switches = project.switches;
  const lights = project.lightPoints;
  const utp = project.utpPoints;
  const warmFloor = project.warmFloorCircuits;

  const cable2x15Raw =
    num(f["cable2x1.5"], "base") + num(f["cable2x1.5"], "perLight") * lights;

  const cable15Raw =
    num(f["cable3x1.5"], "base") +
    num(f["cable3x1.5"], "perSwitch") * switches +
    num(f["cable3x1.5"], "perLight") * lights +
    num(f["cable3x1.5"], "perAreaSqM") * area +
    (area > 100 ? (area - 100) * num(f["cable3x1.5"], "largeAreaBonusPerSqM", 0) : 0);

  const cable25Raw =
    num(f["cable3x2.5"], "base") +
    num(f["cable3x2.5"], "perOutlet") * outlets +
    num(f["cable3x2.5"], "perAreaSqM") * area;

  const cable6Raw =
    num(f["cable3x6"], "base") +
    num(f["cable3x6"], "perWarmFloor") * warmFloor +
    num(f["cable3x6"], "fixed");

  const cableUtpRaw =
    num(f.cableUtp, "base") +
    num(f.cableUtp, "perUtpPoint") * utp +
    num(f.cableUtp, "perAreaSqM") * area +
    (utp >= num(f.cableUtp, "largeProjectMinUtp", 999)
      ? num(f.cableUtp, "largeProjectBonus", 0)
      : 0);

  const wirePugnpRaw =
    num(f.wirePugnp, "base") + num(f.wirePugnp, "perLight") * lights;

  // Замер по трассе от щита вытесняет коэффициенты «метры на точку»,
  // формулы выше остаются запасным вариантом, если трассировку отключить.
  const routingRules = rules.cableRouting ?? DEFAULT_ROUTING;
  const dedicatedRules = rules.dedicatedCircuits ?? DEFAULT_DEDICATED;
  const cableRoute: CableRouteEstimate | undefined = routingRules.enabled
    ? estimateCableRoute(project, routingRules, dedicatedRules.labels)
    : undefined;

  const cable6Value = cableRoute?.cable6 ?? cable6Raw;
  const cable2x15 = roundNearest(cable2x15Raw, r.cableMeters);
  const cable15 = roundNearest(cableRoute?.cable15 ?? cable15Raw, r.cableMeters);
  let cable25 = roundNearest(cableRoute?.cable25 ?? cable25Raw, r.cableMeters);
  const cable6Step = r.cable6Meters ?? 1;
  const cable6 =
    cable6Value <= 30
      ? Math.max(0, Math.round(cable6Value))
      : roundNearest(cable6Value, cable6Step);
  const cableUtp = roundNearest(cableRoute?.cableUtp ?? cableUtpRaw, r.cableMeters);
  const pugnpStep = r.pugnpMeters ?? 10;
  let wirePugnp = roundNearest(wirePugnpRaw, pugnpStep);

  const mainCable = cable15 + cable25;
  const totalCable = cable2x15 + mainCable + cable6 + cableUtp + wirePugnp;

  // Гофра — опция: на небольших площадях её обычно не берут (экономия для заказчика).
  const conduitAreaThreshold = rules.conduit?.includeAboveAreaSqM ?? Number.MAX_SAFE_INTEGER;
  const useConduit = project.useConduit ?? area > conduitAreaThreshold;

  const mainCableRatio = num(f.conduitPvc, "ratioOfMainCable", 0);
  const conduitRatio = num(f.conduitPvc, "ratioOfTotalCable", 0.72);
  const conduitBase = num(f.conduitPvc, "base", 0);
  const conduitRaw =
    mainCableRatio > 0
      ? mainCable * mainCableRatio + conduitBase
      : totalCable * conduitRatio;
  let conduitPvc = useConduit ? roundNearest(conduitRaw, r.conduitMeters) : 0;
  const conduitPnd = roundTo(totalCable * 0.35, r.conduitMeters);

  // Подрозетников ровно столько, сколько всех выключателей, розеток и розеток UTP.
  const socketBoxes =
    num(f.socketBoxes, "perOutlet") * outlets +
    num(f.socketBoxes, "perSwitch") * switches +
    num(f.socketBoxes, "perUtpPoint") * utp +
    num(f.socketBoxes, "buffer");

  // В каждом помещении своя распределительная коробка — это нижняя граница.
  const roomCount = project.rooms?.length ?? 0;
  const junctionBoxesRaw = Math.max(
    num(f.junctionBoxes, "base") +
      num(f.junctionBoxes, "perAreaSqM") * area +
      num(f.junctionBoxes, "perSocketBox") * socketBoxes,
    num(f.junctionBoxes, "perRoom") * roomCount,
  );
  const junctionBoxes = roundTo(junctionBoxesRaw, r.countItems);

  // С гофрой крепёж — клипсы, без гофры — площадка монтажного пистолета.
  const clipsMin = num(f.clips, "minPacks");
  let clips = useConduit
    ? Math.max(roundTo(num(f.clips, "perConduitMeter") * conduitPvc, r.countItems), clipsMin)
    : 0;
  const pads = useConduit
    ? 0
    : Math.max(
        roundTo(num(f.pads, "perMainCableMeter") * mainCable, 1),
        num(f.pads, "minPacks"),
      );

  const nailsRaw = num(f.nails, "perAreaSqM") * area;
  let nails = Math.min(
    Math.max(roundTo(nailsRaw, 1), num(f.nails, "minPacks")),
    num(f.nails, "maxPacks"),
  );

  // Без гофры кабель крепится напрямую, хомутов уходит существенно больше.
  const cableTiesRaw = useConduit
    ? num(f.cableTies, "perAreaSqM") * area
    : num(f.cableTies, "perMainCableMeterNoConduit") * mainCable;
  const cableTies = Math.max(roundTo(cableTiesRaw, 1), num(f.cableTies, "minPacks"));

  const sleeves = f.sleeves as Record<string, NumericRecord>;
  const sleeveQty = (key: string) =>
    Math.max(
      roundNearest(num(sleeves[key], "perBox") * junctionBoxes, r.countItems),
      num(sleeves[key], "min"),
    );
  const sleeveGml4 = sleeveQty("gml4");
  const sleeveGml6 = sleeveQty("gml6");
  const sleeveGml10 = sleeveQty("gml10");
  const sleeveGml16 = sleeveQty("gml16");

  const bulbs = Math.max(
    roundTo(num(f.bulbs, "perLight") * lights, r.countItems),
    num(f.bulbs, "min"),
  );

  const trashBags = Math.max(
    roundTo(num(f.trashBags, "perAreaSqM") * area, r.countItems),
    num(f.trashBags, "min"),
  );

  const tape = Math.max(
    roundTo(num(f.tape, "perAreaSqM") * area, 1),
    num(f.tape, "min"),
  );

  const dedicated = resolveDedicatedCircuits(project);
  const dedicatedRows = listDedicatedCircuits(dedicated, dedicatedRules.labels);
  // Розетки выделенных потребителей уже получают свои автоматы, поэтому
  // в общие розеточные группы они второй раз не попадают.
  const genericOutlets = Math.max(0, outlets - outletBackedDedicatedCount(dedicated));

  const lightGroups = Math.max(1, Math.ceil(lights / 8));
  const outletGroups = Math.max(1, Math.ceil(genericOutlets / 6));

  // Типовой шаблон щита по площади. Отключён, потому что не умеет добавлять
  // группы выделенных потребителей — их даёт dedicatedCircuits.
  type PanelTemplateTier = { maxAreaSqM: number; panelModules?: string };
  const templateConfig = f.panelTemplate as
    | { enabled?: boolean; tiers?: PanelTemplateTier[] }
    | undefined;
  const template =
    templateConfig?.enabled === false
      ? undefined
      : templateConfig?.tiers?.find((t) => area <= t.maxAreaSqM);

  let breakers10 = template
    ? num(template, "breakers10a")
    : num(f.breakers10a, "base") + num(f.breakers10a, "perLightGroup") * lightGroups;
  let breakers16 = template
    ? num(template, "breakers16a")
    : num(f.breakers16a, "base") + num(f.breakers16a, "perOutletGroup") * outletGroups;
  let breakers32 = template ? num(template, "breakers32a") : num(f.breakers32a, "fixed");
  let breakers50 = template ? num(template, "breakers50a") : num(f.breakers50a, "fixed");

  if (project.estimatedCircuits?.length) {
    breakers10 = 0;
    breakers16 = 0;
    breakers32 = 0;
    breakers50 = 0;
    for (const c of project.estimatedCircuits) {
      if (c.amps === 10) breakers10 += c.count;
      else if (c.amps === 16) breakers16 += c.count;
      else if (c.amps === 32) breakers32 += c.count;
      else if (c.amps === 50) breakers50 += c.count;
    }
  }

  // Холодильник, морозильник, каждый кондиционер, варочная поверхность,
  // духовой шкаф со СВЧ и тёплый пол требуют своего автомата.
  const dedicatedAmpCounts = { 10: 0, 16: 0, 32: 0, 50: 0 };
  for (const row of dedicatedRows) {
    const amps = row.cable6 ? dedicatedRules.hobAmps : dedicatedRules.standardAmps;
    dedicatedAmpCounts[amps] += row.count;
  }

  breakers10 = roundTo(breakers10, 1) + dedicatedAmpCounts[10];
  breakers16 = roundTo(breakers16, 1) + dedicatedAmpCounts[16];
  breakers32 = roundTo(breakers32, 1) + dedicatedAmpCounts[32];
  breakers50 = roundTo(breakers50, 1) + dedicatedAmpCounts[50];

  const rcdCount = template
    ? num(template, "rcd")
    : Math.min(
        Math.max(Math.round(num(f.rcd, "perAreaSqM") * area), num(f.rcd, "min")),
        num(f.rcd, "max"),
      );

  const fixed = rules.fixedItems;
  const fixedModuleCount = Object.values(fixed).reduce((sum, n) => sum + n, 0);
  const totalPoints =
    breakers10 +
    breakers16 +
    breakers32 +
    breakers50 +
    rcdCount +
    fixedModuleCount;

  const panelSize = f.panelSize as {
    thresholds: { maxPoints: number; panelId: string }[];
  };
  const panelSizeKey =
    panelSize.thresholds.find((t) => totalPoints <= t.maxPoints)?.panelId ??
    panelSize.thresholds[panelSize.thresholds.length - 1]?.panelId ??
    "panel-48";

  const panelModules =
    panelSizeKey.includes("90")
      ? "90"
      : panelSizeKey.includes("72")
        ? "72"
        : panelSizeKey.includes("54")
          ? "54"
          : "48";

  const largeProjectRule = f.largeProject as
    | {
        minOutlets?: number;
        rcdCount?: number;
        voltageRelayQty?: number;
        terminalBlocks?: number;
        panelModules?: string;
        cable25Multiplier?: number;
        pugnpMinPerLight?: number;
        conduitBonus?: number;
        nailsPacks?: number;
        clipsPacks?: number;
      }
    | undefined;
  const isLargeProject = outlets >= (largeProjectRule?.minOutlets ?? Number.MAX_SAFE_INTEGER);

  let voltageRelayQty = 1;
  let terminalBlockCount = 0;
  let resolvedPanelModules = template?.panelModules ?? panelModules;
  let resolvedRcdCount = rcdCount;

  if (isLargeProject && largeProjectRule) {
    resolvedRcdCount = largeProjectRule.rcdCount ?? resolvedRcdCount;
    voltageRelayQty = largeProjectRule.voltageRelayQty ?? 3;
    terminalBlockCount = largeProjectRule.terminalBlocks ?? 0;
    resolvedPanelModules = largeProjectRule.panelModules ?? resolvedPanelModules;
    if (largeProjectRule.cable25Multiplier) {
      cable25 = roundNearest(cable25 * largeProjectRule.cable25Multiplier, r.cableMeters);
    }
    if (largeProjectRule.pugnpMinPerLight) {
      wirePugnp = roundNearest(
        Math.max(wirePugnp, lights * largeProjectRule.pugnpMinPerLight),
        pugnpStep,
      );
    }
    if (largeProjectRule.conduitBonus) {
      conduitPvc = roundNearest(conduitPvc + largeProjectRule.conduitBonus, r.conduitMeters);
    }
  }

  if (isLargeProject && largeProjectRule?.nailsPacks) {
    nails = largeProjectRule.nailsPacks;
  }
  if (isLargeProject && largeProjectRule?.clipsPacks) {
    clips = largeProjectRule.clipsPacks;
  }

  return {
    cable2x15,
    cable15,
    cable25,
    cable6,
    cableUtp,
    wirePugnp,
    useConduit,
    conduitPvc,
    conduitPnd,
    socketBoxes,
    junctionBoxes,
    clips,
    pads,
    nails,
    cableTies,
    sleeveGml4,
    sleeveGml6,
    sleeveGml10,
    sleeveGml16,
    bulbs,
    trashBags,
    tape,
    breakers10,
    breakers16,
    breakers32,
    breakers50,
    rcdCount: resolvedRcdCount,
    panelModules: resolvedPanelModules,
    voltageRelayQty,
    terminalBlockCount,
    isLargeProject,
    fixed,
    cableRoute,
    dedicatedRows,
  };
}

function buildMaterials(q: ReturnType<typeof computeQuantities>): LineItem[] {
  const materialSpecs: { id: string; qty: number }[] = [
    { id: "cable-vvgng-2x1.5", qty: q.cable2x15 },
    { id: "cable-vvgng-3x1.5", qty: q.cable15 },
    { id: "cable-vvgng-3x2.5", qty: q.cable25 },
    { id: "cable-vvgng-3x6", qty: q.cable6 },
    { id: "cable-utp", qty: q.cableUtp },
    { id: "wire-pugnp", qty: q.wirePugnp },
    { id: "conduit-pvc-d20", qty: q.conduitPvc },
    { id: "nails-19mm", qty: q.nails },
    { id: "cable-ties-150", qty: q.cableTies },
    { id: "junction-box", qty: q.junctionBoxes },
    { id: "clips-d20", qty: q.clips },
    { id: "pad-gun-d20", qty: q.pads },
    { id: "socket-box", qty: q.socketBoxes },
    { id: "socket-cover", qty: q.socketBoxes },
    { id: "sleeve-gml-4-3", qty: q.sleeveGml4 },
    { id: "sleeve-gml-6-4", qty: q.sleeveGml6 },
    { id: "sleeve-gml-10-5", qty: q.sleeveGml10 },
    { id: "sleeve-gml-16-6", qty: q.sleeveGml16 },
    { id: "trash-bags", qty: q.trashBags },
    { id: "tape", qty: q.tape },
    { id: "socket-e27", qty: q.bulbs },
    { id: "bulb-led", qty: q.bulbs },
    { id: "dowel-clamp", qty: 2 },
    { id: "disc-stone-125", qty: 2 },
    { id: "core-bit-72", qty: 1 },
    { id: "socket-double", qty: 2 },
    { id: "rotband-25kg", qty: q.isLargeProject ? 2 : 1 },
  ];

  if (q.isLargeProject) {
    materialSpecs.push({ id: "cable-channel-40", qty: 4 });
  }

  if (loadCalculationRules().includeConduitPnd && q.useConduit) {
    const pvcIndex = materialSpecs.findIndex((s) => s.id === "conduit-pvc-d20");
    materialSpecs.splice(pvcIndex + 1, 0, { id: "conduit-pnd-d20", qty: q.conduitPnd });
  }

  return materialSpecs
    .map(({ id, qty }) => lineFromCatalog("materials", id, qty))
    .filter((item): item is LineItem => item !== null);
}

function buildPanelForBrand(
  brand: PanelBrandConfig,
  q: ReturnType<typeof computeQuantities>,
): LineItem[] {
  const panelCatalogId = brand.panels[q.panelModules] ?? brand.panels["48"];
  const relayQty = q.isLargeProject
    ? q.voltageRelayQty
    : brand.voltageRelayQty ?? 1;
  const rcdCatalogId =
    q.isLargeProject && brand.largeRcd ? brand.largeRcd : brand.rcd;
  const breakerIds = q.isLargeProject && brand.largeBreakers ? brand.largeBreakers : brand.breakers;

  const panelSpecs: { id: string; qty: number }[] = [
    { id: breakerIds["10a"], qty: q.breakers10 },
    { id: breakerIds["16a"], qty: q.breakers16 },
    { id: breakerIds["32a"], qty: q.breakers32 },
    { id: breakerIds["50a"], qty: q.breakers50 },
    { id: rcdCatalogId, qty: q.rcdCount },
    { id: brand.contactor, qty: 1 },
    { id: brand.voltageRelay, qty: relayQty },
    { id: panelCatalogId, qty: 1 },
  ];

  for (const [key, qty] of Object.entries(brand.fixedItems)) {
    const isTerminalKey =
      key === "terminalRed" || key === "terminalBlue" || key === "terminalRbd";
    if (q.isLargeProject && q.terminalBlockCount > 0 && isTerminalKey) {
      continue;
    }
    const catalogId = brand.fixedCatalogMap[key];
    if (catalogId) {
      panelSpecs.push({ id: catalogId, qty });
    }
  }

  if (q.terminalBlockCount > 0) {
    panelSpecs.push({ id: "terminal-block-rbd", qty: q.terminalBlockCount });
  }

  return panelSpecs
    .map(({ id, qty }) => lineFromCatalog("panel", id, qty))
    .filter((item): item is LineItem => item !== null);
}

function sumItems(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + item.total, 0);
}

export function calculateAllVariants(
  project: ExtractedProject,
  laborOverride?: number,
): MultiBrandCalculationResult {
  const catalog = loadPriceCatalog();
  const brands = loadPanelBrands();
  const q = computeQuantities(project);
  const laborPrice = laborOverride ?? laborPriceForArea(project.totalAreaSqM);

  const labor: LineItem[] = [
    {
      id: "labor-main",
      name: catalog.labor.description,
      unit: catalog.labor.unit,
      quantity: 1,
      unitPrice: laborPrice,
      total: laborPrice,
      section: "labor",
    },
  ];

  const materials = buildMaterials(q);
  const laborTotal = sumItems(labor);
  const materialsTotal = sumItems(materials);

  const variants = {} as BrandVariants;
  for (const brandId of PANEL_BRAND_IDS) {
    const brand = brands[brandId];
    const panel = buildPanelForBrand(brand, q);
    variants[brandId] = {
      panel,
      totalAmount: laborTotal + materialsTotal + sumItems(panel),
    };
  }

  return { labor, materials, laborPrice, variants, cableRoute: q.cableRoute };
}

export function calculateOffer(
  project: ExtractedProject,
  laborOverride?: number,
  brand: PanelBrandId = "schneider-easy9",
): CalculationResult {
  const all = calculateAllVariants(project, laborOverride);
  const variant = all.variants[brand];
  return {
    labor: all.labor,
    materials: all.materials,
    panel: variant.panel,
    grandTotal: variant.totalAmount,
    laborPrice: all.laborPrice,
    cableRoute: all.cableRoute,
  };
}

export function recalculateVariantTotals(
  labor: LineItem[],
  materials: LineItem[],
  variants: BrandVariants,
): BrandVariants {
  const laborTotal = sumItems(labor);
  const materialsTotal = sumItems(materials);
  const next = { ...variants };
  for (const brandId of PANEL_BRAND_IDS) {
    next[brandId] = {
      ...next[brandId],
      totalAmount: laborTotal + materialsTotal + sumItems(next[brandId].panel),
    };
  }
  return next;
}

export function sectionsForBrand(
  labor: LineItem[],
  materials: LineItem[],
  variants: BrandVariants,
  brand: PanelBrandId,
) {
  return {
    labor,
    materials,
    panel: variants[brand].panel,
  };
}
