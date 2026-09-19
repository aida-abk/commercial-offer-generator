import { NextResponse } from "next/server";
import { calculateAllVariants } from "@/lib/calculator";
import type { ExtractedProject, PanelBrandId } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExtractedProject & {
      laborOverride?: number;
      brand?: PanelBrandId;
    };
    const { laborOverride, brand, ...project } = body;
    const result = calculateAllVariants(project as ExtractedProject, laborOverride);
    const activeBrand = brand ?? "schneider-easy9";
    return NextResponse.json({
      ...result,
      activeBrand,
      panel: result.variants[activeBrand].panel,
      grandTotal: result.variants[activeBrand].totalAmount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ошибка расчёта";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
