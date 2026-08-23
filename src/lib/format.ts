const tengeFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Format number as tenge display: "450 000,0" */
export function formatTenge(value: number): string {
  return tengeFormatter.format(value);
}

export function parseTenge(input: string): number {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
