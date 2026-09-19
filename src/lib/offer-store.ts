import { Prisma } from "@prisma/client";
import {
  calculateAllVariants,
  recalculateVariantTotals,
  sectionsForBrand,
} from "./calculator";
import { prisma } from "./db";
import type {
  AnalyzedPdfPage,
  BrandVariants,
  ExtractedProject,
  OfferRecord,
  OfferSections,
  PanelBrandId,
} from "./types";
import { PANEL_BRAND_IDS } from "./types";

function emptyVariants(): BrandVariants {
  return {
    "schneider-easy9": { panel: [], totalAmount: 0 },
    chint: { panel: [], totalAmount: 0 },
    legrand: { panel: [], totalAmount: 0 },
  };
}

function toOfferSections(lineItems: unknown): OfferSections {
  const data = lineItems as OfferSections;
  return {
    labor: Array.isArray(data?.labor) ? data.labor : [],
    materials: Array.isArray(data?.materials) ? data.materials : [],
    panel: Array.isArray(data?.panel) ? data.panel : [],
  };
}

function toBrandVariants(raw: unknown): BrandVariants {
  if (!raw || typeof raw !== "object") return emptyVariants();
  const data = raw as BrandVariants;
  const result = emptyVariants();
  for (const id of PANEL_BRAND_IDS) {
    if (data[id]) {
      result[id] = {
        panel: Array.isArray(data[id].panel) ? data[id].panel : [],
        totalAmount: Number(data[id].totalAmount) || 0,
      };
    }
  }
  return result;
}

function toAnalyzedPages(raw: unknown): AnalyzedPdfPage[] {
  return Array.isArray(raw) ? (raw as AnalyzedPdfPage[]) : [];
}

function mapOffer(row: {
  id: string;
  projectName: string;
  clientName: string;
  sourceFileName: string;
  extractedData: unknown;
  laborPrice: number;
  lineItems: unknown;
  brandVariants: unknown;
  activeBrand: string;
  analyzedPages: unknown;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}): OfferRecord {
  const brandVariants = toBrandVariants(row.brandVariants);
  const activeBrand = (PANEL_BRAND_IDS.includes(row.activeBrand as PanelBrandId)
    ? row.activeBrand
    : "schneider-easy9") as PanelBrandId;
  const lineItems = toOfferSections(row.lineItems);

  if (lineItems.panel.length === 0 && brandVariants[activeBrand].panel.length > 0) {
    lineItems.panel = brandVariants[activeBrand].panel;
  }

  return {
    id: row.id,
    projectName: row.projectName,
    clientName: row.clientName,
    sourceFileName: row.sourceFileName,
    extractedData: row.extractedData as ExtractedProject,
    laborPrice: row.laborPrice,
    lineItems,
    brandVariants,
    activeBrand,
    analyzedPages: toAnalyzedPages(row.analyzedPages),
    totalAmount: row.totalAmount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface CreateOfferInput {
  projectName: string;
  clientName?: string;
  sourceFileName?: string;
  extractedData: ExtractedProject;
  laborOverride?: number;
  analyzedPages?: AnalyzedPdfPage[];
  activeBrand?: PanelBrandId;
}

export async function createOffer(input: CreateOfferInput): Promise<OfferRecord> {
  const calc = calculateAllVariants(input.extractedData, input.laborOverride);
  const activeBrand = input.activeBrand ?? "schneider-easy9";
  const lineItems = sectionsForBrand(
    calc.labor,
    calc.materials,
    calc.variants,
    activeBrand,
  );

  const row = await prisma.offer.create({
    data: {
      projectName: input.projectName || input.extractedData.projectName,
      clientName: input.clientName ?? input.extractedData.clientName ?? "",
      sourceFileName: input.sourceFileName ?? "",
      extractedData: input.extractedData as unknown as Prisma.InputJsonValue,
      laborPrice: calc.laborPrice,
      lineItems: lineItems as unknown as Prisma.InputJsonValue,
      brandVariants: calc.variants as unknown as Prisma.InputJsonValue,
      activeBrand,
      analyzedPages: (input.analyzedPages ?? []) as unknown as Prisma.InputJsonValue,
      totalAmount: calc.variants[activeBrand].totalAmount,
    },
  });

  return mapOffer(row);
}

export async function getOffer(id: string): Promise<OfferRecord | null> {
  const row = await prisma.offer.findUnique({ where: { id } });
  return row ? mapOffer(row) : null;
}

export async function listOffers(limit = 50): Promise<OfferRecord[]> {
  const rows = await prisma.offer.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map(mapOffer);
}

export interface UpdateOfferInput {
  projectName?: string;
  clientName?: string;
  extractedData?: ExtractedProject;
  laborPrice?: number;
  lineItems?: OfferSections;
  brandVariants?: BrandVariants;
  activeBrand?: PanelBrandId;
  analyzedPages?: AnalyzedPdfPage[];
  totalAmount?: number;
}

export async function updateOffer(
  id: string,
  input: UpdateOfferInput,
): Promise<OfferRecord | null> {
  const existing = await prisma.offer.findUnique({ where: { id } });
  if (!existing) return null;

  const extracted = (input.extractedData ??
    existing.extractedData) as ExtractedProject;
  const activeBrand = (input.activeBrand ??
    existing.activeBrand ??
    "schneider-easy9") as PanelBrandId;
  const laborPrice =
    input.laborPrice ??
    existing.laborPrice ??
    calculateAllVariants(extracted).laborPrice;

  let lineItems = input.lineItems ?? toOfferSections(existing.lineItems);
  let brandVariants = input.brandVariants ?? toBrandVariants(existing.brandVariants);

  if (input.extractedData && !input.lineItems && !input.brandVariants) {
    const calc = calculateAllVariants(extracted, laborPrice);
    brandVariants = calc.variants;
    lineItems = sectionsForBrand(calc.labor, calc.materials, brandVariants, activeBrand);
  } else if (input.lineItems || input.brandVariants) {
    if (input.lineItems) {
      brandVariants = recalculateVariantTotals(
        lineItems.labor,
        lineItems.materials,
        brandVariants,
      );
      if (input.lineItems.panel.length > 0) {
        brandVariants[activeBrand] = {
          panel: input.lineItems.panel,
          totalAmount:
            lineItems.labor.reduce((s, i) => s + i.total, 0) +
            lineItems.materials.reduce((s, i) => s + i.total, 0) +
            input.lineItems.panel.reduce((s, i) => s + i.total, 0),
        };
      }
    }
    lineItems = sectionsForBrand(
      lineItems.labor,
      lineItems.materials,
      brandVariants,
      activeBrand,
    );
  }

  const totalAmount =
    input.totalAmount ??
    brandVariants[activeBrand]?.totalAmount ??
    [...lineItems.labor, ...lineItems.materials, ...lineItems.panel].reduce(
      (sum, item) => sum + item.total,
      0,
    );

  const row = await prisma.offer.update({
    where: { id },
    data: {
      projectName: input.projectName ?? existing.projectName,
      clientName: input.clientName ?? existing.clientName,
      extractedData: extracted as unknown as Prisma.InputJsonValue,
      laborPrice,
      lineItems: lineItems as unknown as Prisma.InputJsonValue,
      brandVariants: brandVariants as unknown as Prisma.InputJsonValue,
      activeBrand,
      analyzedPages: (input.analyzedPages ??
        toAnalyzedPages(existing.analyzedPages)) as unknown as Prisma.InputJsonValue,
      totalAmount,
    },
  });

  return mapOffer(row);
}

export async function deleteOffer(id: string): Promise<boolean> {
  try {
    await prisma.offer.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function recalculateOffer(id: string): Promise<OfferRecord | null> {
  const existing = await getOffer(id);
  if (!existing) return null;
  return updateOffer(id, {
    extractedData: existing.extractedData,
    laborPrice: existing.laborPrice,
    activeBrand: existing.activeBrand,
  });
}
