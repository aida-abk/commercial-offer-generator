/**
 * Прогон реального PDF через извлечение — что модель вернула по помещениям и площади.
 *   npx tsx scripts/debug-extract.ts "Примеры КП/РП Aididar 90м2 interior design.pdf"
 */
import fs from "fs";
import { analyzePdfPages, getSelectedPageNumbers } from "../src/lib/pdf-page-analyzer";
import { pdfBufferToImages } from "../src/lib/pdf-to-images";
import { extractProjectFromImages, usageCostUsd, type ExtractionUsage } from "../src/lib/vision-extract";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Укажите путь к PDF");
  const buffer = fs.readFileSync(file);

  const { pages, texts } = await analyzePdfPages(buffer);
  const override = process.argv[3]?.split(",").map(Number).filter(Boolean);
  const selected = override?.length ? override : getSelectedPageNumbers(pages);
  console.log(`Страниц ${pages.length}, выбрано ${selected.length}: ${selected.join(", ")}`);

  const images = await pdfBufferToImages(buffer, { pageNumbers: selected });
  console.log(
    `Картинок: ${images.length}` +
      images.map((i) => `\n  стр.${i.pageNumber} ${i.width}x${i.height} ${(i.base64.length / 1024).toFixed(0)} КБ base64 ${i.mimeType}`).join(""),
  );
  const selectedTexts = Object.fromEntries(selected.map((n) => [n, texts[n] ?? ""]));
  let usage: ExtractionUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requests: 0 };
  const project = await extractProjectFromImages(images, selectedTexts, (done, total, u) => {
    usage = u;
    console.log(
      `  пачка ${done}/${total} — накоплено ${u.totalTokens.toLocaleString("ru-RU")} токенов`,
    );
  });

  console.log(`\nОбъект: ${project.projectName}`);
  console.log(`Площадь: ${project.totalAreaSqM} м² (источник: ${project.areaSource})`);
  console.log(`Помещений: ${project.rooms?.length ?? 0}`);
  for (const r of project.rooms ?? []) {
    console.log(
      `  ${r.name.padEnd(18)} ${String(r.areaSqM).padStart(6)} м² | роз ${String(r.outlets).padStart(2)} | свет ${String(r.lightPoints).padStart(2)}/${r.lightGroups} | выкл ${r.switchesSingle}+${r.switchesTwoWay}п | т/пол ${r.warmFloorLoops} | конд ${r.airConditioners} | utp ${r.utpPoints}`,
    );
  }
  console.log(`\nАгрегаты: роз ${project.outlets}, выкл ${project.switches}, свет ${project.lightPoints}, utp ${project.utpPoints}`);
  console.log(
    `\nТокены: ${usage.promptTokens.toLocaleString("ru-RU")} вход + ${usage.completionTokens.toLocaleString("ru-RU")} выход = ` +
      `${usage.totalTokens.toLocaleString("ru-RU")} за ${usage.requests} запрос(ов) ≈ $${usageCostUsd(usage).toFixed(3)}`,
  );
  console.log("Заметки:");
  for (const n of project.notes) console.log(`  - ${n}`);
}

void main();
