import { loadCompanyBoilerplate } from "./catalog";
import { formatTenge } from "./format";
import type { LineItem, OfferSections } from "./types";

export interface GeneratePdfHtmlInput {
  projectName: string;
  clientName?: string;
  sections: OfferSections;
  grandTotal?: number;
  generatedAt?: Date;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTable(title: string, rows: LineItem[]): string {
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.unit)}</td>
        <td class="num">${row.quantity}</td>
        <td class="num">${formatTenge(row.unitPrice)}</td>
        <td class="num">${formatTenge(row.total)}</td>
      </tr>`,
    )
    .join("");
  const sectionTotal = rows.reduce((sum, r) => sum + r.total, 0);
  return `
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead>
        <tr>
          <th>№</th>
          <th>Наименование</th>
          <th>Ед.</th>
          <th>Кол-во</th>
          <th>Цена, ₸</th>
          <th>Сумма, ₸</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr>
          <td colspan="5"><strong>Итого по разделу</strong></td>
          <td class="num"><strong>${formatTenge(sectionTotal)}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}

function renderList(title: string, items: string[]): string {
  const lis = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<h3>${escapeHtml(title)}</h3><ul>${lis}</ul>`;
}

/** Build full КП HTML document inline (no separate template file). */
export function generateOfferPdfHtml(input: GeneratePdfHtmlInput): string {
  const company = loadCompanyBoilerplate();
  const date = (input.generatedAt ?? new Date()).toLocaleDateString("ru-RU");
  const grandTotal =
    input.grandTotal ??
    [...input.sections.labor, ...input.sections.materials, ...input.sections.panel].reduce(
      (sum, item) => sum + item.total,
      0,
    );

  const phones = company.phones.join(", ");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Коммерческое предложение — ${escapeHtml(input.projectName)}</title>
  <style>
    @page { size: A4; margin: 18mm 14mm; }
    body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #111; line-height: 1.35; }
    h1 { font-size: 16pt; text-align: center; margin: 0 0 8px; }
    h2 { font-size: 13pt; margin: 18px 0 8px; border-bottom: 1px solid #333; padding-bottom: 4px; }
    h3 { font-size: 11pt; margin: 12px 0 6px; }
    .meta { margin-bottom: 16px; }
    .meta p { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 1px solid #444; padding: 4px 6px; vertical-align: top; }
    th { background: #f0f0f0; font-weight: bold; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    .grand-total { margin-top: 16px; font-size: 13pt; text-align: right; }
    .company-block { margin-top: 24px; font-size: 10pt; }
    ul { margin: 4px 0 8px 18px; padding: 0; }
    .footer-note { margin-top: 12px; font-size: 9pt; color: #444; }
  </style>
</head>
<body>
  <h1>Коммерческое предложение</h1>
  <div class="meta">
    <p><strong>Объект:</strong> ${escapeHtml(input.projectName)}</p>
    ${input.clientName ? `<p><strong>Заказчик:</strong> ${escapeHtml(input.clientName)}</p>` : ""}
    <p><strong>Дата:</strong> ${escapeHtml(date)}</p>
    <p><strong>Компания:</strong> ${escapeHtml(company.companyName)} · ${escapeHtml(company.ownerName)}</p>
    <p><strong>Лицензия:</strong> ${escapeHtml(company.license)}</p>
    <p><strong>Тел.:</strong> ${escapeHtml(phones)} · ${escapeHtml(company.email)}</p>
  </div>

  ${renderTable("1. Работы", input.sections.labor)}
  ${renderTable("2. Материалы", input.sections.materials)}
  ${renderTable("3. Электрический щит и автоматика", input.sections.panel)}

  <p class="grand-total"><strong>ИТОГО: ${formatTenge(grandTotal)} ₸</strong></p>

  <div class="company-block">
    <p>${escapeHtml(company.bio)}</p>
    <p><strong>Партнёры:</strong> ${escapeHtml(company.partners)}</p>
    <p><strong>Квалификация:</strong> ${escapeHtml(company.qualifications)}</p>
    <p><strong>${escapeHtml(company.giftOffer)}</strong></p>
    ${renderList("Гарантии", company.guarantees)}
    ${renderList("Регламент качества", company.qualityRegulations)}
    ${renderList("Сервис на объекте", company.serviceOnSite)}
    <p class="footer-note">${escapeHtml(company.footerNote)}</p>
  </div>
</body>
</html>`;
}
