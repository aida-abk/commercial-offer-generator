/**
 * Подбор щита по занятости в модулях и расчёт числа УЗО.
 *
 * Правила заданы инженерами: корпус берут по фактическому числу модулей плюс
 * запас, на одно УЗО подвязывают три-четыре розеточные группы. Логика вынесена
 * отдельно от калькулятора, чтобы её можно было сверить с готовыми КП напрямую.
 */
import type { PanelSizeRules, RcdRules } from "./types";

/** Что стоит в щите. Ширины аппаратов берутся из правил. */
export interface PanelComposition {
  /** Однополюсные автоматы групп: 10, 16, 25 и 32 А. */
  breakers1p: number;
  /** Полюсов у вводного автомата: два на одной фазе, четыре на трёх. */
  inputPoles: number;
  rcd: number;
  contactor: number;
  voltageRelay: number;
  terminalBlocks: number;
  busBars: number;
  /** Трёхфазный ввод: УЗО там на три полюса с нулём и занимает больше места. */
  threePhase: boolean;
}

const FALLBACK_WIDTHS: Record<string, number> = {
  breaker1p: 1,
  inputPole: 1,
  rcd: 2,
  rcd3p: 4,
  contactor: 2,
  voltageRelay: 2,
  terminalBlock: 1.5,
  busBar: 1.5,
};

function width(rules: PanelSizeRules, key: string): number {
  return rules.moduleWidths?.[key] ?? FALLBACK_WIDTHS[key] ?? 1;
}

/**
 * На одно УЗО подвязывают три-четыре автомата 16А, то есть только розеточные
 * группы. По готовым КП среднее отношение — около 4,3 автомата на УЗО.
 */
export function countRcd(breakers16: number, rules: RcdRules): number {
  const perRcd = rules.breakers16PerRcd ?? 4.5;
  return Math.max(rules.min ?? 2, Math.round(breakers16 / perRcd));
}

/** Сколько модулей DIN-рейки занимает начинка щита. */
export function countModules(
  composition: PanelComposition,
  rules: PanelSizeRules,
): number {
  const rcdWidth = composition.threePhase ? width(rules, "rcd3p") : width(rules, "rcd");
  return (
    composition.breakers1p * width(rules, "breaker1p") +
    composition.inputPoles * width(rules, "inputPole") +
    composition.rcd * rcdWidth +
    composition.contactor * width(rules, "contactor") +
    composition.voltageRelay * width(rules, "voltageRelay") +
    composition.terminalBlocks * width(rules, "terminalBlock") +
    composition.busBars * width(rules, "busBar")
  );
}

/**
 * Корпус берут по занятости плюс запас под будущие доработки. Если проект не
 * влезает даже в самый большой корпус из каталога, берём самый большой.
 */
export function choosePanel(
  usedModules: number,
  rules: PanelSizeRules,
): { modules: number; panelId: string } {
  const required = usedModules + (rules.spareModules ?? 12);
  const sorted = [...rules.thresholds].sort((a, b) => a.modules - b.modules);
  return sorted.find((t) => required <= t.modules) ?? sorted[sorted.length - 1];
}
