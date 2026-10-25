/**
 * Проверка правил щита против готовых КП.
 *
 * Состав щита зависит от помещений и техники, которых в КП нет. Поэтому здесь в
 * наши формулы подаются фактические количества автоматов из самого КП: так
 * проверяются ровно два правила, а угадывание групп в замер не попадает.
 *   1. Число УЗО — по розеточным группам.
 *   2. Корпус щита — по занятости в модулях плюс запас.
 *
 * Примеры КП лежат локально в «Примеры КП/» и в репозиторий не кладутся.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { extractKpActuals } from "./extract-kp-actuals";
import { loadCalculationRules } from "../src/lib/catalog";
import { choosePanelSize, countPanelModules, countRcd } from "../src/lib/circuits";
import type { RcdRule } from "../src/lib/circuits";

const EXAMPLES_DIR = path.join(process.cwd(), "Примеры КП");

interface Row {
  name: string;
  breakers1p: number;
  socketGroups: number;
  threePhase: boolean;
  actualRcd?: number;
  ourRcd: number;
  usedModules: number;
  actualPanel?: number;
  ourPanel: number;
}

async function main() {
  if (!existsSync(EXAMPLES_DIR)) {
    console.error(
      `Папки «${path.basename(EXAMPLES_DIR)}» нет. Положите в неё готовые КП в PDF — ` +
        "в репозиторий они не кладутся.",
    );
    return;
  }

  const rules = loadCalculationRules();
  const w = rules.panelModuleWidths;
  const rcdRule = rules.formulas.rcd as RcdRule | undefined;

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
    // Четырёхполюсный ввод и три реле напряжения выдают трёхфазный щит: там УЗО
    // стоят на три полюса с нулём и занимают вдвое больше места.
    const inputPoles = items.inputPoles ?? 2;
    const threePhase = inputPoles === 4;

    // Розеточные группы — это все автоматы 16А: бытовые розетки, кухня,
    // кондиционеры, тёплые полы и датчик протечки.
    const ourRcd = countRcd(breakers16, rcdRule);

    // В занятость подставляется фактическая начинка из КП, чтобы проверялся
    // именно подбор корпуса, а не угадывание состава щита.
    const usedModules = countPanelModules(
      {
        breakers1p,
        inputBreakers: items.breakerInput ?? 1,
        rcd: items.rcd ?? ourRcd,
        contactor: items.contactor ?? 1,
        voltageRelay: items.voltageRelay ?? (threePhase ? 3 : 1),
        terminalRbd: items.terminalBlock ?? 4,
        neutralBus: rules.fixedItems.neutralBus ?? 0,
        threePhase,
      },
      w,
    );

    rows.push({
      name: file.replace(/\.pdf$/i, "").trim(),
      breakers1p,
      socketGroups: breakers16,
      threePhase,
      actualRcd: items.rcd,
      ourRcd,
      usedModules,
      actualPanel: items.panelModules,
      ourPanel: choosePanelSize(usedModules, w),
    });
  }

  console.log("=== Щит: наши правила против готовых КП ===\n");
  console.log(
    `${"Проект".padEnd(24)}${"1п авт".padStart(7)}${"УЗО КП".padStart(8)}${"наше".padStart(6)}${"модулей".padStart(9)}${"щит КП".padStart(8)}${"наш".padStart(6)}`,
  );

  let rcdTotal = 0;
  let rcdHit = 0;
  let panelTotal = 0;
  let panelHit = 0;

  for (const row of rows) {
    if (row.actualRcd !== undefined) {
      rcdTotal += 1;
      if (row.actualRcd === row.ourRcd) rcdHit += 1;
    }
    if (row.actualPanel !== undefined) {
      panelTotal += 1;
      if (row.actualPanel === row.ourPanel) panelHit += 1;
    }
    console.log(
      `${(row.name + (row.threePhase ? " (3ф)" : "")).padEnd(24)}${String(row.breakers1p).padStart(7)}${String(row.actualRcd ?? "-").padStart(8)}${String(row.ourRcd).padStart(6)}${row.usedModules.toFixed(1).padStart(9)}${String(row.actualPanel ?? "-").padStart(8)}${String(row.ourPanel).padStart(5)}${row.actualPanel === row.ourPanel ? " " : "*"}`,
    );
  }

  console.log(`\nУЗО: угадано ${rcdHit}/${rcdTotal}`);
  console.log(`Корпус щита: угадано ${panelHit}/${panelTotal}`);

  // Запас, который фактически оставляли в готовых КП: по нему видно, насколько
  // устойчиво правило «+12 модулей».
  const spares = rows
    .filter((r) => r.actualPanel !== undefined)
    .map((r) => r.actualPanel! - r.usedModules);
  if (spares.length) {
    const mean = spares.reduce((s, v) => s + v, 0) / spares.length;
    console.log(
      `Фактический запас в КП: в среднем ${mean.toFixed(0)} модулей, от ${Math.min(...spares).toFixed(0)} до ${Math.max(...spares).toFixed(0)} (правило — ${w.spare})`,
    );
  }

  // Сколько розеточных групп реально приходится на одно УЗО: это то самое
  // «3-4 автомата на УЗО», только измеренное по готовым КП.
  const ratios = rows
    .filter((r) => r.actualRcd !== undefined && r.actualRcd > 0)
    .map((r) => r.socketGroups / r.actualRcd!);
  if (ratios.length) {
    const mean = ratios.reduce((s, v) => s + v, 0) / ratios.length;
    console.log(
      `Групп 16А на одно УЗО в КП: в среднем ${mean.toFixed(2)}, от ${Math.min(...ratios).toFixed(2)} до ${Math.max(...ratios).toFixed(2)} (делитель в правилах — ${rcdRule?.perSocketGroups})`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
