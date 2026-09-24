export type PanelBrandId = "schneider-easy9" | "chint" | "legrand";

export const PANEL_BRAND_IDS: PanelBrandId[] = [
  "schneider-easy9",
  "chint",
  "legrand",
];

/** Тип помещения определяет набор групп: кухня — всегда 4 розеточные группы,
 *  санузел — тёплый пол, кабинет — точка UTP, балкон/тех.помещение — только свет. */
export type RoomType =
  | "kitchen"
  | "living"
  | "bedroom"
  | "office"
  | "hallway"
  | "bathroom"
  | "balcony"
  | "utility"
  | "other";

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  kitchen: "Кухня",
  living: "Гостиная",
  bedroom: "Спальня",
  office: "Кабинет",
  hallway: "Коридор / прихожая",
  bathroom: "Санузел",
  balcony: "Балкон / лоджия",
  utility: "Тех. помещение",
  other: "Другое",
};

/** Комната из дизайн-проекта. Считается единицей расчёта: одна комната —
 *  одна группа освещения (10А) и одна розеточная группа (16А), кроме кухни. */
export interface Room {
  id: string;
  name: string;
  type: RoomType;
  areaSqM: number;
  outlets: number;
  /** Точек света всего (софиты, люстры, бра). */
  lightPoints: number;
  /** Независимых групп света = число мест управления светом.
   *  Софиты внутри группы соединяются шлейфом. */
  lightGroups: number;
  /** Обычные выключатели (мест). */
  switchesSingle: number;
  /** Проходные выключатели (мест, обычно 2 на схему). */
  switchesTwoWay: number;
  /** Схема из 3 мест (мест, 3 на схему). */
  switchesThreeWay: number;
  /** Контуров эл. тёплого пола — на каждый отдельная группа. */
  warmFloorLoops: number;
  /** Внутренних блоков кондиционера — на каждый отдельная группа. */
  airConditioners: number;
  /** Точек UTP (ТВ-зоны, кабинет). */
  utpPoints: number;
}

export type CircuitKind =
  | "light"
  | "socket"
  | "kitchenHob"
  | "kitchenFridge"
  | "kitchenOven"
  | "kitchenSockets"
  | "airCon"
  | "leakSensor"
  | "warmFloor"
  | "utp";

export type CableType = "2x1.5" | "3x1.5" | "3x2.5" | "3x6" | "utp";

/** Одна линия от щита: автомат + кабель своей длины. */
export interface Circuit {
  kind: CircuitKind;
  label: string;
  roomName?: string;
  /** null — линия без автомата в щите (UTP). */
  breakerAmps: 10 | 16 | 32 | null;
  cableType: CableType;
  cableMeters: number;
  /** Розеточные группы подвязываются на УЗО. */
  needsRcd: boolean;
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
  /** Покомнатный состав из дизайн-проекта. Если пусто — восстанавливается
   *  из агрегатов (src/lib/rooms.ts → synthesizeRooms). */
  rooms?: Room[];
  /** Внутренних блоков кондиционера всего (используется, если нет rooms). */
  airConditioners?: number;
  /** Отдельная группа на «Нептун» (датчик протечки воды). */
  leakSensor?: boolean;
  /** Откуда взята общая площадь: из экспликации, сложена из помещений или не найдена. */
  areaSource?: "explication" | "rooms" | "unknown";
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
  plan?: CircuitPlan;
}

export interface MultiBrandCalculationResult {
  labor: LineItem[];
  materials: LineItem[];
  laborPrice: number;
  variants: BrandVariants;
  plan?: CircuitPlan;
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

/** Геометрия трасс. Кабель идёт по потолку от щита и спускается по стене;
 *  все значения — метры, калибруются по эталонным КП (scripts/benchmark-kp-examples.ts). */
export interface RouteGeometry {
  /** Спуск с потолка до точки с запасом — всегда 3 м. */
  dropToPointM: number;
  /** Щит → комната по потолку: base + perSqrtArea * sqrt(общая площадь). */
  panelToRoomBaseM: number;
  panelToRoomPerSqrtAreaM: number;
  /** Разводка внутри комнаты от распредкоробки до точки. */
  inRoomRunPerPointM: number;
  /** Шлейф софит–софит внутри одной группы света. */
  spotToSpotM: number;
  /** Участок между проходными выключателями. */
  twoWayLinkM: number;
  /** Добавка на трассу до внутреннего блока кондиционера. */
  airConExtraM: number;
  /** Добавка на трассу до терморегулятора тёплого пола. */
  warmFloorExtraM: number;
  /** Добавка на кухонные линии (варочная, духовка, холодильник). */
  kitchenApplianceExtraM: number;
  /** Трасса до «Нептуна». */
  leakSensorExtraM: number;
  /** Запас на срезы, доля (0.04 = 4%). */
  wasteFactor: number;
  /** Провод ПУГНП на одну временную лампочку. */
  tempLightPerBulbM: number;
}

/** Ширина аппаратов в модулях — по ней подбирается корпус щита. */
export interface PanelModuleWidths {
  inputBreaker2p: number;
  voltageRelay: number;
  contactor: number;
  rcd: number;
  breaker1p: number;
  terminalRbd: number;
  /** Свободных модулей в запас. */
  spare: number;
  /** Доступные типоразмеры корпуса. */
  sizes: number[];
}

export interface CalculationRules {
  geometry: RouteGeometry;
  panelModuleWidths: PanelModuleWidths;
  rounding: {
    cableMeters: number;
    conduitMeters: number;
    countItems: number;
    cable6Meters?: number;
    pugnpMeters?: number;
    utpMeters?: number;
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

/** Результат сборки групп по комнатам — вход для сметы и для щита. */
export interface CircuitPlan {
  rooms: Room[];
  circuits: Circuit[];
  cableMeters: Record<CableType, number>;
  breakers10a: number;
  breakers16a: number;
  breakers32a: number;
  /** Вводной автомат 2п. */
  inputBreakers: number;
  rcdCount: number;
  panelModules: number;
  panelSize: number;
  socketPoints: number;
  switchPoints: number;
  lightPoints: number;
  utpPoints: number;
  tempBulbs: number;
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
