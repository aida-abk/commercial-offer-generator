import { CALCULATED_MATERIAL_IDS } from "./calculator";
import { loadPanelBrands, loadPriceCatalog } from "./catalog";

/** Собирает все строковые значения из конфигурации брендов щита. */
function collectStrings(value: unknown, acc: Set<string>): void {
  if (typeof value === "string") {
    acc.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, acc);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, acc);
  }
}

/** Позиции щита, которые калькулятор подставляет помимо конфигурации брендов. */
const EXTRA_PANEL_IDS = ["terminal-block-rbd"];

/**
 * Позиции каталога, на которых держится автоматический расчёт. Их нельзя
 * удалять из прайса: findCatalogItem перестанет их находить, и строка просто
 * исчезнет из будущих КП — без ошибки и без следа.
 *
 * Список собирается из кода и конфигурации, а не ведётся руками, иначе он
 * разойдётся с расчётом при первой же правке.
 */
export function calculatedCatalogIds(): Set<string> {
  const catalog = loadPriceCatalog();
  const panelIds = new Set(catalog.panel.map((item) => item.id));

  const fromBrands = new Set<string>();
  collectStrings(loadPanelBrands(), fromBrands);

  const used = new Set<string>(CALCULATED_MATERIAL_IDS);
  for (const id of [...fromBrands, ...EXTRA_PANEL_IDS]) {
    if (panelIds.has(id)) used.add(id);
  }
  return used;
}
