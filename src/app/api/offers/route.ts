import { NextResponse } from "next/server";
import { createOffer, listOffers } from "@/lib/offer-store";
import type { ExtractedProject, OfferRecord } from "@/lib/types";

function serializeOffer(offer: OfferRecord) {
  return {
    ...offer,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}

export async function GET() {
  const offers = await listOffers();
  return NextResponse.json(offers.map(serializeOffer));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      projectName?: string;
      clientName?: string;
      sourceFileName?: string;
      extractedData: ExtractedProject;
      laborOverride?: number;
    };
    if (!body.extractedData) {
      return NextResponse.json({ error: "extractedData обязателен" }, { status: 400 });
    }
    const offer = await createOffer({
      projectName: body.projectName ?? body.extractedData.projectName,
      clientName: body.clientName,
      sourceFileName: body.sourceFileName,
      extractedData: body.extractedData,
      laborOverride: body.laborOverride,
    });
    return NextResponse.json(serializeOffer(offer), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ошибка создания";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
