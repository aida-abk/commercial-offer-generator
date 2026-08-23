import { NextResponse } from "next/server";
import { generateOfferPdfHtml } from "@/lib/generate-pdf-html";
import { getOffer } from "@/lib/offer-store";

export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Параметр id обязателен" }, { status: 400 });
  }

  const offer = await getOffer(id);
  if (!offer) {
    return NextResponse.json({ error: "КП не найдено" }, { status: 404 });
  }

  const html = generateOfferPdfHtml({
    projectName: offer.projectName,
    clientName: offer.clientName,
    sections: offer.lineItems,
    grandTotal: offer.totalAmount,
  });

  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfUint8 = await page.pdf({ format: "A4", printBackground: true });
    const pdfBuffer = Buffer.from(pdfUint8);
    const asciiName = `KP-${offer.id.slice(0, 8)}.pdf`;
    const encodedName = encodeURIComponent(`КП-${offer.projectName}.pdf`);
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ошибка генерации PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await browser.close();
  }
}
