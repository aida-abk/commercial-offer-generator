import { writeFileSync } from "fs";
import { NextResponse } from "next/server";
import { clearCatalogCache, loadPriceCatalog, priceCatalogPath } from "@/lib/catalog";
import type { PriceCatalog } from "@/lib/types";

export async function GET() {
  return NextResponse.json(loadPriceCatalog());
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Partial<PriceCatalog>;
    const current = loadPriceCatalog();
    const updated: PriceCatalog = {
      materials: body.materials ?? current.materials,
      panel: body.panel ?? current.panel,
      labor: body.labor ?? current.labor,
    };
    writeFileSync(priceCatalogPath(), `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
    clearCatalogCache();
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ошибка сохранения прайса";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
