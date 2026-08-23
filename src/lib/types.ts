export interface ExtractedProject {
  projectName: string;
  clientName?: string;
  totalAreaSqM: number;
  outlets: number;
  switches: number;
  lightPoints: number;
  utpPoints: number;
  warmFloorCircuits: number;
  estimatedCircuits?: { amps: 10 | 16 | 32 | 50; count: number }[];
  notes: string[];
  confidence?: number;
}

export interface LineItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
  section: "labor" | "materials" | "panel";
}

export interface OfferSections {
  labor: LineItem[];
  materials: LineItem[];
  panel: LineItem[];
}

export interface CatalogItem {
  id: string;
  name: string;
  unit: string;
  price: number;
}

export interface CalculationResult {
  labor: LineItem[];
  materials: LineItem[];
  panel: LineItem[];
  grandTotal: number;
  laborPrice: number;
}

export interface PriceCatalog {
  materials: CatalogItem[];
  panel: CatalogItem[];
  labor: {
    description: string;
    unit: string;
  };
}

export interface CalculationRules {
  rounding: {
    cableMeters: number;
    conduitMeters: number;
    countItems: number;
  };
  formulas: Record<string, unknown>;
  laborTiers: { maxAreaSqM: number; price: number }[];
  fixedItems: Record<string, number>;
}

export interface CompanyBoilerplate {
  companyName: string;
  license: string;
  ownerName: string;
  phones: string[];
  email: string;
  bio: string;
  partners: string;
  qualifications: string;
  giftOffer: string;
  guarantees: string[];
  qualityRegulations: string[];
  serviceOnSite: string[];
  footerNote: string;
}

export interface OfferRecord {
  id: string;
  projectName: string;
  clientName: string;
  sourceFileName: string;
  extractedData: ExtractedProject;
  laborPrice: number;
  lineItems: OfferSections;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}
