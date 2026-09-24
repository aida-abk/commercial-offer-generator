import {
  findCatalogItem,
  loadCalculationRules,
  loadPanelBrands,
  loadPriceCatalog,
} from "./catalog";
import { buildCircuitPlan } from "./circuits";
import type {
  BrandVariants,
  CalculationResult,
  CircuitPlan,
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

/**
 * Объёмы материалов. Кабель, автоматы, УЗО и корпус щита приходят из покомнатного
 * плана групп (src/lib/circuits.ts); расходники по-прежнему считаются от площади
 * и числа точек.
 */
function computeQuantities(project: ExtractedProject) {
  const rules = loadCalculationRules();
  const f = rules.formulas;
  const r = rules.rounding;
  const g = rules.geometry;
  const plan = buildCircuitPlan(project);

  const area =
    project.totalAreaSqM > 0
      ? project.totalAreaSqM
      : plan.rooms.reduce((s, room) => s + room.areaSqM, 0);

  const cable2x15 = plan.cableMeters["2x1.5"];
  const cable15 = plan.cableMeters["3x1.5"];
  const cable25 = plan.cableMeters["3x2.5"];
  const cable6 = plan.cableMeters["3x6"];
  const cableUtp = plan.cableMeters.utp;

  // ПУГНП — временное освещение на время стройки.
  const pugnpStep = r.pugnpMeters ?? 10;
  const wirePugnp = roundNearest(plan.tempBulbs * g.tempLightPerBulbM, pugnpStep);

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
  const conduitPvc = useConduit ? roundNearest(conduitRaw, r.conduitMeters) : 0;
  const conduitPnd = roundTo(totalCable * 0.35, r.conduitMeters);

  const socketBoxesRaw =
    num(f.socketBoxes, "perOutlet") * plan.socketPoints +
    num(f.socketBoxes, "perSwitch") * plan.switchPoints +
    num(f.socketBoxes, "buffer");
  const socketBoxes = roundTo(socketBoxesRaw, r.countItems);

  // Розетки идут без шлейфа — через распредкоробки, поэтому коробки считаются
  // от числа групп и точек, а не от площади.
  const wiredCircuits = plan.circuits.filter((c) => c.kind !== "utp").length;
  const junctionBoxesRaw =
    num(f.junctionBoxes, "perCircuit") * wiredCircuits +
    num(f.junctionBoxes, "perPoint") * (plan.socketPoints + plan.lightPoints);
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

  // Временные лампочки — 3–4 на комнату.
  const bulbs = Math.max(plan.tempBulbs, num(f.bulbs, "min"));

  const trashBags = Math.max(
    roundTo(num(f.trashBags, "perAreaSqM") * area, r.countItems),
    num(f.trashBags, "min"),
  );

  const tape = Math.max(
    roundTo(num(f.tape, "perAreaSqM") * area, 1),
    num(f.tape, "min"),
  );

  const largeProjectRule = f.largeProject as
    | {
        minOutlets?: number;
        voltageRelayQty?: number;
        terminalBlocks?: number;
        nailsPacks?: number;
        clipsPacks?: number;
      }
    | undefined;
  const isLargeProject =
    plan.socketPoints >= (largeProjectRule?.minOutlets ?? Number.MAX_SAFE_INTEGER);

  let voltageRelayQty = 1;
  let terminalBlockCount = 0;
  if (isLargeProject && largeProjectRule) {
    voltageRelayQty = largeProjectRule.voltageRelayQty ?? 3;
    terminalBlockCount = largeProjectRule.terminalBlocks ?? 0;
    if (largeProjectRule.nailsPacks) nails = largeProjectRule.nailsPacks;
    if (largeProjectRule.clipsPacks && useConduit) clips = largeProjectRule.clipsPacks;
  }

  return {
    plan,
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
    breakers10: plan.breakers10a,
    breakers16: plan.breakers16a,
    breakers32: plan.breakers32a,
    // Вводной автомат 2п 63А.
    breakers50: plan.inputBreakers,
    rcdCount: plan.rcdCount,
    panelModules: String(plan.panelSize),
    voltageRelayQty,
    terminalBlockCount,
    isLargeProject,
    fixed: rules.fixedItems,
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

  return { labor, materials, laborPrice, variants, plan: q.plan };
}

/** План групп по комнатам — для отображения в КП и на экране подтверждения. */
export function planForProject(project: ExtractedProject): CircuitPlan {
  return buildCircuitPlan(project);
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
    plan: all.plan,
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
