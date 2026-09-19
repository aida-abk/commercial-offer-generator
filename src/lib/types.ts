export type PanelBrandId = "schneider-easy9" | "chint" | "legrand";

export const PANEL_BRAND_IDS: PanelBrandId[] = [
  "schneider-easy9",
  "chint",
  "legrand",
];

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
  /** Прокладка в гофре. Не задано — решается по площади (config/calculation-rules.json → conduit). */
  useConduit?: boolean;
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

export interface BrandVariant {
  panel: LineItem[];
  totalAmount: number;
}

export type BrandVariants = Record<PanelBrandId, BrandVariant>;

export interface AnalyzedPdfPage {
  pageNumber: number;
  textPreview: string;
  score: number;
  matchedKeywords: string[];
  selected: boolean;
  title?: string;
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

export interface MultiBrandCalculationResult {
  labor: LineItem[];
  materials: LineItem[];
  laborPrice: number;
  variants: BrandVariants;
}

export interface PriceCatalog {
  materials: CatalogItem[];
  panel: CatalogItem[];
  labor: {
    description: string;
    unit: string;
  };
}

export interface PanelBrandConfig {
  label: string;
  breakers: {
    "10a": string;
    "16a": string;
    "32a": string;
    "50a": string;
  };
  rcd: string;
  contactor: string;
  voltageRelay: string;
  voltageRelayQty?: number;
  panels: Record<string, string>;
  largeBreakers?: PanelBrandConfig["breakers"];
  largeRcd?: string;
  fixedItems: Record<string, number>;
  fixedCatalogMap: Record<string, string>;
}

export interface CalculationRules {
  rounding: {
    cableMeters: number;
    conduitMeters: number;
    countItems: number;
    cable6Meters?: number;
    pugnpMeters?: number;
  };
  formulas: Record<string, unknown>;
  laborTiers: { maxAreaSqM: number; price: number }[];
  laborPerSqM?: number;
  laborRoundTo?: number;
  fixedItems: Record<string, number>;
  includeConduitPnd?: boolean;
  conduit?: {
    includeAboveAreaSqM: number;
  };
}

export interface CompanyBoilerplate {
  companyName: string;
  header: {
    legalNameRu: string;
    legalNameKk: string;
    addressRu: string;
    addressKk: string;
    iinBin: string;
    bankRu: string;
    bankKk: string;
    iik: string;
    bik: string;
    phoneDisplay: string;
  };
  license: string;
  ownerName: string;
  phones: string[];
  email: string;
  bio: string;
  bioExtended?: string;
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
  brandVariants: BrandVariants;
  activeBrand: PanelBrandId;
  analyzedPages: AnalyzedPdfPage[];
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}
