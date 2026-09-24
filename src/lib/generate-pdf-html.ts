import { loadCompanyBoilerplate } from "./catalog";
import { getCompanyLogoDataUri } from "./company-logo";
import { formatQuantity, formatTenge } from "./format";
import type { CompanyBoilerplate, LineItem, OfferSections } from "./types";

export interface GeneratePdfHtmlInput {
  projectName: string;
  clientName?: string;
  totalAreaSqM?: number;
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

type TableLayout = "labor" | "materials" | "panel";

function renderTable(
  layout: TableLayout,
  title: string,
  rows: LineItem[],
  totalLabel: string,
): string {
  if (rows.length === 0) return "";

  const headers =
    layout === "labor"
      ? ["№", "Наименование работ", "Единица измерения", "Кол-во", "Цена за единицу", "Сумма, тг"]
      : layout === "materials"
        ? ["№", "Товары", "Кол-во", "Ед", "Цена", "Сумма"]
        : ["№", "Товары", "Кол-во", "Ед.изм", "Цена", "Сумма"];

  const body = rows
    .map(
      (row, index) => `
      <tr>
        <td class="num">${index + 1}</td>
        <td>${escapeHtml(row.name)}</td>
        ${
          layout === "labor"
            ? `<td>${escapeHtml(row.unit)}</td><td class="num">${formatQuantity(row.quantity)}</td>`
            : `<td class="num">${formatQuantity(row.quantity)}</td><td>${escapeHtml(row.unit)}</td>`
        }
        <td class="num">${formatTenge(row.unitPrice)}</td>
        <td class="num">${formatTenge(row.total)}</td>
      </tr>`,
    )
    .join("");

  const sectionTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return `
    <h2 class="section-title">${escapeHtml(title)}</h2>
    <table class="kp-table">
      <thead>
        <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="5"><strong>${escapeHtml(totalLabel)}</strong></td>
          <td class="num total-cell"><strong>${formatTenge(sectionTotal)}</strong></td>
        </tr>
      </tfoot>
    </table>`;
}

function renderList(title: string, items: string[]): string {
  const lis = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<h3>${escapeHtml(title)}</h3><ul>${lis}</ul>`;
}

function renderHeader(company: CompanyBoilerplate): string {
  const logo = getCompanyLogoDataUri();
  const h = company.header;
  const bio = company.bioExtended ?? company.bio;

  return `
    <header class="kp-header">
      <div class="kp-header-row">
        <div class="kp-col kp-col-left">
          <p class="legal-name">${escapeHtml(h.legalNameRu)}</p>
          <p>${escapeHtml(h.addressRu)}</p>
          <p>ИИН/БИН ${escapeHtml(h.iinBin)}</p>
          <p>${escapeHtml(h.bankRu)}</p>
          <p>ИИК ${escapeHtml(h.iik)}</p>
          <p>БИК ${escapeHtml(h.bik)}</p>
          <p>${escapeHtml(h.phoneDisplay)}</p>
        </div>
        <div class="kp-col kp-col-center">
          <img src="${logo}" alt="JT electrics" class="kp-logo" />
        </div>
        <div class="kp-col kp-col-right">
          <p class="legal-name">${escapeHtml(h.legalNameKk)}</p>
          <p>${escapeHtml(h.addressKk)}</p>
          <p>БСН/ЖСН ${escapeHtml(h.iinBin)}</p>
          <p>${escapeHtml(h.bankKk)}</p>
          <p>ЖСК ${escapeHtml(h.iik)}</p>
          <p>БАНК БСК ${escapeHtml(h.bik)}</p>
          <p>${escapeHtml(h.phoneDisplay)}</p>
        </div>
      </div>

      <div class="kp-license-block">
        <p>Номер лицензии: ${escapeHtml(company.license)}</p>
        <p>ФИО: ${escapeHtml(company.ownerName)}</p>
        <p>Контакты: ${escapeHtml(company.phones.join(", "))}</p>
        <p>email: ${escapeHtml(company.email)}</p>
      </div>

      <p class="kp-bio">${escapeHtml(bio)}</p>

      <div class="kp-contacts-repeat">
        <p>Тел. ${escapeHtml(company.phones[0] ?? "")}</p>
        ${company.phones[1] ? `<p>${escapeHtml(company.phones[1])}</p>` : ""}
        <p>Email: ${escapeHtml(company.email)}</p>
      </div>
    </header>`;
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

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Коммерческое предложение — ${escapeHtml(input.projectName)}</title>
  <style>
    @page { size: A4; margin: 10mm 10mm 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9.5pt;
      color: #111;
      line-height: 1.3;
      margin: 0;
    }
    .kp-header { margin-bottom: 10px; }
    .kp-header-row {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 8px;
      align-items: start;
    }
    .kp-col { font-size: 8.5pt; line-height: 1.35; }
    .kp-col p { margin: 0 0 1px; }
    .kp-col-left { text-align: left; }
    .kp-col-right { text-align: right; }
    .kp-col-center {
      display: flex;
      justify-content: center;
      align-items: center;
      padding-top: 2px;
    }
    .legal-name { font-weight: 700; margin-bottom: 2px !important; }
    .kp-logo {
      display: block;
      height: 72px;
      width: auto;
      max-width: 150px;
    }
    .kp-license-block {
      margin: 6px 0 8px;
      text-align: right;
      font-size: 8.5pt;
      line-height: 1.35;
    }
    .kp-license-block p { margin: 0; }
    .kp-bio {
      margin: 0 0 8px;
      font-size: 8.5pt;
      line-height: 1.35;
      text-align: justify;
    }
    .kp-contacts-repeat {
      margin: 0 0 10px;
      text-align: right;
      font-size: 8.5pt;
      line-height: 1.35;
    }
    .kp-contacts-repeat p { margin: 0; }
    .doc-title {
      margin: 8px 0 2px;
      text-align: center;
      font-size: 13pt;
      font-weight: 700;
    }
    .doc-subtitle {
      margin: 0 0 8px;
      text-align: center;
      font-size: 10pt;
      font-weight: 700;
    }
    .project-meta {
      margin: 0 0 10px;
      font-size: 9pt;
    }
    .project-meta p { margin: 2px 0; }
    .section-title {
      margin: 10px 0 4px;
      font-size: 10pt;
      font-weight: 700;
      text-align: center;
    }
    .kp-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6px;
      font-size: 8.5pt;
    }
    .kp-table th, .kp-table td {
      border: 1px solid #000;
      padding: 2px 4px;
      vertical-align: top;
    }
    .kp-table th {
      font-weight: 700;
      text-align: center;
      background: #fff;
    }
    .kp-table td.num, .kp-table th.num { text-align: right; white-space: nowrap; }
    .total-row td { font-weight: 700; }
    .total-cell {
      background: #ffff00;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .grand-total {
      margin: 10px 0 14px;
      text-align: right;
      font-size: 11pt;
      font-weight: 700;
    }
    .company-block { margin-top: 16px; font-size: 8.5pt; }
    ul { margin: 4px 0 8px 18px; padding: 0; }
    .footer-note { margin-top: 10px; font-size: 8pt; color: #444; }
  </style>
</head>
<body>
  ${renderHeader(company)}

  <h1 class="doc-title">Коммерческое предложение</h1>
  <p class="doc-subtitle">Электромонтажные (черновые) работы</p>

  <div class="project-meta">
    <p><strong>Объект:</strong> ${escapeHtml(input.projectName)}</p>
    ${input.clientName ? `<p><strong>Заказчик:</strong> ${escapeHtml(input.clientName)}</p>` : ""}
    ${input.totalAreaSqM ? `<p><strong>Площадь:</strong> ${input.totalAreaSqM} м²</p>` : ""}
    <p><strong>Дата:</strong> ${escapeHtml(date)}</p>
  </div>

  ${renderTable("labor", "Электромонтажные работы", input.sections.labor, "Итого по работам")}
  ${renderTable("materials", "Материалы", input.sections.materials, "Итого")}
  ${renderTable("panel", "Эл.щит и комплектующие", input.sections.panel, "Итого по матер.")}

  <p class="grand-total">${formatTenge(grandTotal)}</p>

  <div class="company-block">
    <p><strong>${escapeHtml(company.giftOffer)}</strong></p>
    ${renderList("Гарантии", company.guarantees)}
    ${renderList("Регламент качества", company.qualityRegulations)}
    ${renderList("Сервис на объекте", company.serviceOnSite)}
    <p class="footer-note">${escapeHtml(company.footerNote)}</p>
  </div>
</body>
</html>`;
}
