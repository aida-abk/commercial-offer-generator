/**
 * Проверка правил щита против готовых КП.
 *
 * Состав щита зависит от числа групп, а число групп — от помещений и техники,
 * которых в КП нет. Поэтому здесь в наши формулы подаются фактические
 * количества автоматов из самого КП: тогда проверяются ровно два правила,
 * которые дали инженеры, — число УЗО по розеточным группам и подбор корпуса
 * по занятости в модулях. Угадывание групп в этот замер не попадает.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { extractKpActuals } from "./extract-kp-cables";
import { loadCalculationRules } from "../src/lib/catalog";
import { choosePanel, countModules, countRcd } from "../src/lib/panel-sizing";
import type { PanelSizeRules, RcdRules } from "../src/lib/types";

const EXAMPLES_DIR = path.join(process.cwd(), "Примеры КП");

interface Row {
  name: string;
  breakers1p: number;
  inputPoles: number;
  threePhase: boolean;
  actualRcd?: number;
  ourRcd: number;
  usedModules: number;
  actualPanel?: number;
  ourPanel: number;
}

async function main() {
  const rules = loadCalculationRules();
  const panelSize = rules.formulas.panelSize as PanelSizeRules;
  const rcdRules = rules.formulas.rcd as RcdRules;

  const files = readdirSync(EXAMPLES_DIR).filter(
    (f) => f.toLowerCase().endsWith(".pdf") && /кп/i.test(f),
  );

  const rows: Row[] = [];
  for (const file of files) {
    const { items } = await extractKpActuals(file);
    const breakers16 = items.breaker16;
    if (breakers16 === undefined) continue;

    const breakers1p =
      (items.breaker10 ?? 0) + breakers16 + (items.breaker25 ?? 0) + (items.breaker32 ?? 0);
    // Четырёхполюсный ввод и три реле напряжения выдают трёхфазный щит.
    const inputPoles = items.inputPoles ?? 2;
    const threePhase = inputPoles === 4;
    const ourRcd = countRcd(breakers16, rcdRules);
    const usedModules = countModules(
      {
        breakers1p,
        inputPoles: (items.breakerInput ?? 1) * inputPoles,
        rcd: items.rcd ?? ourRcd,
        contactor: items.contactor ?? 1,
        voltageRelay: items.voltageRelay ?? (threePhase ? 3 : 1),
        terminalBlocks: items.terminalBlock ?? (panelSize.terminalBlocks ?? 4),
        busBars: panelSize.busBars ?? 2,
        threePhase,
      },
      panelSize,
    );

    rows.push({
      name: file.replace(/\.pdf$/i, "").trim(),
      breakers1p,
      inputPoles,
      threePhase,
      actualRcd: items.rcd,
      ourRcd,
      usedModules,
      actualPanel: items.panelModules,
      ourPanel: choosePanel(usedModules, panelSize).modules,
    });
  }

  console.log("=== Щит: наши правила против готовых КП ===\n");
  console.log(
    `${"Проект".padEnd(22)}${"1п авт".padStart(7)}${"УЗО КП".padStart(8)}${"наше".padStart(6)}${"модулей".padStart(9)}${"щит КП".padStart(8)}${"наш".padStart(6)}`,
  );

  let rcdTotal = 0;
  let rcdHit = 0;
  let panelTotal = 0;
  let panelHit = 0;
  let panelStepOff = 0;

  for (const row of rows) {
    if (row.actualRcd !== undefined) {
      rcdTotal += 1;
      if (row.actualRcd === row.ourRcd) rcdHit += 1;
    }
    if (row.actualPanel !== undefined) {
      panelTotal += 1;
      if (row.actualPanel === row.ourPanel) panelHit += 1;
      else panelStepOff += 1;
    }
    const mark = row.actualPanel === row.ourPanel ? " " : "*";
    console.log(
      `${(row.name + (row.threePhase ? " (3ф)" : "")).padEnd(22)}${String(row.breakers1p).padStart(7)}${String(row.actualRcd ?? "-").padStart(8)}${String(row.ourRcd).padStart(6)}${row.usedModules.toFixed(1).padStart(9)}${String(row.actualPanel ?? "-").padStart(8)}${String(row.ourPanel).padStart(5)}${mark}`,
    );
  }

  console.log(
    `\nУЗО: угадано ${rcdHit}/${rcdTotal}` +
      `\nКорпус щита: угадано ${panelHit}/${panelTotal}, мимо ${panelStepOff}`,
  );

  // Запас, который фактически оставляли в готовых КП: от него видно, насколько
  // стабильно правило «+12 модулей».
  const spares = rows
    .filter((r) => r.actualPanel !== undefined)
    .map((r) => r.actualPanel! - r.usedModules);
  if (spares.length) {
    const mean = spares.reduce((s, v) => s + v, 0) / spares.length;
    console.log(
      `Фактический запас в КП: в среднем ${mean.toFixed(0)} модулей, от ${Math.min(...spares).toFixed(0)} до ${Math.max(...spares).toFixed(0)} (правило инженеров — 12)`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
