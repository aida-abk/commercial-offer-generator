import path from "path";
import { readFileSync } from "fs";
import type { CalculationRules, CatalogItem, PriceCatalog } from "./types";

const configDir = path.join(process.cwd(), "config");

function readJson<T>(fileName: string): T {
  const filePath = path.join(configDir, fileName);
  const raw = readFileSync(filePath, "utf-8");
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
