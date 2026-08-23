import { NextResponse } from "next/server";
import { calculateOffer } from "@/lib/calculator";
import { createOffer } from "@/lib/offer-store";
import { pdfBufferToImages, selectRelevantPages } from "@/lib/pdf-to-images";
import { extractProjectFromImages } from "@/lib/vision-extract";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "PDF файл не загружен" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const images = selectRelevantPages(await pdfBufferToImages(buffer));
    const extracted = await extractProjectFromImages(images);
    const offer = await createOffer({
      projectName: extracted.projectName,
      clientName: extracted.clientName,
      sourceFileName: file.name,
      extractedData: extracted,
    });
    const calc = calculateOffer(extracted, offer.laborPrice);

    return NextResponse.json({
      id: offer.id,
      extracted,
      summary: {
        projectName: offer.projectName,
        grandTotal: offer.totalAmount,
        laborCount: calc.labor.length,
        materialsCount: calc.materials.length,
        panelCount: calc.panel.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ошибка обработки PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
