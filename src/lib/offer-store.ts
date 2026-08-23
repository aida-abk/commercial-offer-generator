import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { calculateOffer } from "./calculator";
import type { ExtractedProject, OfferRecord, OfferSections } from "./types";

function toOfferSections(lineItems: unknown): OfferSections {
  const data = lineItems as OfferSections;
  return {
    labor: Array.isArray(data?.labor) ? data.labor : [],
    materials: Array.isArray(data?.materials) ? data.materials : [],
    panel: Array.isArray(data?.panel) ? data.panel : [],
  };
}

function mapOffer(row: {
  id: string;
  projectName: string;
  clientName: string;
  sourceFileName: string;
  extractedData: unknown;
  laborPrice: number;
  lineItems: unknown;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}): OfferRecord {
  return {
    id: row.id,
    projectName: row.projectName,
    clientName: row.clientName,
    sourceFileName: row.sourceFileName,
    extractedData: row.extractedData as ExtractedProject,
    laborPrice: row.laborPrice,
    lineItems: toOfferSections(row.lineItems),
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
}

export async function createOffer(input: CreateOfferInput): Promise<OfferRecord> {
  const calc = calculateOffer(input.extractedData, input.laborOverride);
  const lineItems: OfferSections = {
    labor: calc.labor,
    materials: calc.materials,
    panel: calc.panel,
  };

  const row = await prisma.offer.create({
    data: {
      projectName: input.projectName || input.extractedData.projectName,
      clientName: input.clientName ?? input.extractedData.clientName ?? "",
      sourceFileName: input.sourceFileName ?? "",
      extractedData: input.extractedData as unknown as Prisma.InputJsonValue,
      laborPrice: calc.laborPrice,
      lineItems: lineItems as unknown as Prisma.InputJsonValue,
      totalAmount: calc.grandTotal,
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
  const laborPrice =
    input.laborPrice ??
    existing.laborPrice ??
    calculateOffer(extracted).laborPrice;

  let lineItems = input.lineItems ?? toOfferSections(existing.lineItems);
  let totalAmount = input.totalAmount;

  if (input.extractedData && !input.lineItems) {
    const calc = calculateOffer(extracted, laborPrice);
    lineItems = {
      labor: calc.labor,
      materials: calc.materials,
      panel: calc.panel,
    };
    totalAmount = calc.grandTotal;
  } else if (totalAmount === undefined) {
    totalAmount = [...lineItems.labor, ...lineItems.materials, ...lineItems.panel].reduce(
      (sum, item) => sum + item.total,
      0,
    );
  }

  const row = await prisma.offer.update({
    where: { id },
    data: {
      projectName: input.projectName ?? existing.projectName,
      clientName: input.clientName ?? existing.clientName,
      extractedData: extracted as unknown as Prisma.InputJsonValue,
      laborPrice,
      lineItems: lineItems as unknown as Prisma.InputJsonValue,
      totalAmount: totalAmount ?? existing.totalAmount,
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
  });
}
