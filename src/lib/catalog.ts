import path from "path";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import type { CalculationRules, CatalogItem, PriceCatalog } from "./types";

const configDir = path.join(process.cwd(), "config");

/**
 * Папка изменяемых данных. На сервере она лежит на отдельном томе (DATA_DIR),
 * иначе обновление кода затирает цены, правленные через админку.
 * Локально, когда DATA_DIR не задан, всё остаётся в config/ как раньше.
 */
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : configDir;

/** Файлы, которые правятся из интерфейса и потому живут в DATA_DIR. */
const MUTABLE_FILES = new Set(["price-catalog.json"]);

function resolveConfigPath(fileName: string): string {
  if (!MUTABLE_FILES.has(fileName) || dataDir === configDir) {
    return path.join(configDir, fileName);
  }
  const target = path.join(dataDir, fileName);
  // Первый запуск на чистом томе: кладём эталон из репозитория.
  if (!existsSync(target)) {
    mkdirSync(dataDir, { recursive: true });
    copyFileSync(path.join(configDir, fileName), target);
  }
  return target;
}

/** Путь к прайсу — им же пользуется админка при сохранении. */
export function priceCatalogPath(): string {
  return resolveConfigPath("price-catalog.json");
}

function readJson<T>(fileName: string): T {
  const raw = readFileSync(resolveConfigPath(fileName), "utf-8");
  return JSON.parse(raw) as T;
}

let catalogCache: PriceCatalog | null = null;
let rulesCache: CalculationRules | null = null;

export function loadPriceCatalog(): PriceCatalog {
  if (!catalogCache) {
    catalogCache = readJson<PriceCatalog>("price-catalog.json");
  }
  return catalogCache;
}

export function loadCalculationRules(): CalculationRules {
  if (!rulesCache) {
    rulesCache = readJson<CalculationRules>("calculation-rules.json");
  }
  return rulesCache;
}

export function loadCompanyBoilerplate() {
  return readJson<import("./types").CompanyBoilerplate>("company-boilerplate.json");
}

export function loadPanelBrands() {
  return readJson<Record<string, import("./types").PanelBrandConfig>>("panel-brands.json");
}

export function findCatalogItem(
  section: "materials" | "panel",
  id: string,
): CatalogItem | undefined {
  const catalog = loadPriceCatalog();
  return catalog[section].find((item) => item.id === id);
}

export function allCatalogItems(): CatalogItem[] {
  const catalog = loadPriceCatalog();
  return [...catalog.materials, ...catalog.panel];
}

export function clearCatalogCache(): void {
  catalogCache = null;
  rulesCache = null;
}
