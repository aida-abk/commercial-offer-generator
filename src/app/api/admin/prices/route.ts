import { writeFileSync } from "fs";
import { NextResponse } from "next/server";
import { clearCatalogCache, loadPriceCatalog, priceCatalogPath } from "@/lib/catalog";
import { calculatedCatalogIds } from "@/lib/catalog-usage";
import type { CatalogItem, PriceCatalog } from "@/lib/types";

type Section = "materials" | "panel";

export async function GET() {
  return NextResponse.json({
    ...loadPriceCatalog(),
    // По этому списку админка помечает позиции, которые нельзя удалять.
    calculatedIds: [...calculatedCatalogIds()],
  });
}

/** Приводит присланную позицию к каталожной, попутно проверяя её. */
function normalizeItem(raw: unknown, section: Section, index: number): CatalogItem {
  if (!raw || typeof raw !== "object") {
    throw new Error(`${section}: позиция №${index + 1} повреждена`);
  }
  const item = raw as Partial<CatalogItem>;
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const unit = typeof item.unit === "string" ? item.unit.trim() : "";
  const price = Number(item.price);
  const id = typeof item.id === "string" ? item.id.trim() : "";

  if (!id) throw new Error(`${section}: позиция №${index + 1} без идентификатора`);
  if (!name) throw new Error(`Позиция «${id}»: название не может быть пустым`);
  if (!unit) throw new Error(`Позиция «${name}»: не указана единица измерения`);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Позиция «${name}»: цена должна быть числом не меньше нуля`);
  }

  return { id, name, unit, price };
}

function normalizeSection(raw: unknown, section: Section, fallback: CatalogItem[]): CatalogItem[] {
  if (raw === undefined) return fallback;
  if (!Array.isArray(raw)) throw new Error(`${section}: ожидался список позиций`);

  const items = raw.map((item, index) => normalizeItem(item, section, index));

  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new Error(`Идентификатор «${item.id}» встречается дважды`);
    }
    seen.add(item.id);
  }
  return items;
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Partial<PriceCatalog>;
    const current = loadPriceCatalog();

    const updated: PriceCatalog = {
      materials: normalizeSection(body.materials, "materials", current.materials),
      panel: normalizeSection(body.panel, "panel", current.panel),
      labor: body.labor ?? current.labor,
    };

    // Последний рубеж: даже если интерфейс ошибётся, позиции, на которых
    // держится расчёт, не должны пропасть из прайса.
    const remaining = new Set([...updated.materials, ...updated.panel].map((i) => i.id));
    const lost = [...calculatedCatalogIds()].filter((id) => !remaining.has(id));
    if (lost.length > 0) {
      const names = lost
        .map((id) => [...current.materials, ...current.panel].find((i) => i.id === id)?.name ?? id)
        .slice(0, 5);
      throw new Error(
        `Эти позиции участвуют в автоматическом расчёте, удалять их нельзя: ${names.join(", ")}` +
          (lost.length > 5 ? ` и ещё ${lost.length - 5}` : ""),
      );
    }

    writeFileSync(priceCatalogPath(), `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
    clearCatalogCache();
    return NextResponse.json({ ...updated, calculatedIds: [...calculatedCatalogIds()] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ошибка сохранения прайса";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
