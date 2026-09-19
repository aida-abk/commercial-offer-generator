export type PanelBrandId = "schneider-easy9" | "chint" | "legrand";

export const PANEL_BRAND_IDS: PanelBrandId[] = [
  "schneider-easy9",
  "chint",
  "legrand",
];

/**
 * Помещение с привязкой точек. Кабель считается по трассе от щита до
 * распределительной коробки помещения и дальше по стенам со спуском к каждой точке,
 * поэтому важны габариты помещения и расстояние до щита.
 */
export interface RoomSpec {
  name: string;
  areaSqM?: number;
  /** Габариты помещения по чертежу, м. */
  widthMeters?: number;
  lengthMeters?: number;
  /** Высота потолка, м. Нужна для спусков, если они не заданы явно. */
  ceilingHeightMeters?: number;
  /** Трасса от щита до распределительной коробки помещения (по потолку и стенам), м. */
  panelToBoxMeters?: number;
  /** Спуск от потолка до розетки/выключателя, м. По умолчанию 3 м. */
  dropMeters?: number;
  outlets: number;
  switches: number;
  lightPoints: number;
  utpPoints: number;
}

/**
 * Потребители, которым нужна отдельная группа (свой автомат).
 * Все идут кабелем ВВГнг 3*2,5, кроме варочной поверхности — она 3*6.
 */
export interface DedicatedCircuits {
  /** Холодильник. */
  fridge?: number;
  /** Морозильник. */
  freezer?: number;
  /** Кондиционеры: каждый требует своей группы. */
  airConditioners?: number;
  /** Варочная поверхность (электроплита) — единственная группа на кабеле 3*6. */
  hob?: number;
  /** Духовой шкаф и СВЧ — одна объединённая группа. */
  ovenMicrowave?: number;
  /** Тёплый пол. */
  warmFloor?: number;
}

export interface ExtractedProject {
  projectName: string;
  clientName?: string;
  totalAreaSqM: number;
  outlets: number;
  switches: number;
  lightPoints: number;
  utpPoints: number;
  warmFloorCircuits: number;
  /** Высота потолка по проекту, м. */
  ceilingHeightMeters?: number;
  /** Где расположен щит — влияет на длину трасс до помещений. */
  panelLocation?: string;
  rooms?: RoomSpec[];
  dedicatedCircuits?: DedicatedCircuits;
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

/** Одна строка расшифровки: как сложился метраж кабеля. */
export interface CableRouteLeg {
  label: string;
  /** Трасса от щита до распределительной коробки помещения. */
  panelToBoxMeters: number;
  /** Разводка по потолку и стенам внутри помещения. */
  horizontalMeters: number;
  /** Сумма спусков к точкам. */
  dropMeters: number;
  pointCount: number;
  totalMeters: number;
}

export interface CableRouteEstimate {
  /** Освещение и выключатели. */
  cable15: number;
  /** Розеточные группы и отдельные группы потребителей. */
  cable25: number;
  /** Варочная поверхность. */
  cable6: number;
  cableUtp: number;
  legs: CableRouteLeg[];
  /** Помещения синтезированы из общей площади, а не взяты с чертежа. */
  roomsEstimated: boolean;
}

export interface CalculationResult {
  labor: LineItem[];
  materials: LineItem[];
  panel: LineItem[];
  grandTotal: number;
  laborPrice: number;
  cableRoute?: CableRouteEstimate;
}

export interface MultiBrandCalculationResult {
  labor: LineItem[];
  materials: LineItem[];
  laborPrice: number;
  variants: BrandVariants;
  cableRoute?: CableRouteEstimate;
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
    /** Кабель 3*6 идёт только на варочную поверхность, поэтому шаг округления мелкий. */
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
  cableRouting?: CableRoutingRules;
  dedicatedCircuits?: DedicatedCircuitRules;
}

export interface CableRoutingRules {
  enabled: boolean;
  /** Спуск от потолка до розетки/выключателя, если на чертеже его нет. */
  defaultDropMeters: number;
  /** Подключение потолочного светильника — спуск минимальный. */
  lightDropMeters: number;
  /** Средняя площадь помещения, когда комнаты приходится синтезировать из общей площади. */
  defaultRoomAreaSqM: number;
  minRooms: number;
  /** Сколько точек в помещении означают полный обход по периметру. */
  pointsForFullLap: number;
  defaultCeilingHeightMeters: number;
  /**
   * Оценка трассы «щит → помещение», когда её нет на чертеже:
   * постоянная часть плюс множитель на линейный размер квартиры, с границами.
   */
  panelToRoomBaseMeters: number;
  panelToRoomPerSpanMeters: number;
  panelToRoomMinMeters: number;
  panelToRoomMaxMeters: number;
  /** Запас на разделку и укладку концов в коробках. */
  wasteFactor: number;
  /** UTP разводится звездой от щита, а не шлейфом. */
  utpHomeRun: boolean;
}

export interface DedicatedCircuitRules {
  /** Автомат для групп на кабеле 3*2,5. */
  standardAmps: 10 | 16 | 32 | 50;
  /** Автомат варочной поверхности (кабель 3*6). */
  hobAmps: 10 | 16 | 32 | 50;
  labels: Record<keyof DedicatedCircuits, string>;
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
