/**
 * Формат чисел в КП. Правило простое: показываем столько знаков, сколько есть
 * на самом деле. Целое число печатается целым — «200 м», а не «200,00 м».
 */

const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const moneyWithKopecks = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Сумма в тенге: «450 000». Дробная часть показывается только если она есть
 * (например, после ручной правки цены), тиынов в обороте нет.
 */
export function formatTenge(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? moneyFormatter.format(rounded)
    : moneyWithKopecks.format(rounded);
}

/**
 * Количество: «200», «12,5», «0,75». Хвостовые нули не печатаются —
 * в смете «200,00 м» читается хуже, чем «200 м».
 */
export function formatQuantity(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number(value.toFixed(maxDecimals));
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(rounded);
}

/** Площади и длины: «90», «16,2», «27,8». */
export function formatMeasure(value: number, maxDecimals = 1): string {
  return formatQuantity(value, maxDecimals);
}

/**
 * Разбор числа из поля ввода: принимает и «86.4», и «86,4», и «86 400».
 * Нужен потому, что <input type="number"> в браузере с английской локалью
 * молча выбрасывает запятую, превращая 86,4 в 864.
 */
export function parseDecimalInput(input: string): number {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  if (!normalized) return 0;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseTenge(input: string): number {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
