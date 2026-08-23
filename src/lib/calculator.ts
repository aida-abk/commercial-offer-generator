import { findCatalogItem, loadCalculationRules, loadPriceCatalog } from "./catalog";
import type { CalculationResult, ExtractedProject, LineItem } from "./types";

export function roundTo(value: number, step: number): number {
  if (step <= 0) return Math.round(value);
  return Math.ceil(value / step) * step;
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
  const { laborTiers } = loadCalculationRules();
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

  const cable15Raw =
    num(f["cable3x1.5"], "base") +
    num(f["cable3x1.5"], "perSwitch") * switches +
    num(f["cable3x1.5"], "perLight") * lights +
    num(f["cable3x1.5"], "perAreaSqM") * area;

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
    num(f.cableUtp, "perAreaSqM") * area;

  const wirePugnpRaw =
    num(f.wirePugnp, "base") + num(f.wirePugnp, "perLight") * lights;

  const cable15 = roundTo(cable15Raw, r.cableMeters);
  const cable25 = roundTo(cable25Raw, r.cableMeters);
  const cable6 = roundTo(cable6Raw, r.cableMeters);
  const cableUtp = roundTo(cableUtpRaw, r.cableMeters);
  const wirePugnp = roundTo(wirePugnpRaw, r.cableMeters);

  const totalCable = cable15 + cable25 + cable6 + cableUtp + wirePugnp;
  const conduitRatio = num(f.conduitPvc, "ratioOfTotalCable", 1);
  const conduitPvc = roundTo(totalCable * conduitRatio, r.conduitMeters);
  const conduitPnd = roundTo(totalCable * 0.35, r.conduitMeters);

  const socketBoxesRaw =
    num(f.socketBoxes, "perOutlet") * outlets +
    num(f.socketBoxes, "perSwitch") * switches +
    num(f.socketBoxes, "buffer");
  const socketBoxes = roundTo(socketBoxesRaw, r.countItems);

  const junctionBoxesRaw =
    num(f.junctionBoxes, "base") + num(f.junctionBoxes, "perAreaSqM") * area;
  const junctionBoxes = roundTo(junctionBoxesRaw, r.countItems);

  const clipsRaw = num(f.clips, "perConduitMeter") * conduitPvc;
  const clipsMin = num(f.clips, "minPacks");
  const clips = Math.max(roundTo(clipsRaw, r.countItems), clipsMin);

  const nailsRaw = num(f.nails, "perAreaSqM") * area;
  const nails = Math.min(
    Math.max(roundTo(nailsRaw, 1), num(f.nails, "minPacks")),
    num(f.nails, "maxPacks"),
  );

  const cableTiesRaw = num(f.cableTies, "perAreaSqM") * area;
  const cableTies = Math.max(roundTo(cableTiesRaw, 1), num(f.cableTies, "minPacks"));

  const sleeves = f.sleeves as Record<string, NumericRecord>;
  const sleeveGml4 = Math.max(
    roundTo(num(sleeves.gml4, "perBox") * junctionBoxes, r.countItems),
    num(sleeves.gml4, "min"),
  );
  const sleeveGml6 = Math.max(
    roundTo(num(sleeves.gml6, "perBox") * junctionBoxes, r.countItems),
    num(sleeves.gml6, "min"),
  );
  const sleeveGml10 = Math.max(
    roundTo(num(sleeves.gml10, "perBox") * junctionBoxes, r.countItems),
    num(sleeves.gml10, "min"),
  );
  const sleeveGml16 = Math.max(
    roundTo(num(sleeves.gml16, "perBox") * junctionBoxes, r.countItems),
    num(sleeves.gml16, "min"),
  );

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

  const lightGroups = Math.max(1, Math.ceil(lights / 8));
  const outletGroups = Math.max(1, Math.ceil(outlets / 6));

  let breakers10 = num(f.breakers10a, "base") + num(f.breakers10a, "perLightGroup") * lightGroups;
  let breakers16 = num(f.breakers16a, "base") + num(f.breakers16a, "perOutletGroup") * outletGroups;
  let breakers32 = num(f.breakers32a, "fixed");
  let breakers50 = num(f.breakers50a, "fixed");

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

  breakers10 = roundTo(breakers10, 1);
  breakers16 = roundTo(breakers16, 1);
  breakers32 = roundTo(breakers32, 1);
  breakers50 = roundTo(breakers50, 1);

  const rcdRaw = num(f.rcd, "perAreaSqM") * area;
  let rcdCount = Math.round(rcdRaw);
  rcdCount = Math.min(Math.max(rcdCount, num(f.rcd, "min")), num(f.rcd, "max"));

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
  const panelId =
    panelSize.thresholds.find((t) => totalPoints <= t.maxPoints)?.panelId ??
    panelSize.thresholds[panelSize.thresholds.length - 1]?.panelId ??
    "panel-48";

  return {
    cable15,
    cable25,
    cable6,
    cableUtp,
    wirePugnp,
    conduitPvc,
    conduitPnd,
    socketBoxes,
    junctionBoxes,
    clips,
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
    rcdCount,
    panelId,
    fixed,
  };
}

const FIXED_PANEL_MAP: Record<string, string> = {
  contactor: "contactor-63a",
  voltageRelay: "voltage-relay",
  coreBit: "core-bit-72",
  discStone: "disc-stone-125",
  dowelClamp: "dowel-clamp",
  rotband: "rotband-25kg",
  socketDouble: "socket-double",
  cableLabel: "cable-label",
  pugv4Red: "pugv-4-red",
  pugv4Blue: "pugv-4-blue",
  neutralBus: "neutral-bus",
  cableTie4x150: "cable-tie-4x150",
  nshvi: "nshvi-4-12",
  padSelfAdhesive: "pad-self-adhesive",
  terminalRed: "terminal-red",
  terminalBlue: "terminal-blue",
};

export function calculateOffer(
  project: ExtractedProject,
  laborOverride?: number,
): CalculationResult {
  const catalog = loadPriceCatalog();
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

  const materialSpecs: { id: string; qty: number }[] = [
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
    { id: "rotband-25kg", qty: 1 },
  ];

  const rulesConfig = loadCalculationRules() as { includeConduitPnd?: boolean };
  if (rulesConfig.includeConduitPnd) {
    materialSpecs.splice(6, 0, { id: "conduit-pnd-d20", qty: q.conduitPnd });
  }

  const materials: LineItem[] = materialSpecs
    .map(({ id, qty }) => lineFromCatalog("materials", id, qty))
    .filter((item): item is LineItem => item !== null);

  const panelSpecs: { id: string; qty: number }[] = [
    { id: "breaker-rx3-10a", qty: q.breakers10 },
    { id: "breaker-rx3-16a", qty: q.breakers16 },
    { id: "breaker-rx3-32a", qty: q.breakers32 },
    { id: "breaker-rx3-50a-2p", qty: q.breakers50 },
    { id: "rcd-2p-63a", qty: q.rcdCount },
    { id: q.panelId, qty: 1 },
  ];

  for (const [key, qty] of Object.entries(q.fixed)) {
    const catalogId = FIXED_PANEL_MAP[key];
    if (catalogId) {
      panelSpecs.push({ id: catalogId, qty });
    }
  }

  const panel: LineItem[] = panelSpecs
    .map(({ id, qty }) => lineFromCatalog("panel", id, qty))
    .filter((item): item is LineItem => item !== null);

  const grandTotal = [...labor, ...materials, ...panel].reduce(
    (sum, item) => sum + item.total,
    0,
  );

  return { labor, materials, panel, grandTotal, laborPrice };
}
