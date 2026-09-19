import { NextResponse } from "next/server";
import { getOffer, updateOffer } from "@/lib/offer-store";
import type { OfferRecord, OfferSections } from "@/lib/types";

function serializeOffer(offer: OfferRecord) {
  return {
    ...offer,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const offer = await getOffer(id);
  if (!offer) {
    return NextResponse.json({ error: "КП не найдено" }, { status: 404 });
  }
  return NextResponse.json(serializeOffer(offer));
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as {
      projectName?: string;
      clientName?: string;
      laborPrice?: number;
      lineItems?: OfferSections;
      brandVariants?: import("@/lib/types").BrandVariants;
      activeBrand?: import("@/lib/types").PanelBrandId;
      totalAmount?: number;
    };
    const offer = await updateOffer(id, body);
    if (!offer) {
      return NextResponse.json({ error: "КП не найдено" }, { status: 404 });
    }
    return NextResponse.json(serializeOffer(offer));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ошибка обновления";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
