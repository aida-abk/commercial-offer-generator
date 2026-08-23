import { NextResponse } from "next/server";
import { calculateOffer } from "@/lib/calculator";
import type { ExtractedProject } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExtractedProject & { laborOverride?: number };
    const { laborOverride, ...project } = body;
    const result = calculateOffer(project as ExtractedProject, laborOverride);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ошибка расчёта";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
