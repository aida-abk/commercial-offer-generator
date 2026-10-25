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
/**
 * Тип помещения. Кухня получает сразу четыре розеточные группы, а в коридоре и
 * спальне проектируют проходные выключатели, поэтому тип влияет на метраж.
 */
export type RoomKind = "kitchen" | "corridor" | "bedroom" | "bathroom" | "living" | "other";

export interface RoomSpec {
  name: string;
  kind?: RoomKind;
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
  /**
   * Сколько розеточных линий приходит в помещение от щита. По умолчанию одна;
   * у кухни их всегда четыре. Большой гостиной иногда дают две.
   */
  socketGroups?: number;
  outlets: number;
  switches: number;
  lightPoints: number;
  utpPoints: number;
}

/**
 * Потребители, которым нужна отдельная группа (свой автомат).
 * Все идут кабелем ВВГнг 3*2,5 и автоматом 16А, кроме варочной поверхности —
 * она на кабеле 3*6 и автомате 32А.
 *
 * Варочная поверхность, холодильник и духовой шкаф со СВЧ стоят на кухне и
 * вместе с группой остальных кухонных розеток дают те четыре кабеля,
 * которые всегда уходят на кухню.
 */
export interface DedicatedCircuits {
  /** Холодильник. */
  fridge?: number;
  /** Морозильник. */
  freezer?: number;
  /** Кондиционеры: каждый требует своей группы, трасса до внутреннего блока. */
  airConditioners?: number;
  /** Варочная поверхность (электроплита) — единственная группа на кабеле 3*6. */
  hob?: number;
  /** Духовой шкаф и СВЧ — одна объединённая группа. */
  ovenMicrowave?: number;
  /** Тёплый пол: своя группа на каждый контур. */
  warmFloor?: number;
  /** Датчик протечки воды («нептун»). */
  leakSensor?: number;
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
  /**
   * Трёхфазный ввод (380 В, вводной автомат на четыре полюса). Тогда в щите
   * три реле контроля напряжения, а УЗО занимают по четыре модуля.
   */
  threePhase?: boolean;
  rooms?: RoomSpec[];
  /**
   * Число помещений, когда разбивку точек по комнатам снять не удалось.
   * Помещения с чертежа посчитать почти всегда можно, а от их числа зависят и
   * группы в щите, и трассы, поэтому эта подсказка точнее оценки по площади.
   */
  roomCount?: number;
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
  /** Число помещений: от него зависит состав щита. */
  roomCount: number;
  /** Розеточные группы по помещениям (16А). Кухонные приходят отдельными группами. */
  socketGroups: number;
  /** Группы освещения (10А): по одной на помещение. */
  lightGroups: number;
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
  /**
   * Сколько подрозетников стоит в одном блоке. Розетки ставят блоками по
   * несколько штук в ряд: спуск с потолка на блок один, а внутри блока
   * подрозетники соединены короткими перемычками.
   */
  socketsPerDrop: number;
  /** Перемычка между соседними подрозетниками в блоке. */
  blockJumpMeters: number;
  /** Сколько розеточных групп уходит на кухню: варочная, холодильник, духовой шкаф со СВЧ и остальные розетки. */
  kitchenSocketGroups: number;
  /**
   * Сколько розеточных групп 16А приходится на помещение, если разбивки по
   * группам с чертежа нет. Инженерное правило «одна группа на комнату» —
   * это только бытовые розетки; сверх них идут кухонные группы, кондиционеры,
   * тёплые полы и датчик протечки. В готовых КП суммарно выходит 2-3 группы на
   * помещение, поэтому это нижняя граница на случай, когда технику на чертеже
   * не распознали.
   */
  socketGroupsPerRoom: number;
  /** Помещения, где проектируют проходные выключатели. */
  twoWaySwitchRoomKinds: RoomKind[];
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
  /**
   * Минимум кабеля 3*6 на группу варочной поверхности. Трасса до кухни короче,
   * но такой кабель берут куском: в готовых КП это всегда 17-25 м независимо от
   * площади объекта.
   */
  cable6MinMetersPerCircuit: number;
  /** UTP разводится звездой от щита, а не шлейфом. */
  utpHomeRun: boolean;
}

export interface RcdRules {
  /** Сколько автоматов 16А подвязывают на одно УЗО. */
  breakers16PerRcd?: number;
  min?: number;
}

export interface PanelSizeRules {
  /** Запас модулей под будущие доработки поверх фактической занятости. */
  spareModules?: number;
  /** Ширина аппаратов в модулях: автомат 1п — 1, УЗО — 2, колодка РБД — 1,5. */
  moduleWidths?: Record<string, number>;
  /** Колодки РБД и нулевые шины стоят в щите всегда и тоже занимают рейку. */
  terminalBlocks?: number;
  busBars?: number;
  thresholds: { modules: number; panelId: string }[];
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
